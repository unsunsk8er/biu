# 归档：已弃用平台

这里的代码从活动工程移出，**不再构建、不再维护、不再进入 CI**。

保留目的：

- 追溯桌面端 / Android / 鸿蒙 PC 端的历史实现
- 需要时参考旧的播放、代理、打包逻辑

## 目录

| 路径 | 原平台 |
| --- | --- |
| `legacy/android/` | Android WebView 工程 |
| `legacy/electron/` | Electron 主进程 / preload / 桌面 API |
| `legacy/platform-HarmonyOS/` | 鸿蒙 PC 端工程 |
| `legacy/web-ui/` | 已移除的 React/Web UI、Vite 构建、WebView 测试 |
| `legacy/electron-build/` | electron-builder 图标与打包资源 |
| `legacy/scripts/` | Android / Electron / 鸿蒙 PC 构建与冒烟脚本 |
| `legacy/workflows/build.yml` | 桌面多平台 CI |
| `legacy/docs/` | Android 与英文桌面文档 |
| `legacy/tsconfig.electron.json` | Electron 类型检查配置 |

## 注意

- 这些目录中的路径、依赖和脚本可能已与当前 `package.json` 不兼容。
- 不要把这里的代码重新接回活动构建；需要恢复某个平台时，应单独开分支。
- 二进制产物（旧 APK、桌面安装包）不在仓库内，已移到本地 `.archive/legacy-releases/`。
