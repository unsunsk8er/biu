# 工程改进记录（2026-10）

依据上一轮代码分析中给出的「止血 → 一致性 → 持续性」路线实施。本文件只记录实际落地的改动、验证方式与仍未覆盖的风险。

## 一、已实施

### P0

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| 修复 CI 断链 | `.github/workflows/build.yml` | 删除调用不存在脚本的 `build-ota.mjs` 步骤与 `release/ota/**` 上传项；OTA 相关注释同步清理 |
| 移除更新残留 | `vite.config.ts` | 主进程不再 external 未安装、也无代码引用的 `electron-updater` |
| 类型门禁 | `package.json`、`tsconfig.electron.json`、CI | 新增 `npm run typecheck`（renderer + electron 两个 project），CI 在 build 前执行 |
| 静态门禁 | `scripts/verify.mjs`、`package.json`、CI | 零依赖校验：preload ↔ handler 通道对齐、敏感 handler 必须有发送方校验、禁止 `nodeIntegration:true`/`contextIsolation:false`、渲染层禁止 `console.log`；`npm run check` 串联 typecheck |
| 修正 electron 类型错误 | `electron/biliApi.ts`、`electron/coverApi.ts` | 18 处 `unknown` / 缺字段错误；`throw {}` 改为 `BiliApiError` |
| 托盘窗口隔离 | `electron/main.ts`、`electron/tray-preload.cjs`、`electron/trayHtml.ts` | `nodeIntegration:true + contextIsolation:false` → `contextIsolation:true + sandbox:true` + 最小 preload；新增导航/新窗口拦截；220 行托盘 HTML 从 main.ts 拆出，并补上 `default-src 'none'` 的 CSP |
| 运行时冒烟 | `scripts/smoke/`、`package.json` | 隐藏窗口加载真实 `dist/` 与真实 preload；同时把 `electron/trayHtml.ts` 现场转译后以 data: URL + sandbox preload 加载，验证托盘渲染与按钮 IPC。命令：`npm run smoke` |

### P1

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| IPC 通道收口 | `electron/preload.cjs`、`electron/biliApi.ts`、`src/types/electron.d.ts` | 删除 9 个已无调用方的 B 站代理通道（search / videoDetail / playUrl / nav / popular / recommend / musicRanking / favorites / extractAudio）与 `downloadAudio`；IPC handler 42 → 29 |
| 敏感 IPC 校验 | `electron/security.ts` + 各 handler | 主窗口/托盘面板登记为受信 webContents；登录态、持久化、外链、歌词、封面等通道拒绝未登记发送方 |
| 权限与沙箱 | `electron/main.ts` | 主窗口显式 `sandbox: true`；拒绝全部 Web 权限请求/检查；全局拦截 `<webview>` 挂载与默认 `window.open` |
| Cookie 零回传 | `electron/biliApi.ts`、`src/types/electron.d.ts` | `bili:getCookies` 只返回 `isLoggedIn`，不再回传 SESSDATA / csrf / mid |
| Cookie 降暴露 | `electron/biliApi.ts`、`src/services/api.ts` | `bili:getCookies` 不再回传 SESSDATA，只返回登录态与 csrf |
| 存储一致性 | `src/utils/storage.ts`、`PlayerContext.tsx`、`AuthContext.tsx`、`AppErrorBoundary.tsx` | 最近播放/喜欢/歌单/播放状态/音量/用户缓存统一走 `readStoredItem` / `writeStoredItem`，HarmonyOS 持久层不再只写不读 |
| 音质设置生效 | `src/services/bilibiliApi.ts`、`PlayerContext.tsx` | `playQuality` 接入取源：标准/高品质/无损各自的目标码率阶梯，目标不可用时按带宽回退 |
| 下载空壳处理 | `src/pages/Settings.tsx`、`src/pages/Downloads.tsx`、`electron/main.ts` | 删除无效的「下载目录 / 下载音质」设置与「打开目录」按钮，移除 `app:get-paths`、`dialog:choose-directory`、`shell:open-audio-folder` 三个 handler；桌面端明确提示离线下载仅 Android |
| Android 构建可复现 | `scripts/build-android.mjs`、`package.json`、`README-Android.md` | 不再硬编码 `./.android-tools/...`；按 `BIU_GRADLE` → 仓库内 Gradle → PATH 解析；新增 `android:release` |

