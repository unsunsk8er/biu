# HarmonyOS 原生音频播放（AVPlayer + AVTranscoder）

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
  → file:// 本地文件
  → ArkWeb 原生媒体接管
  → AVPlayer 通过 fd:// 播放本地 MP4
```

### 缓存桥

`platform/HarmonyOSPhone/entry/src/main/ets/common/BiuBridge.ets`

- `cacheAudioFile()` 下载 `.m4s`（`bilivideo.com` CDN 同样带 Referer/Origin）
- 缓存按稳定的 `bvid:cid` key 复用，重播同一首不再下载/转封装
- `transcodeAudioFile()` 使用 `media.createAVTranscoder()`
  - `fdSrc`：下载的 m4s
  - `fdDst`：`cacheDir/biu-audio-v3-<key>.mp4`
  - `fileFormat: CFT_MPEG_4`
  - `audioCodec: AUDIO_AAC`
  - `audioBitrate: 192000`
- 成功返回 MP4 路径并删除 raw m4s；失败保留 raw m4s 作为前台回退
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
`file://...mp4` 再 `loadSource`。这样 HTML 音频与原生 AVPlayer 使用同一个本地文件，
非同源 CDN 请求不再参与播放。

CSP 增加 `media-src ... file:`，否则 ArkWeb 会拒绝本地文件：

```text
Media load rejected by URL safety check
```

## 验证

真机 Mate 70 Pro：

- 首次播放：下载 + 转封装后开始，约数秒
- 播放中按 Home：`HpaeSinkInputNode` 保持 `RUNNING`，没有 `STOPPED/RELEASED`
- 返回应用：仍为播放状态
- 日志可见 AVPlayer `timeUpdate` / `durationUpdate` 和本地 MP4 路径
- 缓存目录生成约 5.5 MB 的 `biu-audio-*.mp4`

## 代价

- 首播前需要完整下载并转封装，启动比在线流慢
- 每首缓存增加约 5–8 MB
- 转封装失败时回退 raw m4s，后台播放不保证
