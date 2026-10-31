# biu

> 基于 Bilibili 的 HarmonyOS 手机音乐播放器。  
> 纯原生 ArkUI + ArkTS，自用项目，不做分发。

## 架构

```text
ArkUI 原生页面
  ├─ 搜索 / 歌单 / 下载 / 设置
  ├─ 播放页 / 歌词 / 迷你播放栏
  ├─ ArkTS 数据层（HTTP / WBI / Cookie / Preferences）
  └─ 原生音频
       ├─ AVPlayer
       ├─ AVTranscoder + NAPI AVMuxer（m4s → M4A）
       └─ audioPlayback 后台任务
```

当前版本已移除 ArkWeb WebView、`rawfile/www`、React/Vite 构建链和 JS 桥。

## 功能

- B 站原生搜索
- 原生播放页 / 进度控制 / 暂停继续
- 原生播放队列、上一首/下一首、随机/循环、队列页
- 原生歌词获取、LRC 解析、高亮滚动
- 原生迷你播放栏，收起播放页后继续播放
- 原生歌单与原生 Preferences 存储
- 原生收藏 / 最近播放
- 原生 B 站扫码登录
- 原生封面匹配
- 原生下载列表、旧缓存扫描与离线播放
- 原生设置（主题 / 音质 / 歌词 / 封面 / 缓存）
- 鸿蒙后台播放

## 目录

```text
platform/HarmonyOSPhone/   鸿蒙手机应用（活动代码）
  entry/src/main/ets/
    pages/                 原生页面
    common/                API / 音频桥 / 存储
    cpp/                   NAPI AVMuxer
archive/legacy/web-ui/     已归档的 React/Web 版本
archive/legacy/            其他历史平台
scripts/                   HAP 构建与真机冒烟
release/                   HAP 产物
```

## 构建

要求：

- Node.js >= 22.12
- DevEco Studio / HarmonyOS SDK

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

真机冒烟：

```bash
npm run smoke:harmony
```

## 说明

- 依赖 B 站接口、歌词第三方服务；外部服务变化可能导致局部功能失效。
- 原生音频链路依赖设备系统能力，鸿蒙系统升级后建议回归一次后台播放。
- Web/React 版本不会再参与构建，仅保留在归档中。
