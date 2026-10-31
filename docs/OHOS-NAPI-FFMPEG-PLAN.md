# OHOS 原生音频 NAPI 工程

## 已完成

- `entry/src/main/cpp/` NAPI 模块 `native_audio`
- `CMakeLists.txt` 链接 `libace_napi.z.so`
- HAP 内已打包 `libs/arm64-v8a/libnative_audio.so`
- 首个原生能力：**MP4 faststart 重排**
  - 将 `moov` 移到 `mdat` 前
  - 修正 `stco` / `co64` chunk offset
  - 输出 `*.fast.mp4`
- `BiuBridge` 转封装完成后可调用该模块

## 验证

```text
device cache:
biu-audio-v3-<key>.mp4
biu-audio-v3-<key>.fast.mp4
```

NAPI 调用成功生成了 faststart 文件。

## 未解决

AVPlayer 播放 faststart 文件仍会立即暂停，说明问题不只是 `moov` 位置，还涉及：

- B 站 DASH 音轨的编码/时间轴
- AVPlayer 对纯音频 MP4 的兼容性
- ArkWeb 原生接管生命周期

下一步需要真正的转码/解封装（ffmpeg 或 OHOS AVCodec 重封装），而不是只做容器重排。

## 关键发现

- `module.json5` 缺少 `backgroundModes: ["audioPlayback"]` 时：
  - `startBackgroundRunning` 不生效
  - 系统日志 `hasBackgroundTask: 0`
  - 音频一进后台就被暂停
- `javaScriptProxy` 配置 `permission` 会导致当前 HAP 中 `BiuHarmony` 整体不注入；
  移除 `permission` 后代理恢复（`Object.keys` = 11）。
- 持久化后台任务需要 `backgroundModes`，与权限 `KEEP_BACKGROUND_RUNNING` 同时存在。

## 仍待解决

即使后台任务已显示 `hasBackgroundTask: 1`，原生 AVPlayer 在 Home 后仍会在一段时间后暂停。
下一步需要检查：

- 原生播放器是否绑定 AVSession / 音频焦点
- `OH_AVPlayer_SetAudioInterruptMode`
- 暂停是否来自 ArkWeb/JS 的 pause 指令
- 连续任务与 AVPlayer 的会话生命周期

## 最终状态（已完成）

- AVMuxer 重封装 AAC 轨为 M4A 成功
- `PlayerContext` 鸿蒙分支改为独立原生状态机
- `backgroundModes: ["audioPlayback"]` 已注册
- 代理 `permission` 已移除，`BiuHarmony` 正常注入
- 真机验证：Home 后 `HpaeSinkInputNode` 保持 `RUNNING`，
  `hasBackgroundTask: 1`，无 `AOC::Pause`

## 历史定位

真机日志确认：后台任务已成功注册（`hasBackgroundTask: 1`），但暂停来自 JS 侧
`NativeAudioElement.pause()`，调用栈落在 `PlayerContext` 的 `loadSource` 清理/失败路径，
不是系统后台任务直接暂停。

下一步应把原生播放从 `PlayerContext` 的 HTML audio 加载/回退时序中解耦：

- 原生播放器独立于 `loadSource` 的超时/回退逻辑
- 不再通过 `audio.pause()` 控制原生播放器
- 播放成功事件直接同步 `isPlaying/progress`
- 仅在切歌/用户暂停时停止原生播放器

## 后续 ffmpeg 接入点

1. 获取/交叉编译 OHOS arm64 ffmpeg 静态库
2. 在 `native_audio.cpp` 增加 `transcodeToM4a(input, output)`
3. `BiuBridge` 优先调用原生转码，失败再回退 faststart
4. 原生 AVPlayer 用 `fd://` 播放输出文件
5. 保留 `libnative_audio.so` 的 NAPI 类型声明
