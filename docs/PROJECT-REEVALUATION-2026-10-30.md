# biu 项目重新评估（2026-10-30）

> 评估对象：当前工作区 `2.0.0`，不是 1.7.0 的旧报告。
> 方式：仓库/构建状态、依赖审计、类型与静态门禁、现有测试、平台发布物、关键源码复核；未重新做完整真机回归。

## 一、结论

**biu 已经是完成度很高的自用级跨端音乐播放器，但还不是可公开分发的产品。**

产品体验和平台适配明显强于一般个人项目；真正的短板已经从“功能”转为“工程交付”：**126 个未提交变更、HarmonyOS 仍是 debug 包、Windows 安装包未签名、移动端没有 CI、核心播放链路没有自动化测试**。

**综合评分：6.4 / 10（自用 8.5，公开分发 4.5）**

| 维度 | 权重 | 得分 | 判断 |
| --- | ---: | ---: | --- |
| 产品完成度与体验 | 20% | 8.5 | 搜索/播放/队列/歌词/封面/歌单/后台/控制中心已闭环 |
| 架构与可维护性 | 20% | 5.5 | God Component、双数据通路、WebView 音频，CSS 1,384 个 `!important` |
| 安全与隐私 | 15% | 7.0 | Electron 基线扎实；Android 桥已修；Harmony/第三方数据仍有面 |
| 测试与质量门禁 | 15% | 5.0 | 29 个单测，但只覆盖纯逻辑；无 E2E/真机/播放链路测试 |
| 性能 | 10% | 6.5 | HAP 1.58 MB、列表已优化；AVSession 4Hz 同步和重复歌词请求仍在 |
| 跨平台与发布 | 10% | 5.0 | Windows/Android/Harmony 都有产物，但签名和 release 链路未闭环 |
| 文档 | 5% | 7.5 | 文档量大；README 仍偏桌面端，手机工程在独立文件 |
| 合规 | 5% | 5.5 | MIT + NOTICE 已有；B 站内容、第三方歌词/封面、隐私说明仍缺 |

## 二、当前基线

| 项目 | 现状 |
| --- | --- |
| 版本 | `2.0.0` |
| 源码 | `src` 70 个 TS/TSX，约 13,069 行；CSS 约 275 KB |
| 技术栈 | React 19 + TypeScript 5.8 + Vite 6 + Electron 45 + framer-motion |
| 端 | Windows/Linux/macOS Electron、Android WebView、HarmonyOS 7 ArkWeb 壳 |
| HarmonyOS 包 | `release/biu-2.0.0-harmony-phone.hap`，1.58 MB |
| HAP SHA-256 | `fbff11c0d1329c9bff89021a4d2d9c53bf40f1624cf5ccb8faa6aaca12996205` |
| Web 单文件 | 1.34 MB（gzip 610 KB） |
| 质量门禁 | `typecheck + verify + lint + 29 tests` 通过 |
| 生产依赖审计 | `npm audit --omit=dev`：0 漏洞 |

## 三、真正的优势

1. **跨端不是占位**
   - HarmonyOS 7 已经做到安全区、系统返回、后台任务、AVSession 控制中心/通知栏、封面/歌词同步、CDN 失败本地缓存回退。
   - Android 桥接已加 `isTrustedPage()`、接口路径限制、`openExternal` 仅 http/https、`allowBackup=false`，比旧评估时明显收敛。

2. **Electron 安全基线仍然扎实**
   - `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
   - IPC 通道/发送方校验、权限拒绝、窗口打开拦截、CSP、`app://` 目录穿越防护均有门禁。
   - `verify.mjs` 的通道对齐与敏感 handler 检查是项目里很有价值的资产。

3. **产品细节完整**
   - 搜索、分P、音质阶梯、歌词/封面多源匹配、队列、歌单、喜欢、最近、下载、二维码登录、深浅主题、手机布局、播放恢复、错误重试都已有真实实现。
   - 最近的列表批渲染、弹层 120ms 动效、搜索 stagger、触屏 hover 清理，说明性能优化已经进入“体验层”。

4. **工程门禁有效**
   - TypeScript strict、ESLint、29 个 Vitest、生产依赖 0 漏洞、CI 至少覆盖桌面端三平台构建。
   - `AppErrorBoundary` 已存在，不会因单页异常直接白屏。

## 四、优先问题

### P0-1：源码管理处于高风险状态

`git status` 当前为 **30 个 modified + 96 个 untracked，共 126 项**；`platform/HarmonyOSPhone/`、`MediaSessionSync.tsx`、`harmonyAudio.ts`、`harmonyFetch.ts`、`motion.ts` 等核心改动都尚未提交。

