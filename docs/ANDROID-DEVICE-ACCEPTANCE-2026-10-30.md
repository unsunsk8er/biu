# Android 真机安装验收（2026-10-30）

## 设备

| 项 | 值 |
| --- | --- |
| 型号 | `23049RAD8C` |
| Android | 15（SDK 35） |
| 包名 | `com.unsunsk8er.biu` |
| 版本 | 2.0.0（versionCode 140） |
| 签名 | `CN=biu release` |
| 首次安装 | 2026-10-30 17:09:18 |
| 最后更新 | 2026-10-30 17:11:47 |

## 安装

```text
adb install -r release/biu-2.0.0-android.apk
Performing Streamed Install
Success
```

覆盖安装成功，没有签名冲突（设备此前未安装旧 verify/debug 包）。

## 启动验收

```text
pidof com.unsunsk8er.biu → 11210
logcat FATAL EXCEPTION → 无
```

界面截图显示移动壳正常：

- 搜索页标题与搜索框
- 视频/UP主切换
- 搜索结果列表
- 底部搜索/歌单/下载/设置导航

截图：`.archive/android-smoke/screen.png`

## 自动冒烟

```powershell
npm run smoke:android
```

输出：

```json
{
  "ok": true,
  "bundle": "com.unsunsk8er.biu",
  "apk": "release\\biu-2.0.0-android.apk",
  "pid": "11210",
  "screenshot": ".archive\\android-smoke\\screen.png"
}
```

## 尚未完成

- 自动点击搜索结果没有触发播放页（ADB 合成点击在 WebView 结果行上未生效），因此**没有完成 Android 真机实际播放验收**。
- 需要在手机上手动点一首歌确认播放/通知栏/后台，或后续改用 UIAutomator/Appium 基于节点点击。
- 设备当前已授权，可继续补测。

## 结论

**Android 正式签名 APK 已完成真机安装、启动、进程与无 FATAL 验收。**
播放链路仍待手动/UIAutomator 补测，不能宣称“Android 播放已验收”。
