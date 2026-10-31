# HarmonyOS 原生音频播放（NAPI AVMuxer + AVPlayer）

> **当前状态（2026-10-31）**：后台播放已跑通。
>
> 关键链路：
> `m4s → AVTranscoder 落盘 → OHOS AVMuxer 重封装 AAC 轨为 M4A → 原生 AVPlayer(fd://)`
>
> 同时修复了：
> - `module.json5` 缺少 `backgroundModes: ["audioPlayback"]`
> - `javaScriptProxy` 的 `permission` 导致 `BiuHarmony` 代理整体不注入
> - `PlayerContext` 鸿蒙分支不再经过 HTMLAudio 的 loadSource/回退链
>
> 真机验证：按 Home 20 秒，`HpaeSinkInputNode` 保持 `RUNNING`，
> `hasBackgroundTask: 1`，没有 `AOC::Pause`。

## 问题

ArkWeb 在应用退到后台时会暂停 HTML `<audio>` 的媒体管线：

```text
AOC::Pause => (state=paused)
HpaeSinkInputNode ... RUNNING -> STOPPED -> RELEASED
```

前端状态仍是播放中，但音频已经停止。仅靠 ArkWeb 的
`KEEP_BACKGROUND_RUNNING` 无法解决。

同时，B 站 DASH 音轨是 `.m4s`（fragmented MP4），AVPlayer 直接播放会报：

```text
PIPELINE_ERROR_EXTERNAL_RENDERER_FAILED
```

## 方案

```text
B 站 m4s
  → BiuBridge 下载到 cacheDir（主 CDN 失败时自动尝试备用 CDN）
  → AVTranscoder 转封装为 MP4（AAC 192 kbps）
  → OHOS AVMuxer 重封装为 M4A
  → 独立原生播放分支
  → AVPlayer 通过 fd:// 播放 M4A
```

### 缓存桥

`platform/HarmonyOSPhone/entry/src/main/ets/common/BiuBridge.ets`

- `cacheAudioFile()` 下载 `.m4s`（`bilivideo.com` CDN 同样带 Referer/Origin）
- 缓存按稳定的 `bvid:cid` key 复用，重播同一首不再下载/转封装
- `transcodeAudioFile()` 使用 `media.createAVTranscoder()`
  - 先输出标准 MP4
  - 再调用 NAPI `remuxToM4a()`（AVDemuxer + AVMuxer）重封装 AAC 轨
  - `fdDst`：`cacheDir/biu-audio-v3-<key>.mp4`，最终返回 `.m4a`
  - `fileFormat: CFT_MPEG_4`
  - `audioCodec: AUDIO_AAC`
  - `audioBitrate: 192000`
- 成功返回 M4A 路径并删除 raw m4s；失败回退 faststart MP4
- 前端对主地址 + 备用 CDN 逐个重试，避免单个 CDN 超时导致一直转圈
- 缓存上限：最多 **20 首 / 250 MB**，超限按最旧文件淘汰

### 原生播放器

`platform/HarmonyOSPhone/entry/src/main/ets/common/NativeAudioPlayer.ets`

- 实现 `webview.NativeMediaPlayerBridge`
- 只接管 `MediaType.AUDIO`，视频交给 ArkWeb
- AVPlayer 不接受 `file://`；本地源通过打开缓存文件得到的 `fd://<fd>` 播放
- 提供 play/pause/seek/volume/mute/rate 和原生状态回传

`Index.ets` 开启：

```ts
.enableNativeMediaPlayer({ enable: true, shouldOverlay: false })
```

并在 `onPageBegin` 注册 `createNativeMediaPlayer`。

### 前端

`PlayerContext.tsx` 在 HarmonyOS 上先调用 `cacheHarmonyAudio()`，拿到转封装后的
`file://...m4a` 再交给独立原生播放分支。HTML audio 不参与鸿蒙播放，
因此不会触发 ArkWeb 的后台 `AOC::Pause`。

CSP 增加 `media-src ... file:`，否则 ArkWeb 会拒绝本地文件：

```text
Media load rejected by URL safety check
```

## 验证

真机 Mate 70 Pro：

- 首次播放：下载 + 转封装后开始，约数秒
- 播放中按 Home：`HpaeSinkInputNode` 保持 `RUNNING`，没有 `STOPPED/RELEASED`
- 返回应用：仍为播放状态
- 日志可见原生 AVPlayer 状态和本地 M4A 路径
- 缓存目录生成 `biu-audio-*.m4a`
- 按 Home 20 秒仍保持 RUNNING，`hasBackgroundTask: 1`

## 代价

- 首播前需要完整下载并转封装，启动比在线流慢
- 每首缓存增加约 5–8 MB
- 转封装失败时回退 raw m4s，后台播放不保证
