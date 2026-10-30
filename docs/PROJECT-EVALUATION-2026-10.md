# biu 项目评估报告

> 更新（2026-10-30）：报告中列出的 4 个 P0 已处理，改动与验证见 [P0 处理记录](./P0-COMPLETION-2026-10.md)；P1 的 Android 桥接、错误模型与 ESLint 进展见 [P1 进展记录](./P1-PROGRESS-2026-10.md)。本报告保留评估时的原始判断，便于对照。

- 评估日期：2026-10-30
- 评估对象：biu 1.7.0（工作区当前状态）
- 评估方式：源码通读 + 类型/静态门禁 + 构建实测 + 依赖审计；未做真实账号登录与线上播放验收
- 参考基线：[工程改进记录（2026-10）](./ENGINEERING-REVIEW-2026-10.md)、[WBI 单通道改造计划](./WBI-PLAN.md)

---

## 一、结论

**biu 是一个完成度与工程规范都明显高于同类个人 Electron 项目的桌面音乐播放器，当前处于「可发布的准生产级」。**

它的安全基线、构建门禁、文档质量和跨端适配意识是真正的亮点；主要短板不在功能，而在**可持续性**：零自动化测试、Electron 运行时已过支持期、分发链路未签名且没有更新通道、以及若干合规缺口。这些问题不会阻止 1.7.0 被使用，但会阻止它被长期、安全地维护。

**综合评分：6.7 / 10**

| 维度 | 权重 | 得分 | 判断 |
| --- | ---: | ---: | --- |
| 产品完成度与体验 | 20% | 8.5 | 功能闭环完整，细节丰富，已形成自己的设计语言 |
| 架构与可维护性 | 20% | 6.5 | 分层清晰，但存在 God Component、双数据通路、巨型 CSS |
| 安全与隐私 | 15% | 7.5 | Electron 基线扎实；CORS 补丁与 Android 桥接是主要扣分项 |
| 测试与质量门禁 | 15% | 4.0 | 类型/静态门禁优秀，但项目内零自动化测试 |
| 性能 | 10% | 7.5 | 首屏体积可控，已有针对性优化；CSS 与动画仍有压缩空间 |
| 跨平台与发布 | 10% | 6.0 | Windows/Linux/Android 有产物；macOS 与 HarmonyOS 未验证 |
| 文档 | 5% | 8.5 | README 双语、Android 文档、工程记录与改造计划齐全 |
| 合规 | 5% | 3.0 | 无 LICENSE、签名材料入库、厂商运行时无 NOTICE |

> 评分用于横向比较与排优先级，不作为投资/采购尽调结论。

---

## 二、项目基线

| 项目 | 内容 |
| --- | --- |
| 定位 | 把 Bilibili 视频整理成桌面音乐资料库的播放器，华为音乐视觉风格 |
| 版本 | 1.7.0（Android versionCode 139） |
| 技术栈 | React 19 + TypeScript 5.8 + Vite 6 + Electron 36 + Tailwind 4 + framer-motion |
| 端 | Windows / macOS / Linux（Electron）、Android（WebView + 原生媒体服务）、HarmonyOS PC（Electron 适配工程） |
| 源码规模 | `src` + `electron` + `scripts` 共 73 个文件、28,458 行（其中 TS/TSX 15,665 行，CSS 12,105 行） |
| 构建产物 | `dist` 25 个文件、1.25 MB；`dist-electron/main.js` 52 KB |
| 本地发布物 | `release/` 约 482 MB（Windows 安装包、Linux AppImage、Android APK 及大量截图/说明） |
| 文档 | `README.md` 约 580 行、`README.en.md`、`README-Android.md`、2 篇工程文档 |

---

## 三、本次实测结果

