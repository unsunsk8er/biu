# 4 个 P0 处理记录（2026-10-30）

对应 [项目评估报告](./PROJECT-EVALUATION-2026-10.md) 中的 4 个 P0。本文只记录已落地的改动、验证证据与仍需人工完成的发布动作。

## P0-1 升级 Electron

| 项目 | 处理 |
| --- | --- |
| 版本 | Electron `36.9.5` → `45.1.0`（当前 latest） |
| 构建器 | electron-builder `26.0.0` → `26.18.0` |
| Node | 新增 `engines.node >= 22.12.0`；CI 从 Node 20 升到 24 |
| 构建目标 | Vite `target: chrome136` → `es2022`，不再绑定旧 Chromium 版本 |
| 兼容性 | 主进程 `tsc` 0 error；渲染层 2144 模块构建通过；Windows NSIS 安装包实际产出 |

说明：Electron 45 的 npm 包不再带 postinstall，首次 `require('electron')` 会按需下载运行时；CI 的 smoke 步骤会触发。缺少二进制时可用 `node node_modules/electron/install.js` 补装。

## P0-2 自动化测试与 CI 门禁

- 新增 Vitest 5 + happy-dom，`vitest.config.ts` 配置 `@` alias 与 `src/**/*.test.ts`。
- 新增 7 个测试文件、28 条用例：
  - `src/services/bilibiliApi.test.ts`：MD5 向量、WBI 排序/过滤/wts/w_rid、音质阶梯与带宽兜底、空流异常。
  - `src/services/lyrics.test.ts`：标题噪声清洗、CJK 括号提取、LRC 时间戳/小数/多标签/元数据。
  - `src/services/videoParts.test.ts`：单 P/多 P 的 id、标题、cid、URL、封面。
  - `src/utils/storage.test.ts`：歌单导入、重名、坏数据、导出信封、非法 JSON。
  - `src/utils/storageMigration.test.ts`：旧命名空间迁移、不覆盖新数据、只执行一次。
  - `src/services/errors.test.ts`：统一错误类型的字段与兜底文案。
  - `src/services/androidBiliApi.test.ts`：原生桥接调用不携带 JS 侧 csrf、API 错误映射为 `BiliApiError`。
- `npm test` 已加入 `npm run check` 与 CI；Linux CI 新增 `xvfb-run npm run smoke`（真实 Electron + 真实 dist/preload/托盘）。
- 为可测性导出了 `md5`、`signWbiQuery`、`orderedAudioStreams`（无行为变化）。

验证：`7 passed / 28 passed`。

## P0-3 签名、公证与自动更新

### 自动更新

- 新增 [electron/updater.ts](../electron/updater.ts)，使用 `electron-updater`：
  - 仅打包版启用；启动 20 秒后检查，之后每 6 小时一次。
  - 发现更新先询问，确认后下载；下载完成再次询问，确认后 `quitAndInstall`。
  - 失败只写主进程日志，不阻塞启动。
  - 托盘菜单新增「检查更新」；开发模式给出明确提示。
  - 开关：`BIU_DISABLE_UPDATES=1`、`BIU_ALLOW_PRERELEASE=1`。
- `package.json` 增加 `build.publish`（GitHub `unsunsk8er/biu`）；打包后自动生成 `resources/app-update.yml`。
- 实测 NSIS 构建产出 `latest.yml`、`.blockmap`、`app-update.yml`，且 `app.asar` 内含 `electron-updater`。

### 签名

- CI package 步骤读取 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`（Windows）与 `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD`（macOS，映射为 electron-builder 的 `CSC_*`），以及 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；未配置时构建未签名包，不再强制关闭 macOS 签名发现。
- macOS 开启 `hardenedRuntime` 与 `gatekeeperAssess: false`；凭据齐全时由 electron-builder 调用 `@electron/notarize` 自动公证。
- Android `release` 支持 `BIU_KEYSTORE_PATH` / `BIU_KEYSTORE_PASSWORD` / `BIU_KEY_ALIAS` / `BIU_KEY_PASSWORD`；未配置时打印警告并产出未签名 APK。
- Android 功能已在 HarmonyOS 7 卓易通真机验证（2026-10-30，重命名前与重命名后的 1.7.0 包均已复测；冷启动/登录/播放/通知/后台/收藏夹写 1–6 项全部通过；2.0.0 仅版本号变更）；仍缺正式 release keystore 签名与升级覆盖。
- 完整 secrets 表、验证命令、回滚策略见 [docs/RELEASE.md](./RELEASE.md)。

**仍需人工完成（无法在仓库内代办）**：提供真实 Windows/macOS 证书、Apple 凭据与 Android release keystore 并在 CI 产出签名包；用上一版安装包实际走一遍「检查更新 → 下载 → 重启安装」；Linux AppImage 与 macOS DMG 需在对应平台重新构建（本次只在 Windows 上验证了 NSIS）。

## P0-4 合规

| 项 | 处理 |
| --- | --- |
| 许可证 | 新增根目录 `LICENSE`（MIT），`package.json`、HarmonyOS `oh-package.json5` 同步 `license: MIT` |
| 第三方声明 | 新增 `NOTICE`：Electron/Chromium、React 系、字体、构建工具，以及 `platform/HarmonyOS` 中华为提供材料的授权边界 |
| 签名材料 | 删除 `build-profile.json5` 中的证书绝对路径与口令密文，`signingConfigs` 置空；改为 DevEco 本地配置 |
| 防回归 | `npm run verify` 新增：LICENSE/NOTICE 必须存在、package license 非空、鸿蒙 profile 不得含 `certpath`/`storePassword`/`keyPassword` |
| 文档 | README / README.en 增加许可证段；README-Android 增加签名环境变量；新增 RELEASE.md |

**仍需人工确认**：`platform/HarmonyOS/docs` 中华为 PDF/ZIP 的再分发条款（NOTICE 已声明不属 MIT 范围）；鸿蒙 `bundleName` 仍是示例值，改动会影响签名与安装，留待 DevEco 中确认。

## 验证矩阵

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过（renderer + electron） |
| `npm run verify` | 通过：29 通道 + 新增合规检查 |
| `npm test` | 28/28 通过 |
| `npm run build` | 通过：2144 模块；main.js 55.37 KB |
| `npx electron-builder --win nsis --x64 --publish never` | 通过：`biu-Setup-1.7.0-x64.exe` 116.5 MB、`.blockmap`、`latest.yml`、`app-update.yml` |
| 打包内容 | `app.asar` 含 `LICENSE`、`NOTICE`、`electron-updater`；`main.js` 以外部依赖加载 updater |
| `npm audit --omit=dev` | 0 漏洞 |
| `npm run smoke` | 当前非交互会话无法启动 GUI（Electron 36 同样失败）；已加入 CI Linux xvfb 步骤，首次流水线需确认结果 |

## 已知遗留（不属本次 P0）

- `platform/HarmonyOS/AppScope/app.json5` 仍是 `com.mikannqaq.bilimusic` / 1.0.0，需在 DevEco 确认后改。
- 完整 `npm audit` 仍有构建工具链告警；随包发布的运行时依赖为 0。
- 渲染层双数据通路（CORS 补丁）与 `PlayerContext` 拆分属于 P1，未在本次改动。
- 本记录完成时版本为 1.7.0；2026-10-30 已按发布决定升级为 2.0.0（Android versionCode 140）。
