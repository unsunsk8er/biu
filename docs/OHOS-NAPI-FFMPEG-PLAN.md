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

## 后续 ffmpeg 接入点

1. 获取/交叉编译 OHOS arm64 ffmpeg 静态库
2. 在 `native_audio.cpp` 增加 `transcodeToM4a(input, output)`
3. `BiuBridge` 优先调用原生转码，失败再回退 faststart
4. 原生 AVPlayer 用 `fd://` 播放输出文件
5. 保留 `libnative_audio.so` 的 NAPI 类型声明