| 检查项 | 命令 | 结果 | 说明 |
| --- | --- | --- | --- |
| 双工程类型检查 | `npm run typecheck` | **通过** | renderer 与 electron 两个 project 均 `strict: true`，0 error |
| IPC/窗口静态门禁 | `npm run verify` | **通过** | 29 个通道对齐；敏感 handler 均有发送方校验；窗口/权限/Cookie/日志规则通过 |
| 生产构建 | `npm run build` | **通过（exit 0）** | 2144 个模块；`dist` 1.25 MB；CSS 223.74 KB（gzip 36.51 KB） |
| 构建告警 | — | 1 条 | `theme-boot.js` 无 `type="module"`，Vite 不打包该脚本（由 `public/` 原样复制，功能正常） |
| 运行时冒烟 | `npm run smoke` | **本次未复跑** | 当前会话无法启动 Electron GUI 进程（无输出、exit 1）；仓库 2026-10-28 的 `scripts/smoke/out/results.json` 显示此前通过 |
| 依赖审计 | `npm audit` | **51 项**（3 critical / 40 high / 8 moderate） | 绝大多数在构建/打包工具链；随包发布的运行时依赖中 `react-router` 有 1 项 high |
| 自动化测试 | — | **0 个** | 仓库内无 `*.test.*` / `*.spec.*`，无 Vitest/Jest/Playwright 配置 |
| Lint / 格式化 | — | **缺失** | 无 ESLint、Prettier、Stylelint 配置 |

构建说明：本机 DSH 沙箱禁止 esbuild 的管道通信（`spawn EPERM`），构建是在放宽权限后完成的；这是执行环境限制，不是项目问题。构建本身可稳定复现，退出码 0。

---

## 四、真正的优势

### 1. Electron 安全基线高于平均水平

