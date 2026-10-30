# P1 进展记录（2026-10-30）

P0 完成后继续处理评估中的 P1。本轮完成 **Android 桥接加固**、**统一错误模型**、**ESLint 门禁**；WBI 单通道、`PlayerContext`/`main.ts` 拆分与 CSS 治理仍未开始。

## 1. Android 桥接加固（P1-2）

| 改动 | 位置 |
| --- | --- |
| 记录本地资源服务 origin，新增 `isTrustedPage()` | `MainActivity.java` |
| `shouldInterceptRequest` 只对本地打包页面启用 B 站代理 | `MainActivity.java` |
| 主框架导航只放行当前本地 origin，其他 URL 交给系统浏览器 | `MainActivity.java` |
| 所有 `@JavascriptInterface` 方法先校验调用页面 | `MainActivity.java` |
| 移除 `getBiliCsrf()`，CSRF 改由原生 `postBili` 从 CookieManager 注入 | `MainActivity.java`、`androidBiliApi.ts` |
| `openExternal` 只接受 http/https | `MainActivity.java` |
| `allowBackup=false`，移除全局 `usesCleartextTraffic`（仅保留 127.0.0.1 的 network config） | `AndroidManifest.xml` |

影响：远程 iframe/页面无法再借用本地 WebView 的 Cookie 代理或 JS bridge 发起 B 站写操作；CSRF token 不再暴露为页面可读字符串。

2026-10-30 真机回归修复：初版 `isTrustedPage()` 在 `shouldInterceptRequest`（WebView IO 线程）和 JS bridge 线程里调用 `webView.getUrl()`，在鸿蒙 7 卓易通上启动即闪退。现改为 UI 线程在 `onPageStarted`/`onPageFinished` 维护 `volatile trustedPage`，非 UI 线程只读标志；同时恢复 `usesCleartextTraffic="true"`（本地资源服务使用 `http://127.0.0.1`，部分兼容层只认应用级标志），release 签名补回 v3。修复包 SHA-256 见 [Android 验收清单](./ANDROID-VERIFY-CHECKLIST.md)。

Android 编译：工具链已补齐，`npm run android:build` 与 `npm run android:release` 均 `BUILD SUCCESSFUL`；环境搭建、临时密钥验证与产物见 [Android 构建记录](./ANDROID-BUILD-2026-10.md)。2026-10-30 已在 HarmonyOS 7 卓易通真机验证通过（重命名前的包与重命名后的 1.7.0 包均已复测；2.0.0 仅版本号变更）：冷启动、扫码登录、搜索播放、通知栏/锁屏、后台 10 分钟、收藏夹写操作（含原生 CSRF 注入）。正式 release keystore 签名与升级覆盖仍未验证。

构建脚本同时修复了两个 Windows/受限环境问题：Node 24 不能直接 spawn `.bat`（改为 `cmd.exe`），以及自动发现 `.android-tools` 下的 JDK/SDK/Gradle 并使用工作区内的 `GRADLE_USER_HOME`/`ANDROID_USER_HOME`/`TEMP`。

## 2. 统一错误模型（P1-6）

- 新增 `src/services/errors.ts`，导出 `BiliApiError`（`name`、`code`、`path`、`stack`）。
- `src/services/bilibiliApi.ts`、`androidBiliApi.ts`、`api.ts` 统一使用该类；删除 `throw { code, message, path }` 裸对象与重复的 `AndroidBiliApiError`。
- `BiliApiError` 不再把 `BiliBili API Error [code]:` 拼进用户可见文案；`syncErrorMessage` 可直接展示 B 站原始 message。
- 新增 `src/services/errors.test.ts`（错误类型字段/兜底文案）与 `src/services/androidBiliApi.test.ts`（桥接请求不携带 JS 侧 csrf、API 错误映射为 `BiliApiError`）。

## 3. ESLint 门禁（P1-6）

- 新增 `eslint.config.js`（ESLint 10 flat config + typescript-eslint 8）。
- 规则取舍：
  - `no-undef` / `no-unused-vars` 关闭，交给 `tsc`，避免重复误报。
  - `@typescript-eslint/no-explicit-any` 为 warning（当前 35 条），`--max-warnings 40` 防止继续增长。
  - 渲染层 `no-console` 仅允许 `warn`/`error`；CJS preload/冒烟脚本关闭 `no-require-imports`。
- `npm run lint` 加入 `npm run check` 与 CI。
- 顺手修复的既有问题：`PlayQueue` 三元表达式副作用、`Sidebar` 空对象解构、`useLyrics` 失效的 eslint-disable、`coverApi`/`coverMatchQuery` 多余转义、`PlayerContext` 定时器 `prefer-const` 误报。

## 4. 验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过（同时把 renderer target/lib 升到 ES2022，支持 `Error.cause`） |
| `npm run verify` | 通过 |
| `npm run lint` | **0 error / 35 warning**（warning 均为 `any`，上限 40） |
| `npm test` | **7 文件 / 28 用例通过** |
| `npm run build` | exit 0；main.js 55.38 KB |
| Android 编译 | **通过**：debug 0.77 MB、release 0.70 MB，均 `BUILD SUCCESSFUL`；详见 [Android 构建记录](./ANDROID-BUILD-2026-10.md) |
| Android 真机验收 | **通过**（HarmonyOS 7 卓易通）：冷启动/登录/播放/通知/后台/收藏夹写 1–6 项全部通过 |

## 5. 发布决定（2026-10-30）

- **发布身份：只自用**，不做正式代码签名；Android 继续使用本地 `CN=biu Verification`，Windows/macOS 未签名。
- **版本：2.0.0**（品牌重启），Android `versionCode=140`。
- **更新源：`unsunsk8er/biu`**（`package.json build.publish`，已反映到 `app-update.yml`）。
- 已按 2.0.0 重建 Android APK、Windows NSIS 安装包与便携 ZIP；1.7.0 产物归档到 `.archive/`。

## 6. 下一步（仍未完成）

1. **WBI 单通道**：按 `docs/WBI-PLAN.md` 把搜索/详情/播放地址收到主进程，删除 CORS 补丁；需要真实网络与运行时验证。
2. **`PlayerContext` 拆分**：1572 行、约 30 个 effect；先补播放状态机测试再拆。
3. **`main.ts` 拆分**：窗口/托盘/协议/迁移分离。
4. **CSS 治理**：12k 行、1378 个 `!important`；需要视觉回归。
5. **可访问性与 i18n**：见评估报告 P2。

这些改动回归面较大，建议在有可运行 Electron 桌面与真实账号的环境中进行，而不是继续在没有运行时验证的情况下推进。
