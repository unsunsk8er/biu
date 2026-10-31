# biu 2.0.0 纯原生归档

归档日期：2026-10-31  
提交：`8f5e40e`  
平台：HarmonyOS 手机端

## 归档产物

- `release/biu-2.0.0-harmony-phone.hap`
- HAP SHA-256：`c3f59cfce1f5670a054975d469bb7c45af2b7777f4f4c664334bd357a7fe7841`
- 源码归档：`release/biu-2.0.0-native-source.zip`

## 架构

- 纯原生 ArkUI + ArkTS
- 无 WebView、无 `rawfile/www`
- 无 React / Vite 构建链
- 原生 AVPlayer + AVTranscoder + NAPI AVMuxer
- 原生 Preferences 数据层

## 已实现功能

- 原生搜索
- 原生播放页 / 进度 / 暂停
- 原生播放队列 / 上一首 / 下一首 / 随机 / 循环 / 队列页
- 多P视频展开到队列，按 cid 播放
- 原生歌词 / LRC / 高亮滚动
- 原生迷你播放栏
- 原生歌单
- 原生收藏 / 最近播放
- 原生下载 / 旧缓存扫描 / 离线播放
- 原生设置
- 原生 B 站扫码登录
- 原生封面匹配
- 鸿蒙后台播放 / 锁屏 / 通知栏

## 已知限制

- 扫码登录成功路径未在本次会话中由真实 B 站 App 扫码验证；已提供手动 Cookie 登录后备。
- 旧 Web localStorage 在 WebView 移除后无法自动读取；混合阶段迁移过的数据与旧缓存文件已保留。
- 历史 React / Android / Electron / 鸿蒙 PC 代码在 `archive/legacy/`，不再参与构建。

## 构建

```bash
npm run harmony:phone:build
```

要求 Node.js 与 DevEco Studio / HarmonyOS SDK。
