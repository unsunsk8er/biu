# biu 移动端优先开发计划

> 决策日期：2026-10-30
> 适用范围：后续功能开发、性能优化、发布与测试。
> 结论：**手机端优先；桌面端进入维护模式，不再投入新功能。**
>
> 2026-10-30 执行结果：源码已提交推送；release HAP 已可用；Android release keystore 已建立并完成离线备份验证；播放回归测试 40 项；AVSession 已节流到约 1s；Android/HarmonyOS web CI 已加入；HarmonyOS 真实播放 E2E 通过；Android 正式 APK 已完成真机安装、启动和手动播放验收。HarmonyOS 正式证书决定暂缓，当前定位为**自用 release 包**；物理 USB 备份与 HAP runner 仍待补。

## 一、端优先级

| 优先级 | 平台 | 定位 |
| --- | --- | --- |
| P0 | HarmonyOS 7（Mate 70 Pro） | 主力自用设备，ArkWeb 壳 + AVSession |
| P1 | Android（APK / 卓易通） | 第二安装渠道，验证通用移动布局 |
| 维护 | Windows / macOS / Linux Electron | 只修安全与阻断问题，不加功能 |
| 冻结 | HarmonyOS PC | 暂停投入 |

## 二、桌面端冻结规则

- 不再新增桌面专属功能、窗口特效、托盘/更新器能力。
- Electron 只保留安全更新与共享 Web UI 的回归修复。
- CI 可以保留一个桌面构建 job，用于发现共享代码回归，但**不阻塞手机端发布**。
- 不为 Windows 签名、macOS 公证、Linux 分发继续投入时间。
- 不删除现有桌面代码；后续需要时再恢复。

## 三、移动端真正的优先事项

### P0：先把交付做稳

1. **提交当前全部源码**
   - 当前 126 项未提交/未跟踪变更，HarmonyOSPhone 整个工程还未入库。
   - 先提交，再继续任何移动端开发。

2. **HarmonyOS release 可用**
   - 当前 HAP 仍是 debug 自用包。
   - release 构建下 ArkWeb CORS 会让 playurl CDN 403；需要原生 `AVPlayer` 或本地音频代理。
   - 有正式发布需求时，补华为正式证书与 AppGallery 流程。

3. **Android 发布签名**
   - 目前生成的是 Android Debug 证书签名的 self-use APK。
   - 正式升级链需要固定 release keystore，并通过 CI secrets 注入。

4. **移动端 CI**
   - 至少加入 Android debug 构建与 HarmonyOS Web bundle 构建。
   - 真机回归单独脚本化：启动、搜索、播放、后台、通知栏、返回键、分P。

### P1：播放可靠性

- 后台播放不能只依赖 WebView 音频；评估原生播放器统一 Android/HarmonyOS。
- AVSession 状态同步从约 4Hz 节流到 1s，只在播放/暂停/seek 时立即刷新。
- 共享歌词状态，避免 `MediaSessionSync` 与 NowPlaying 重复请求。
- 保留 CDN 403 的三级回退：DASH → 渐进 MP4 → 原生缓存本地文件。
- 为以下场景建立验收清单：
  - 锁屏/通知栏控制
  - 切后台 10 分钟
  - 蓝牙/有线耳机切换
  - 弱网/CDN 失败
  - 分P切换与队列 next/prev

### P1：移动端体验

- 手机端页面只保留搜索、歌单、下载、设置、播放页；不再被桌面侧栏/标题栏拖累。
- 考虑把桌面 UI 从移动端 bundle 中代码分割，降低首屏解析量。
- 下载、离线缓存、歌词、封面匹配在 Android/HarmonyOS 上保持一致。
- 平板/横屏单独验收，不把手机布局硬套到平板。
- 保持现有动效 token，不再逐组件加自定义动画。
- 触控目标、手势返回、安全区、字体缩放做一次系统走查。

### P2：工程收敛

- `PlayerContext` 逐步拆为 audio engine / queue / persistence / media session。
- CSS 分批清理 `!important` 和重复移动端覆盖块。
- 补移动端 E2E：Playwright + WebView/设备脚本，或最小 hdc/adb 冒烟。
- 隐私说明：列出封面/歌词第三方请求，提供关闭入口。

## 四、建议的两周节奏

### 第 1 周

- 提交并 push 全部源码，清理截图/布局 JSON 等临时文件。
- 建立移动端回归清单。
- AVSession 同步节流；共享歌词请求。
- 确认 Android debug/release APK 都能安装。

### 第 2 周

- 做一次 HarmonyOS release 可行性验证：原生 AVPlayer 或本地音频代理二选一。
- 把 Android/HarmonyOS 构建加入 CI。
- 完成一轮真机回归：启动、搜索、播放、后台、通知栏、返回键、分P、评论浅色模式。

## 五、判断标准

移动端版本可以称为“稳定自用版”的最低条件：

- 冷启动无白屏/闪退。
- 搜索到播放成功率可复现地 ≥ 95%（失败有明确提示或回退）。
- 退后台 10 分钟音频不中断，通知栏/控制中心状态与实际播放一致。
- 分P/评论/设置弹层不卡顿、无黑边。
- APK/HAP 签名与升级路径明确。
- 关键路径有可重复的设备回归记录。
