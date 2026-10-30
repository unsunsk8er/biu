# biu 移动端可靠性复评（2026-10-30）

> 基线：`main@3a0be6e`，工作区干净；40 个单测通过；HarmonyOS 真实播放 E2E 通过；HAP self-hosted CI 已加入；Android/物理备份存在硬件阻塞。

## 一、结论

**综合 7.0 / 10：自用约 9.2，公开分发约 5.5。**

这轮最重要的变化是：播放不再只靠“看截图”，而是有了可重复的真机 E2E；AVSession、seek、后台、通知栏都实际验证过。HAP CI 也有了 self-hosted 路径。

Android 正式 APK 已完成真机安装、启动与手动播放验收；仍没有可移动 USB 介质，HAP runner 也未实际执行。

## 二、四项任务结果

| 任务 | 状态 | 证据 |
| --- | --- | --- |
| 真实播放 E2E | **核心通过** | 进度 6→11s；音频 `HpaeSinkInputNode` RUNNING；seek 11→253s；后台存活；通知栏 `SetAVPlaybackState:3`；无播放错误 |
| E2E 回退 | **部分** | DASH→渐进流→缓存回退由 8 个单测覆盖；未在设备上制造真实 CDN 故障 |
| HAP self-hosted CI | **已加入，未执行** | `.github/workflows/harmony-self-hosted.yml`，需要 DevEco Windows runner |
| 签名物理离线备份 | **部分** | ZIP 已恢复并重签验证；C/D 盘各一份；无可移动介质 |
| Android 真机安装/播放 | **通过** | `23049RAD8C` / Android 15 / pid 11210 / MediaSession PLAYING / 通知栏 MediaStyle / 无 FATAL |
| 发布定位 | **完成** | 自用 release；正式 AppGallery 证书暂缓 |

## 三、E2E 实测

`npm run e2e:harmony -- --skip-install` 结果：

```json
{
  "ok": true,
  "steps": [
    { "name": "播放进度前进", "ok": true, "detail": "before=6 after=11" },
    { "name": "音频输出活跃", "ok": true, "detail": "HpaeSinkInputNode [PREPARED]-->[RUNNING]" },
    { "name": "seek 生效", "ok": true, "detail": "before=11 after=253" },
    { "name": "后台进程存活", "ok": true },
    { "name": "通知栏暂停", "ok": true, "detail": "AVSession paused" },
    { "name": "无播放错误", "ok": true }
  ]
}
```

覆盖：

- 搜索 → 100P 集合 P1 → 播放
- 播放页进度推进
- 拖动到 75%
- Home 后台进程存活
- 通知栏媒体卡暂停
- 音频服务 RUNNING + AVSession 状态
- 无 `[biu-audio] playback error` / jscrash

## 四、仍阻塞/不足

### 1. Android 真机播放已验收

- 正式 APK 已安装并启动：
  - 设备 `23049RAD8C`，Android 15（SDK 35）
  - `versionName=2.0.0`、`versionCode=140`
  - pid `11210`，无 `FATAL EXCEPTION`
- 用户手动点击播放正常；设备侧证据：
  - MediaSession `state=PLAYING(3)`
  - AudioFocus 由 Chrome `AudioFocusDelegate` 持有
  - 通知栏 `channel=biu_media`，MediaStyle，含上一首/暂停/下一首
- 截图：`.archive/android-smoke/playing2.png`
- 详见 [Android 真机安装验收](./ANDROID-DEVICE-ACCEPTANCE-2026-10-30.md)。
- 自动点击结果行未生效；后续可用 UIAutomator/Appium 补全自动 E2E。

### 2. 物理离线备份（阻塞）

- 已生成备份包：

```text
C:\Users\admin\.biu-signing\biu-release-backup-2026-10-30.zip
D:\biu-signing-backup\biu-release-backup-2026-10-30.zip
SHA-256: 176b4c650f0033ea9e518ff65b4944fdbf7a3b54433591957c93e816a61fc9af
```

- 已解压并用恢复出的 key 重签 APK，证书指纹一致。
- 当前系统**没有可移动磁盘**（只有两块 NVMe）。
- **需要插入 U 盘/加密盘后复制 ZIP，才能算物理离线备份。**

### 3. HAP self-hosted CI 未实际运行

- 工作流已加入并通过 YAML 校验。
- 需要一台带 DevEco Studio、标签为 `self-hosted, windows, harmonyos` 的 Windows runner。
- runner 还需要本地 `platform/HarmonyOSPhone/build-profile.json5` 签名配置（不入库）。
- 未注册 runner 前，GitHub Actions 不会实际产出 HAP。

### 4. CDN 回退未做设备故障注入

- 回退逻辑有单测，release 下也实际走过缓存回退；
- 但 E2E 没有“强制 CDN 403”的故障注入。
- 若要做完整闭环，需要本地代理/防火墙屏蔽 CDN 或专用测试源。

### 5. Android 真机仍可能遇到签名不兼容

正式 APK 使用新 `CN=biu release`，旧的 verify/debug 包必须先卸载。首次安装需要确认。

## 五、评分

| 维度 | 上轮 | 本轮 | 变化 |
| --- | ---: | ---: | --- |
| 产品完成度 | 8.5 | 8.5 | 持平 |
| 架构与可维护性 | 5.5 | 5.5 | 持平 |
| 安全与隐私 | 7.0 | 7.0 | 持平 |
| 测试与质量门禁 | 6.0 | **7.2** | HarmonyOS E2E + Android 安装/播放/通知验收 |
| 性能 | 7.0 | 7.0 | 持平 |
| 跨平台与发布 | 7.0 | **7.4** | HAP CI 路径 + Android 真机播放通过 |
| 文档 | 8.0 | 8.0 | 持平 |
| 合规 | 6.0 | 6.0 | 正式证书暂缓 |
| **综合** | **6.9** | **7.2** | Android 验收完成；USB 备份与 HAP runner 仍缺 |

## 六、下一步

1. 插入 USB，把签名 ZIP 复制到物理离线介质。
2. 注册 HarmonyOS self-hosted runner，跑一次 HAP workflow。
3. 增加 CDN 故障注入 E2E。
4. 可选：用 UIAutomator/Appium 把 Android 点击播放自动化。
5. 继续不加功能，补 `PlayerContext` 拆分/测试。

## 七、产物

| 项 | 值 |
| --- | --- |
| HarmonyOS release | `release/biu-2.0.0-harmony-phone-release.hap`，`37d981...` |
| Android | `release/biu-2.0.0-android.apk`，`94c05a...`，`CN=biu release` |
| 测试 | 40/40 |
| 提交 | `3a0be6e`，已 push |