### P2

| 改动 | 文件 | 说明 |
| --- | --- | --- |
| 仓库卫生 | `.gitignore`、`.archive/logs/` | 忽略 `*.log`、`android/**/build`、`android/local.properties`、`assets/www`、`.archive/`；277 个根目录构建日志归档到 `.archive/logs/` |
| 死代码 | `src/hooks/usePlayer.ts`、`src/pages/Recommend.tsx` | 两个无引用文件删除 |
| 死配置与缓存上限 | `src/types/index.ts`、`src/utils/storage.ts`、`src/pages/Search.tsx` | 删除已无 UI 的 `downloadDir/downloadQuality` 设置与迁移代码；`videoDetailCache` 增加 100 条上限，避免长会话内存膨胀 |
| 包体 | `src/App.tsx`、`vite.config.ts` | 登录弹窗改为懒加载（二维码库随之拆出）；React / Router / Motion / 图标拆独立 vendor chunk |
| 播放页重渲染 | `src/components/NowPlaying.tsx` | 把 4Hz 的 `usePlayerProgress` 从 1059 行页面根组件下沉到 `NowPlayingProgress` 与 `LyricsPanelWithProgress` 两个叶子组件；播放进度/歌词高亮更新不再触发整页重渲染 |
| 文档同步 | `README.md`、`README.en.md`、`README-Android.md` | 修正数据通路、音质说明、下载设置、项目结构、包名、AppImage 版本号、`typecheck` 脚本 |

## 二、验证

| 验证项 | 结果 |
| --- | --- |
| `tsc --noEmit -p tsconfig.json`（renderer） | 0 error |
| `tsc --noEmit -p tsconfig.electron.json`（主进程，首次纳入） | 0 error |
| `node --check`（preload / tray-preload / 构建脚本） | 通过 |
| GitHub Actions YAML 解析（js-yaml） | 通过；steps 顺序为 install → typecheck → build → package → upload |
| preload 通道 ↔ 主进程 handler 交叉检查 | 29 / 29 全部匹配（已固化为 `npm run verify`） |
| 静态门禁 `npm run verify` | 通过：通道对齐、敏感 handler 校验、窗口/权限/Cookie/日志规则；注入违规探针后能正确失败 |
| 音质选择功能测试 | 编译 `bilibiliApi.ts` 为 CommonJS 后断言：标准→30216、高品质→30280、无损在无 Hi-Res 时回退 30280、有 30251 时选 Hi-Res、未知档位回退到带宽最高流，全部通过 |
| `vite build` | **通过**：2144 modules，产物见下方指标；CSP 已注入 `dist/index.html` |
| `npm run smoke`（真实 Electron，隐藏窗口） | **通过**：渲染层显式 `sandbox: true` 下首屏 189 节点、0 console error；种入播放状态后展开沉浸页，进度控件按状态渲染 `0:42 / -2:38`（207 节点）；真实托盘页 5 个按钮、标题经 IPC 渲染、点击播放发出 `toggle-play`、0 警告；截图 `scripts/smoke/out/renderer.png`、`now-playing.png` |
| 产物完整性 | `dist-electron/main.js` 51.6 KB；`tray-preload.cjs` 已随 copy 步骤落到 `dist-electron`；main.js 内嵌 tray-preload 路径 |

### 构建环境说明

工作区的 `node_modules` 是在 Linux 上安装的，只带 Linux 原生二进制。本机是 Windows，最初 `vite build` 在加载 rollup 原生模块时就失败（`MODULE_NOT_FOUND`）。通过 Node 直接补齐 win32 原生包（`@rollup/rollup-win32-x64-msvc`、`@esbuild/win32-x64`、`@tailwindcss/oxide-win32-x64-msvc`、`lightningcss-win32-x64-msvc`，只写入 `node_modules`，不改 lockfile）后，构建已成功执行。

注意：`node_modules` 内的补装不属于仓库内容；CI 的 `npm ci` 会按平台安装正确二进制，不受影响。

冒烟测试使用 Electron 36.9.5 的 win32 运行时（临时下载，未入库）；`npm run smoke` 在具备可运行 Electron 的开发机上即可复跑，CI 暂未接入（需要 xvfb 与 `--no-sandbox`）。

