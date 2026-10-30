# biu 最终复评（2026-10-30）

> 基线：`main@e44f35a`，工作区干净；40 个单测通过；HarmonyOS release HAP、Android 正式签名 APK、移动端 CI、签名离线备份均已落地。
> 这是在本轮“补测试、AVSession 节流、CI、签名备份、发布定位”之后的复评。

## 一、结论

**综合 6.9 / 10：自用约 9.0，公开分发约 5.5。**

这轮把上一轮剩余的“交付保障”补上了大半：测试从 29 增至 40，有设备冒烟脚本、AVSession 已降频、Android/HarmonyOS web CI 已加入、签名备份已验证恢复。剩余风险主要不再是“能不能装”，而是“正式公开分发”和“真实播放链路自动化”。

## 二、五项任务结果

| 任务 | 结果 | 说明 |
| --- | --- | --- |
| 播放回归测试 | ✅ 40 tests | 新增音源候选/回退阶段、AVSession 节流、歌词请求去重测试 |
| 设备冒烟脚本 | ✅ `npm run smoke:harmony` | 安装/启动/进程/移动壳文本检查；已在 Mate 70 Pro 跑通 |
| AVSession 节流 | ✅ 约 1.06s | 从约 260ms 降到约 1s，播放/暂停/切歌/seek 立即刷新 |
| 共享歌词请求 | ✅ | `getLyricForTrackShared` + in-flight 去重 |
| 移动端 CI | ✅ 部分 | Android debug APK + HarmonyOS web bundle；HAP 仍需 DevEco |
| 签名离线备份 | ✅ | ZIP 已恢复并用恢复出的 key 重签 APK 验证 |
| 发布定位 | ✅ 自用 release | 暂不推进 AppGallery 正式证书 |

## 三、这轮真正的提升

### 1. 测试从“纯函数”扩到播放关键决策

新增测试覆盖：

- CDN 候选 URL 的顺序、去重、HTTPS 归一化、上限
- direct → progressive → native cache 的回退阶段
- AVSession 状态推送的节流/seek 立即刷新
- 歌词请求的并发去重与失败清理

`npm run check`：10 个测试文件、40 个测试通过。

### 2. AVSession 不再 4Hz 刷状态

真机日志确认：

```text
15:07:47.866
15:07:48.929
15:07:49.991
15:07:51.053
...
```

间隔约 1.06s。播放/暂停/切歌仍立即推送。

### 3. 移动端有了 CI 入口

`.github/workflows/build.yml` 新增 `mobile` job：

- `npm test`
- HarmonyOS single-file web bundle
- Android SDK 34 + Gradle 8.7 + `assembleDebug`
- 上传 `dist-harmony/index.html` 与 debug APK

YAML 已用本地 js-yaml 校验。**尚未在 GitHub runner 实际执行**，首次运行可能需要调整 Android SDK/Gradle 版本。

### 4. Android 签名恢复验证

备份包：

```text
C:\Users\admin\.biu-signing\biu-release-backup-2026-10-30.zip
D:\biu-signing-backup\biu-release-backup-2026-10-30.zip
SHA-256: 176b4c650f0033ea9e518ff65b4944fdbf7a3b54433591957c93e816a61fc9af
```

恢复测试：解压 → 读取 properties → 用恢复出的 keystore 重签 APK → `CN=biu release` 证书指纹一致。

## 四、仍然存在的风险

### P0-1：真实播放链路仍没有自动化

新增测试覆盖的是“纯决策函数”，不是完整的 `PlayerContext` + `<audio>` + 原生桥。设备冒烟脚本只验证启动/进程/移动壳，不验证：

- 实际音频是否出声
- 后台 10 分钟是否继续
- 通知栏暂停是否正确回传
- CDN 失败后的真实回退
- 分P/评论/返回键

这是当前最大的质量缺口。

### P0-2：HarmonyOS HAP 没有进入 CI

CI 只构建 HarmonyOS 的单文件 Web，不构建 HAP；HAP 仍依赖本机 DevEco。要在 CI 产出 HAP，需要带 DevEco SDK 的 self-hosted runner，或构建容器。

### P0-3：正式 HarmonyOS 证书仍未推进

决定是**自用 release 包**：`debug:false`，但签名仍是 DevEco 自用 debug 证书。不能作为 AppGallery 正式包宣传。

### P1-1：Android 正式 APK 未做真机安装

已通过构建、v2/v3 验签、证书校验；没有 Android 设备/模拟器完成“安装→启动→播放”实测。卓易通安装仍需你确认。

### P1-2：离线备份还差物理介质

C 盘与 D 盘各有一份备份，并通过恢复重签验证；但 D 盘仍是本机磁盘。需要复制到 U 盘/加密盘，否则整机故障仍会丢 key。

### P1-3：架构债未动

- `PlayerContext` 约 1,627 行。
- CSS 约 275 KB、1,384 个 `!important`。
- release 下音频仍依赖 WebView + 原生缓存回退，不是原生播放器。

## 五、评分变化

| 维度 | 上轮 | 本轮 | 变化 |
| --- | ---: | ---: | --- |
| 产品完成度 | 8.5 | 8.5 | 持平 |
| 架构与可维护性 | 5.5 | 5.5 | 持平 |
| 安全与隐私 | 7.0 | 7.0 | 持平 |
| 测试与质量门禁 | 5.0 | **6.0** | 40 tests + 冒烟，但仍缺真实播放 E2E |
| 性能 | 6.5 | **7.0** | AVSession 1s + 歌词去重 |
| 跨平台与发布 | 6.5 | **7.0** | Android CI、备份、定位；HAP CI/正式证书仍缺 |
| 文档 | 8.0 | 8.0 | 复评与签名文档更新 |
| 合规 | 6.0 | 6.0 | 正式发布仍未推进 |
| **综合** | **6.8** | **6.9** | 小幅提升，测试深度仍不足 |

## 六、下一步

1. **真实播放 E2E**：用固定测试音源/mock API，在设备上验证出声、后台、通知栏暂停、seek、CDN 失败回退。
2. **HAP CI**：加 self-hosted HarmonyOS runner，或明确“HAP 只本地产出”的流程。
3. **物理离线备份**：把签名 ZIP 复制到 U 盘/加密盘，并再次验证恢复。
4. **Android 真机安装**：完成一次正式 APK 的安装/启动/播放。
5. **暂不再加功能**；先拆 `PlayerContext` 或补播放测试，二者选一。

## 七、总评

**现在可以稳定自用：release HAP + 正式签名 APK + 备份 + 冒烟 + 40 tests。**

但它还不是“可公开分发的产品”：HAP 没有正式证书、HAP 没有 CI、真实播放链路没有自动化、签名备份尚未上物理离线介质。下一步应继续补“可重复验证”，而不是扩展功能。
