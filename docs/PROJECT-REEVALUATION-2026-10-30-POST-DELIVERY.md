# biu 交付后复评（2026-10-30）

> 基线：`main` 已提交并推送，工作区干净；HarmonyOS release HAP 与 Android 正式签名 APK 已落地。
> 这是对 [项目重新评估](./PROJECT-REEVALUATION-2026-10-30.md) 的增量复评，不覆盖旧报告。

## 一、结论

**交付能力明显提升：自用可用性约 8.8/10，公开分发约 5.0/10，综合 6.8/10。**

上一轮最严重的“126 项未提交、release 不可用、Android 只有 debug 签名”已经解决。现在的主要风险变成了**可持续性**：没有播放链路回归测试、HarmonyOS 仍非正式证书、移动端没有 CI，以及签名材料只在本机。

## 二、这轮已经解决的

| 项 | 状态 |
| --- | --- |
| 源码提交 | ✅ 5 个提交，已 push；工作区干净 |
| 本地截图/JSON/日志 | ✅ 归档到忽略目录，不再污染仓库 |
| HarmonyOS release | ✅ `debug:false`，release HAP 可安装、搜索/播放/AVSession 正常 |
| Android 签名 | ✅ 独立 release keystore，`CN=biu release`，v2/v3 通过 |
| 构建脚本 | ✅ `npm run harmony:phone:release` 可复现 |
| 文档 | ✅ 移动端计划、复评、Android 签名记录已入库 |
| 质量门禁 | ✅ `typecheck + verify + lint + 29 tests` 通过 |

## 三、仍然最重要的问题

### P0-1：核心播放链路仍无自动化保护（最大风险）

29 个测试主要覆盖纯函数；没有覆盖：

- `PlayerContext` 的加载/重试/看门狗/后台恢复
- AVSession 元数据、通知栏控制、后台音频
- DASH → 渐进流 → 原生缓存的三级回退
- 分P、评论、返回键、浅色主题等移动端回归

这轮 release HAP 能播放是**人工验证**，不是回归保障。下一次 B 站接口或 CDN 变化仍可能直接打断发布。

### P0-2：HarmonyOS 还不是正式发布链路

release HAP 仍是 DevEco 自用 debug 证书。要做公开分发，必须：

- 华为开发者正式证书
- AppGallery / 签名 profile 流程
- 升级覆盖验证

当前只能称“release 构建”，不能称“正式发布包”。

### P0-3：移动端没有 CI

CI 仍只构建 Windows/macOS/Linux Electron。没有：

- Android debug/release 构建
- HarmonyOS Web bundle / HAP 构建
- 真机冒烟脚本

这意味着移动端改动只能靠本地手工构建，发布不可重复。

### P1-1：签名材料只在本机

- Android keystore 与口令在 `.android-tools/` 和 `C:\Users\admin\.biu-signing`。
- 如果这两处一起丢失，后续 APK 将无法覆盖升级。
- 需要离线备份，并明确“谁持有、存哪里、多久轮换”。

### P1-2：播放架构仍是 WebView 中心

- Release 下 CDN 403 依赖原生缓存 `file://` 回退，首次播放可能先下载整段音频。
- 后台播放依赖 ArkWeb + 持续任务 + AVSession 的组合，不是原生播放器。
- 这不是立刻要重写，但需要把“音频引擎”与 UI 解耦，否则每次系统升级都可能回归。

### P1-3：性能与可维护性债务没变

- `PlayerContext` 约 1,627 行。
- `MediaSessionSync` 仍约每 260ms 更新一次 AVSession，应节流到 1s。
- `MediaSessionSync` 与 NowPlaying 仍可能重复请求歌词。
- CSS 约 275 KB、1,384 个 `!important`。
- 桌面端冻结后，这些共享代码仍会影响手机端。

### P1-4：隐私与第三方数据说明

封面/歌词会请求网易云、QQ、酷狗、iTunes、OIAPI；当前没有集中的隐私说明或关闭开关。公开分发前需要补齐数据流向与自用声明。

## 四、更新后的评分

| 维度 | 上轮 | 本轮 | 变化 |
| --- | ---: | ---: | --- |
| 产品完成度 | 8.5 | 8.5 | 持平 |
| 架构与可维护性 | 5.5 | 5.5 | 持平 |
| 安全与隐私 | 7.0 | 7.0 | 持平 |
| 测试与质量门禁 | 5.0 | 5.0 | 持平 |
| 性能 | 6.5 | 6.5 | 持平 |
| 跨平台与发布 | 5.0 | **6.5** | release HAP + Android 正式签名 |
| 文档 | 7.5 | **8.0** | 计划/签名记录入库 |
| 合规 | 5.5 | **6.0** | 签名材料与 release 说明更清楚 |
| **综合** | **6.4** | **6.8** | 交付能力提升，测试仍是短板 |

## 五、下一阶段优先级

### 第 1 周

1. 给 `PlayerContext` 的音源回退/缓存/重试抽纯函数并补测试。
2. 写一个 hdc/adb 冒烟脚本：启动、搜索、播放、后台 2 分钟、通知栏暂停、返回键、分P。
3. 把 AVSession 同步节流到 1s，共享歌词状态。

### 第 2 周

1. CI 增加 Android debug 构建与 HarmonyOS Web/HAP 构建。
2. 真机跑一轮完整回归，产出记录。
3. 备份 Android keystore 到离线介质，验证恢复流程。

### 第 3–4 周

1. 决定 HarmonyOS 正式证书/AppGallery 是否推进。
2. 评估原生播放器或本地音频代理，替换 release 下“整段缓存”回退。
3. 补隐私说明与第三方请求开关。

## 六、结论

这轮把“能不能交付”推进到了**可以自用安装、可以复现构建、可以持续签名升级**的程度；下一步不要再加功能，先把**播放回归测试、移动端 CI、签名备份**做扎实。否则下一次系统或 CDN 变化仍会让手机端回到“手工救火”的状态。
