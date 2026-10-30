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

## 手动播放验收

用户在手机上手动点击播放后确认正常。设备侧证据：

```text
MediaSession: com.unsunsk8er.biu/biu/964
state=PlaybackState {state=PLAYING(3), position=3339, speed=1.0}
AudioFocus: com.unsunsk8er.biu / AudioFocusDelegate, USAGE_MEDIA, gain=GAIN
Notification: pkg=com.unsunsk8er.biu channel=biu_media
  category=transport, MediaStyle
  actions: 上一首 / 暂停 / 下一首
```

播放界面截图：

```text
.archive/android-smoke/playing2.png
```

界面显示“可惜没如果 / 林俊杰”及暂停按钮，说明播放状态正常。

## 自动点击限制

- ADB 合成点击在 WebView 搜索结果行上未触发播放页；手动点击正常。
- 后续若要做 Android 全自动 E2E，需要 UIAutomator/Appium 基于节点点击，而不是坐标点击。
- 本轮已通过“手动操作 + 设备状态/音频/通知/截图”完成播放验收。

## 结论

**Android 正式签名 APK 已完成真机安装、启动、实际播放、媒体会话与通知栏验收。**

剩余可选项：用 UIAutomator 把“点击播放”自动化，纳入 CI/日常冒烟。