风险：一次误清理/换机就会丢失最近全部 HarmonyOS 与音频修复。
建议：立即把源码与文档分组提交；截图、layout JSON、日志不要入库；确认 `build-profile.json5` 仍被忽略后再 push。

### P0-2：发布链路没有闭环

- HarmonyOS 当前 HAP 是 **DevEco debug 自用证书**，README 明确说明 release 构建下 ArkWeb CORS 会让 playurl CDN 403；要公开分发需要 **原生 AVPlayer 或本地音频代理**。
- Windows 安装包 `biu-Setup-2.0.0-x64.exe` 状态为 **NotSigned**，会触发 SmartScreen。
- 移动端没有进入 CI：`.github/workflows/build.yml` 只构建 Windows/macOS/Linux Electron，不构建 Android/HarmonyOS。
- Android release 签名配置虽已存在，但没有可复现的 CI 签名与真机回归记录。

### P0-3：核心播放链路仍无自动化保护

29 个测试只有约 299 行，主要是纯函数；没有覆盖：

- `PlayerContext` 的加载/重试/看门狗/后台恢复
- AVSession 元数据、控制命令、后台音频
- CDN 403 → 渐进流 → 本地缓存的三级回退
- 权限/返回键/安全区/多P弹窗
- 任何 React 组件或真机 E2E

最近连续出现的“后台无声”“部分结果播不了”“分P卡顿”都说明：**没有设备级回归，修一个可能碰坏另一个。**

### P1-1：PlayerContext 继续膨胀

`PlayerContext.tsx` 已约 **1,627 行**，仍集中播放、队列、随机、循环、音量、进度、媒体会话、封面、缓存、持久化、快捷键、托盘同步。它是当前最不适合继续加功能的地方。

### P1-2：AVSession 同步频率与歌词重复请求

`MediaSessionSync` 在每次 `progress` 更新时调用 `setMediaSessionState`；实际日志显示约 **每 260ms 一次** AVSession IPC，属于无意义开销，可能影响后台功耗和滑动稳定性。建议节流到 1s，只在播放/暂停/seek 时立即刷新。

同时它全局调用 `useLyrics`，而 NowPlaying 也调用 `useLyrics`；如果内部没有请求去重，同一首歌会重复请求歌词。需要共享歌词状态或加缓存层。

### P1-3：CSS 技术债仍然很大

- 两个 CSS 共约 **275 KB、1,384 个 `!important`**。
- 存在重复的移动端覆盖块和大量历史补丁。
- 动效刚统一，但样式优先级仍靠 `!important` 压制，后续主题/响应式改动容易回退。

### P1-4：隐私与内容合规说明不足

播放会向网易云/QQ/酷狗/iTunes 查询封面，向 OIAPI 查询歌词；B 站音频与封面来自第三方。当前没有隐私说明、数据流向说明或“关闭第三方匹配”的集中开关。MIT/NOTICE 已补齐是进步，但公开分发前仍需明确：

- 不存储/上传用户 B 站 Cookie 的边界
- 第三方请求清单与关闭方式
- B 站内容的使用条款与自用声明

## 五、建议路线

### 本周：先止血

1. 提交并 push 全部源码，清点未跟踪文件；截图/JSON 加入 `.gitignore`。
2. 把 AVSession 状态同步节流到 1s，确认后台音频与歌词仍正常。
3. 在 README 明确：HarmonyOS 当前是 debug 自用包，不是公开发布包。
4. 给 Windows 安装包补签名计划；至少标注未签名风险。

### 两周内：补可测性

1. 为 `PlayerContext` 的音源回退、缓存、重试抽纯函数并补单测。
2. 加 3 条设备/E2E 回归：冷启动播放、后台恢复、分P弹窗。
3. CI 增加 Android debug 构建 + HarmonyOS Web bundle 构建；真机步骤单独文档化。
4. 共享歌词状态，去掉重复请求。

### 一个月：决定发布形态

- **自用路线**：保持 debug HAP，明确不公开分发，降低签名/商店成本。
- **公开路线**：必须完成 HarmonyOS 原生 `AVPlayer`/音频代理、正式证书、Windows 签名、隐私说明和移动端 CI；否则不要以“正式版”宣传。

## 六、总评

这是一款**产品能力强于工程交付能力**的项目。功能、视觉、跨端适配已经足够支撑日常自用；但当前 126 项未提交变更、debug HAP、未签名 Windows 包和缺失的播放链路测试，决定了它还不能被当作稳定的公开软件。

下一步不该继续堆功能，而应：**先提交，再补播放回归，最后决定自用还是公开发布。**
