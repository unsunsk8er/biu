# biu

> 基于 Bilibili 的 HarmonyOS 手机音乐播放器。  
> 自用项目，不做分发。

## 当前范围

本项目现在**只维护 HarmonyOS 手机端**。

保留：

- `src/`：共享的 React Web UI
- `platform/HarmonyOSPhone/`：鸿蒙手机壳、原生音频、NAPI
- `scripts/`：鸿蒙手机端构建与设备测试脚本

已归档：

- `archive/legacy/android/`：Android 工程
- `archive/legacy/electron/`：Electron 桌面端
- `archive/legacy/platform-HarmonyOS/`：鸿蒙 PC 端工程
- `archive/legacy/electron-build/`：桌面打包资源
- `archive/legacy/scripts/`、`archive/legacy/workflows/`、`archive/legacy/docs/`

归档代码仅用于追溯，不再构建、不再维护。

## 功能

- B 站搜索、视频/合集分P播放
- 封面、标题、歌手匹配
- 自动歌词
- 队列、随机、循环、收藏
- 下载/离线缓存
- 鸿蒙原生后台播放
- 回前台不中断、暂停后原地继续
- 歌单 / 下载 / 设置页面

## 架构

```text
B 站 m4s
  → 原生下载
  → AVTranscoder 转 MP4
  → OHOS AVMuxer 重封装 M4A
  → 原生 AVPlayer（fd://）
  → audioPlayback 后台连续任务
```

UI 与播放控制仍由共享的 React 代码提供；鸿蒙侧通过 `BiuHarmony` 桥接原生播放、请求代理和媒体会话。

## 开发

要求：

- Node.js >= 22.12
- DevEco Studio / HarmonyOS SDK
- 可选：连接鸿蒙手机用于真机验证

```bash
npm install
npm run dev          # 浏览器调试 Web UI
npm run typecheck
npm run lint
npm test
npm run check
```

## 构建 HAP

```bash
npm run harmony:phone:build
```

产物：

```text
release/biu-2.0.0-harmony-phone.hap
```

正式包：

```bash
npm run harmony:phone:release
```

## 真机验证

```bash
npm run smoke:harmony
npm run e2e:harmony
```

## 说明

- 本项目依赖 B 站接口、歌词与曲库第三方服务；外部服务变化可能导致局部功能失效。
- 原生音频链路依赖设备系统能力，系统升级后建议回归一次后台播放。
- 历史平台代码已归档，不再参与 `npm run check`、Web 构建或 HAP 构建。