因此本轮验证为「类型级 + 静态级 + 产物级 + 启动级」，**真实交互（托盘点击、登录、播放）仍未验证**。

## 三、指标对比

| 指标 | 改进前 | 改进后 |
| --- | --- | --- |
| IPC handler 数 | 42 | 29（-31%） |
| preload 暴露通道 | 42（含 13 个死通道） | 29（全部有调用方） |
| `electron/main.ts` | 56.4 KB | 48.6 KB（另拆出 `trayHtml.ts` 8.3 KB） |
| 首屏 JS 体积 | 541,277 B（单 chunk） | 519,432 B（index + 4 个 vendor，且并行加载） |
| 登录弹窗 JS | 在主 chunk 内 | 28,673 B 独立 chunk，点击登录才加载 |
| 构建 CSS | 233,858 B | 223,736 B（gzip 36.5 KB） |
| `dist-electron/main.js` | 51 KB | 51.9 KB |
| 根目录 `*.log` | 277 | 0 |
| 主进程类型检查 | 未纳入 | 纳入，当前 0 error |
| 播放音质设置 | 无实际作用 | 参与取源排序 |
| `!important` / CSS 源 | 约 1.3k 处 / 272 KB | 未变（本轮未动样式） |

## 四、桌面端人工验收（2026-10-29）

用真实 Electron 36.9.5 + 实际 `dist/` 启动应用，通过 CDP 驱动完成一轮交互验收：

| 验收项 | 结果 |
| --- | --- |
| 首屏渲染 | 通过（189 节点，21 个 preload API） |
| 设置页 | 通过：音质仍在，废弃的「下载目录/下载音质」已消失 |
| 搜索「周杰伦」 | 通过：20 条结果，标题/播放量/时长正常 |
| 播放（多 P 视频） | 通过：选 P 后开始播放，封面、进度、歌词同步显示（夜曲，0:10 / -3:37） |
| 沉浸播放页 | 通过：封面/歌词/进度/控件齐全 |
| 扫码登录弹窗 | 通过：二维码正常生成（passport 网络可达） |
| 下载页 | 通过：桌面端提示「离线下载当前仅在 Android 端提供」 |
| 系统托盘 | **未自动化**：需要真实点击任务栏托盘图标，留给人工 |

验收中发现并修复了一个真实缺陷：**干净配置下 userData 目录不存在时，Chromium 单实例锁创建失败，应用直接退出**。现在启动时先 `mkdir`，并支持 `BIU_USER_DATA_DIR` 指定便携/测试目录。

截图：`.archive/e2e/out/01-home.png` … `08-playing.png`（本地归档，未入库）。

## 五、未完成与风险

1. **托盘交互仍需人工**：「点系统托盘图标弹出面板、失焦隐藏、多屏定位」依赖真实桌面，自动化未覆盖。
2. **移动端/鸿蒙未验收**：本轮只跑桌面端；Android 的离线缓存、通知栏、返回手势与鸿蒙持久化仍需真机。
3. **权限模型是“全拒绝”**：目前播放器不需要任何 Web 权限。未来若要用剪贴板、系统通知、媒体设备等，必须在 `setPermissionRequestHandler` 里按来源加白名单，而不是整体放开。
4. **CSS 未治理**：`!important`、重复断点、`.app-shell` 重复定义仍在；属于独立的设计系统重构任务。
4. **合规项未动**：仓库仍无 LICENSE；`platform/HarmonyOS` 内仍带华为运行时与 PDF/zip 且无 NOTICE；`build-profile.json5` 仍有开发机证书路径与口令密文。
5. **鸿蒙身份未改**：`AppScope/app.json5` 仍是示例 `com.mikannqaq.bilimusic` / 1.0.0；改动会影响签名与安装，需在 DevEco 中确认后再做。
6. **CI 仍只构建桌面三平台**：Android 未进 CI；`release/` 中 500 MB 历史产物未清理（已在 gitignore 内，不随仓库分发）。
7. **方向性遗留**：B 站数据仍由渲染进程直连 + 主进程改写 CORS。本轮已删除死通道，但「统一为单一通道」需要先给主进程补 WBI 签名，属于下一阶段。