- 主窗口 `contextIsolation: true`、`nodeIntegration: false`、显式 `sandbox: true`（[electron/main.ts](electron/main.ts#L960)）。
- 全量拒绝 Web 权限请求与检查，拦截 `<webview>` 挂载和默认 `window.open`（[electron/main.ts](electron/main.ts#L1248)）。
- 受信任 `webContents` 登记表 + 敏感 handler 统一 `assertTrustedSender`（[electron/security.ts](electron/security.ts#L10)）。
- 登录态 IPC 只返回 `isLoggedIn`，不再回传 SESSDATA/CSRF（[electron/biliApi.ts](electron/biliApi.ts#L185)）。
- 生产 CSP 严格：`script-src 'self'`、`object-src 'none'`、`frame-src 'none'`（[vite.config.ts](vite.config.ts#L9)）。
- `app://` 协议做了目录穿越防护（[electron/main.ts](electron/main.ts#L1297)），外链只放行 http/https（[electron/main.ts](electron/main.ts#L1234)）。

### 2. 轻量但有效的质量门禁

[scripts/verify.mjs](scripts/verify.mjs) 用零依赖做了四件 tsc 覆盖不到的事：通道对齐、敏感 handler 校验、窗口安全开关、渲染层 `console.log` 禁令。这比"只跑构建"成熟一个档次，且已接入 CI（[build.yml](.github/workflows/build.yml#L44)）。

### 3. 产品完成度与体验细节

搜索、推荐、UP 主空间、队列、歌单、喜欢、最近播放、歌词匹配、封面匹配、B 站收藏夹双向同步、多 P 视频、托盘、沉浸播放页、深浅主题、移动布局都已闭环。很多边界处理是"做过产品的人才会写"的：播放状态恢复、音频加载看门狗、后台恢复、Linux 托盘退化、窗口状态持久化原子写入、旧品牌数据迁移。

### 4. 文档与可追溯性

README 双语、Android 专项说明、上一轮工程改进记录（含验证矩阵与未完成风险）、WBI 改造计划（含架构图、步骤、回滚方案）。在一个 15k 行 TS 的项目里，这种文档密度很少见。

### 5. 跨端不是"配置一下"

Linux 的 Wayland 输入法重执行、软件渲染稳定性模式、托盘原生菜单；Android 的前台媒体服务、通知栏、通话暂停、本地资源服务器；HarmonyOS 的窗口三键与持久化层。这些都属于真实适配，而非占位。

---

## 五、问题清单

### P0：发布前应处理

#### P0-1 Electron 36 已超出官方支持窗口

- 证据：[package.json](package.json#L36) 为 `^36.0.0`，实际安装 36.9.5；构建 target 为 `chrome136`（[vite.config.ts](vite.config.ts#L66)）。
- 影响：Electron 只维护最近 3 个稳定大版本，36 已不再获得 Chromium 安全补丁。播放器要解析第三方页面数据、加载远程封面/音频，长期停留在旧 Chromium 会累积安全与兼容风险；这也会放大 P0-3（没有更新通道）。
- 建议：升级到当前受支持的大版本，建立"每 3 个月跟一次 Electron"的节奏；在 CI 增加三平台 smoke，避免升级回归。

#### P0-2 项目内零自动化测试

- 证据：无测试文件、无 test 脚本；CI 只有 typecheck → verify → build → package（[build.yml](.github/workflows/build.yml#L44-L57)）；`npm run smoke` 是手动脚本，未进 CI。
- 影响：风险最高的两块恰好没有测试兜底：
  - `PlayerContext` 1,572 行、约 30 个 `useEffect`、20 多个 `useRef`，包含加载/重试/看门狗/后台恢复/媒体会话等时序逻辑（[PlayerContext.tsx](src/contexts/PlayerContext.tsx#L168)）；
  - 资料库持久化、歌单导入导出、音质阶梯、WBI 签名、歌词标题清洗等纯逻辑，非常适合单测却完全裸奔。
- 建议：
  - Vitest 覆盖纯模块：`storage`/`storageMigration`/`playlistSync`/`lyrics` 标题清洗、`coverMatch` 评分、`bilibiliApi` 音质排序与 WBI query 构造；
  - Playwright + Electron 做 3 条 E2E：首屏挂载、搜索（mock 响应）、播放状态恢复；
  - CI 增加 test job；Linux 用 xvfb 跑 smoke。

#### P0-3 分发链路未闭环

- 证据：CI 对 macOS 关闭签名（`CSC_IDENTITY_AUTO_DISCOVERY: false`，[build.yml](.github/workflows/build.yml#L60)），Windows 无签名配置；`release/` 中没有 DMG；Android 的 `release` 未配置 `signingConfig`（[build.gradle.kts](android/app/build.gradle.kts#L22)）；无 `electron-updater` 客户端（仅 CI 生成 `latest*.yml`）。
- 影响：Windows SmartScreen / macOS Gatekeeper 会拦截；用户无法自动获得安全更新；Android 发布签名不可复现，升级链有断的风险。
- 建议：Windows 代码签名（EV 或 Azure Trusted Signing）、Apple Developer ID + 公证、Android keystore 放 CI secrets、接入带签名校验的 electron-updater（灰度 + 回滚）。

#### P0-4 合规缺口仍然存在

- 仓库根目录**没有 LICENSE**（仅有 `release/linux-unpacked/LICENSE.electron.txt` 这类打包产物）。
- [platform/HarmonyOS/build-profile.json5](platform/HarmonyOS/build-profile.json5#L31-L37) 提交了开发机的绝对证书路径与加密后的 `keyPassword`/`storePassword`。
- `platform/HarmonyOS/docs` 内含华为 PDF 与 `electron-napi-library.zip`，未见 NOTICE/再分发许可说明；`oh-package.json5` 的 `license` 为空。
- 影响：贡献者与用户的权利边界不清；签名材料与用户名泄露；厂商运行时的再分发存在法律不确定性。
- 建议：选定 LICENSE（需与所带 HarmonyOS 运行时兼容）、补 NOTICE 与第三方许可清单、把签名材料移到本地/CI secrets 并提供模板、清理或明确标注厂商文档的授权范围。

### P1：架构与可维护性

#### P1-1 双数据通路 + CORS 补丁是最大结构性风险

- 现状：渲染进程用浏览器 `fetch` 直连 B 站并自带 WBI 签名（[bilibiliApi.ts](src/services/bilibiliApi.ts#L65)），主进程用 `webRequest` 改写 `Origin`/`Referer` 并回写 CORS 头（[electron/main.ts](electron/main.ts#L311-L359)）；`api.ts` 又包了一层 `electronFetch`，但只被推荐接口使用（[api.ts](src/services/api.ts#L17)）。
- 影响：
  - B 站一旦收紧 CORS/风控，搜索、播放、评论会同时失效，且没有主进程回退路径；
  - 两套实现会持续漂移；渲染层 `headers: { Referer }` 属于浏览器禁止头，实际被静默丢弃，容易误导维护者；
  - Cookie 只存在于默认 session，CORS 补丁对所有 `api.bilibili.com` 响应生效，安全边界被不必要地放大。
- 建议：按 [WBI-PLAN.md](docs/WBI-PLAN.md) 落地主进程统一签名代理，用 `BIU_API_MODE` 灰度切换，验证通过后删除 CORS 补丁与渲染层重复实现。这是投入产出比最高的一次架构收敛。

#### P1-2 Android JS 桥接暴露面偏大

- 证据：`addJavascriptInterface(new AndroidBridge(), "BiuAndroid")`（[MainActivity.java](android/app/src/main/java/com/unsunsk8er/biu/MainActivity.java#L136)）对 WebView 内所有 frame 生效；桥接直接暴露 `getBiliCsrf()`（#L608）与 `openExternal(url)`（#L663），`openExternal` 不校验 scheme。
- 影响：一旦页面出现 XSS 或被嵌入远程 iframe，脚本可读取 CSRF、经 `biliPost` 以用户身份写 B 站数据，或拉起任意 Intent。`usesCleartextTraffic="true"`（[AndroidManifest.xml](android/app/src/main/AndroidManifest.xml#L27)）与 `allowBackup="true"`（#L16）也放大了数据暴露面（虽然已有 `network_security_config` 限定 127.0.0.1）。
- 建议：每个 `@JavascriptInterface` 方法先校验 `webView.getUrl()` 的 origin；`openExternal` 只允许 https；移除全局 cleartext 标志，仅保留 `network_security_config`；按需关闭第三方 Cookie 与备份。

#### P1-3 `PlayerContext` 是 God Component

- 证据：1,572 行，播放、队列、随机、循环、音量、进度、媒体会话、封面刷新、缓存、持久化、快捷键、托盘同步全部集中在一个 Provider 中。
- 影响：任何播放时序改动都可能引发跨功能回归；`useEffect` 之间的隐式依赖难以推理；测试成本极高。
- 建议：拆为 `useAudioEngine`（加载/重试/看门狗）、`usePlaybackPersistence`、`useMediaSession`、`useQueue` 四个 hook，状态迁移用 reducer；先补测试再拆。

#### P1-4 主进程入口职责过多

- 证据：[electron/main.ts](electron/main.ts) 1,349 行，同时负责窗口、托盘、协议、持久化、迁移、日志、Linux 稳定性开关。
- 影响：文件级冲突概率高；平台分支（Linux/HarmonyOS/Windows）交织，回归面大。
- 建议：拆 `window.ts`、`tray.ts`、`protocol.ts`、`store.ts`、`migrations.ts`，`main.ts` 只做组装与生命周期。

#### P1-5 CSS 体量与优先级失控

- 证据：两个 CSS 文件共 12,105 行、1,378 个 `!important`、25 个媒体查询、5 处 `.app-shell` 定义、658 个自定义属性。
- 影响：样式靠 `!important` 压优先级，主题/响应式改动容易互相踩踏；CSS 223.74 KB（gzip 36.5 KB）仍是首屏最大单体资源之一。
- 建议：先建立 token 层（颜色/间距/圆角/层级），按页面拆分样式，分批移除 `!important` 并配视觉回归；引入 Stylelint 防止回潮。

#### P1-6 无 Lint，错误模型不统一

- 证据：无 ESLint/Prettier；`throw { code, message, path }` 抛出的是普通对象而非 `Error`（[api.ts](src/services/api.ts#L28)）；源码仍有 28 处 `any`。
- 影响：错误栈丢失、`instanceof Error` 判断失效、调用方难以统一处理；风格与陷阱只能靠人肉 review。
- 建议：ESLint flat config + Prettier + `no-explicit-any: warn`；统一 `BiliApiError`，禁止抛裸对象；把 `verify.mjs` 扩展为"禁止 throw 对象字面量"。

### P2：产品与体验

| 项 | 现状 | 建议 |
| --- | --- | --- |
| 可访问性 | 全项目 38 处 `aria-label`、仅 2 处 `tabIndex`；自绘标题栏、进度条、队列依赖指针操作 | 键盘可达性走查；滑块补 `role="slider"` + 方向键；焦点环与 reduced-motion |
| 国际化 | UI 文案硬编码中文，无 locale 切换；仅有英文 README | 若面向海外，抽 i18n 字典；否则在 README 明确中文优先 |
| 隐私 | 播放时会向网易云/QQ/iTunes/酷狗查询封面与歌词；无隐私说明或开关 | README 增加数据流向说明；设置页提供"关闭第三方匹配" |
| 存储可靠性 | 资料库走 `localStorage`，写入失败被静默吞掉（[storage.ts](src/utils/storage.ts#L147-L154)）；无配额/导出提醒 | 写入失败提示 + 容量检测；资料库考虑 IndexedDB；定期提醒导出 |
| 鸿蒙身份 | `AppScope/app.json5` 仍是 `com.mikannqaq.bilimusic` / 1.0.0，无 HAP 产物 | 确认签名后改为正式 bundleName/版本；补一次真机构建记录 |
| 构建噪音 | `theme-boot.js` 触发 Vite 警告（[index.html](index.html#L9)） | 将该 10 行脚本内联到 `index.html`，去掉额外请求与警告 |
| 命名 | `AppleMusicPage.tsx` 实际是 UI 套件而非页面 | 重命名为 `MusicUI.tsx` 或拆到 `components/ui/` |

---

## 六、建议路线图

### 第 1 周：止血（发布阻断项）

| 动作 | 验收标准 |
| --- | --- |
| 升级 Electron 到受支持版本 | 三平台 `npm run build` + smoke 通过；无新增 console error |
| 补 LICENSE + NOTICE + 第三方许可清单 | 根目录有 LICENSE；HarmonyOS 运行时/文档授权说明清楚 |
| 移除 `build-profile.json5` 中的证书路径与口令 | 仓库内无绝对路径/密码；提供 `build-profile.example.json5` |
| CI 增加 test job（先跑空壳 + 2 个纯逻辑测试） | PR 上能看到 test 结果 |
| 内联 `theme-boot.js` | 构建 0 warning |

### 第 2–4 周：一致性与可测性

| 动作 | 验收标准 |
| --- | --- |
| 落地 WBI 主进程代理（灰度开关） | 搜索/详情/播放/评论全部走主进程；关闭 CORS 补丁后功能正常 |
| 为 storage / 音质 / 歌词清洗 / 歌单导入导出补单测 | 核心纯函数覆盖率 ≥ 60% |
| 拆分 `PlayerContext` | 单文件 < 500 行；播放/队列/持久化行为不变 |
| ESLint + Prettier + Stylelint 接入 CI | 新代码零 error；存量以 warn 过渡 |
| Android 桥接 origin 校验 + `openExternal` 白名单 | 非本地 origin 调用被拒绝 |

### 1–3 个月：可持续发布

| 动作 | 验收标准 |
| --- | --- |
| Windows/macOS 签名与公证 | 安装包无 SmartScreen/Gatekeeper 阻断 |
| electron-updater（签名校验 + 灰度） | 旧版本能收到并校验更新；失败可回滚 |
| Playwright E2E 进 CI（Linux xvfb） | 首屏/搜索/播放恢复三条用例稳定 |
| CSS token 化与 `!important` 清理 | 首屏 CSS < 180 KB；`!important` 数量下降 50% |
| HarmonyOS / macOS 各一次真机/真系统验收 | 有截图、日志与已知问题清单 |

---

## 七、复核方式

```bash
npm ci
npm run check        # typecheck + verify
npm run build        # 产物在 dist / dist-electron
npm run smoke        # 需可交互桌面环境
npm audit            # 依赖审计
```

本次评估的原始命令输出与指标可在报告生成时复现；`npm run smoke` 需要在有桌面会话的机器上执行。

---

## 八、评估局限

1. 未做真实账号登录、线上搜索/播放/收藏夹推送验收；本轮结论基于源码、构建与既有冒烟记录。
2. 未构建 macOS DMG 与 HarmonyOS HAP；这两端的结论来自配置与代码审查，而非产物验证。
3. 本机无 `git`，未评估提交历史、分支策略与代码评审记录。
4. `npm audit` 的 dev/prod 分类对本项目有误导性：React 等运行时依赖也放在 `devDependencies` 并由 Vite 打包，因此不能只看 "prod" 计数。
