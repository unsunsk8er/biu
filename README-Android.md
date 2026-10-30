# biu Android APK

biu 2.0.0 的 Android 版本，面向国产 Android 手机，不依赖 Google Play 服务。

## 下载

当前源码构建产物在 `android/app/build/outputs/apk/`；验证包使用本地测试签名：

- [biu-2.0.0-android-verify.apk](release/biu-2.0.0-android-verify.apk)（仅验收，不是正式发布包）
- [SHA-256 校验文件](release/biu-2.0.0-android-verify.apk.sha256)

```text
版本：2.0.0
包名：com.unsunsk8er.biu
最低系统：Android 8.0（API 26）
目标系统：Android 14（API 34）
架构：通用（使用手机内置 Android System WebView）
签名：验证包为 CN=biu Verification；正式发布需真实 release keystore
```

## 已实现

- 手机底部导航：推荐、搜索、喜欢、歌单、设置。
- 推荐 / 热歌榜 / 搜索视频 / 视频详情。
- B 站扫码登录、Cookie 持久化。
- 音频播放、播放进度、播放/暂停、上一首/下一首、随机、循环、评论入口。
- 手机紧凑播放条与全屏播放页。
- 本地喜欢、最近播放、歌单；手机端可直接新建歌单。
- 深色主题、浅色主题、跟随系统。
- 原生 B 站 API / 图片 / 音频代理：
  - 自动补 `buvid3` 指纹
  - 处理 Referer、Cookie、CORS
  - 音频 CDN 使用桌面 UA，规避 B 站对 Android UA 的 403
- 手机屏幕适配：390×844 实测通过。

## 暂未包含

以下桌面能力依赖 Electron / 本机文件系统，Android MVP 中未开放：

- 下载音频到本地
- 桌面歌词面板
- B 站收藏夹歌单同步
- 自动更新
- 桌面托盘、窗口控制
- 第三方封面自动匹配

设置页会自动隐藏这些入口。

## 安装

1. 将 APK 传到手机。
2. 在系统设置中允许文件管理器 / 浏览器安装未知来源应用。
3. 安装并打开 biu。
4. 设置 → 扫码登录，使用 B 站 App 扫码。

## 技术结构

- `android/`：原生 Android WebView 容器。
- `scripts/prepare-android.mjs`：构建并复制 SPA 资源。
- `BiliProxy.java`：B 站 API、图片、音频请求代理与 CookieManager。
- `LocalAssetServer.java`：仅监听 `127.0.0.1` 的本地静态资源服务。
- `MainActivity.java`：WebView、扫码登录页、返回键、应用生命周期。

移动布局由 `BiuAndroid` User-Agent 触发，桌面 AppImage 布局不受影响。

## 构建

工具链要求：

- JDK 17+
- Android SDK Platform 34
- Build-Tools 34.0.0
- Gradle 8.7（AGP 8.5.2）
- Node.js 22.12+

可以把工具链放在仓库内的 `.android-tools/`，构建脚本会自动发现，无需全局安装：

```text
.android-tools/
├─ jdk17/                      JDK 17
├─ sdk/                        Android SDK（platforms/android-34、build-tools/34.0.0、platform-tools）
├─ gradle/gradle-8.7/          Gradle 8.7
├─ gradle-home/                GRADLE_USER_HOME
├─ android-home/               ANDROID_USER_HOME
└─ tmp/                        构建临时目录
```

`scripts/build-android.mjs` 会在环境变量未显式设置时自动使用上述目录，并在 `android/local.properties` 缺失时写入 `sdk.dir`。也可以继续使用系统安装的 JDK/SDK/Gradle。

```bash
npm run android:prepare    # 构建并复制 Web 资源
npm run android:build      # debug APK
npm run android:release    # release；检测到签名环境变量时自动签名
```

产物：

```text
android/app/build/outputs/apk/debug/app-debug.apk
android/app/build/outputs/apk/release/app-release.apk            # 配置签名后
android/app/build/outputs/apk/release/app-release-unsigned.apk   # 未配置签名时
```

Release 签名通过环境变量提供，不写入仓库：

```bash
export BIU_KEYSTORE_PATH=/secure/biu-release.jks
export BIU_KEYSTORE_PASSWORD=...
export BIU_KEY_ALIAS=biu
export BIU_KEY_PASSWORD=...
npm run android:release
apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

未设置 `BIU_KEYSTORE_PATH` 时 Gradle 会打印警告并产出未签名 APK。keystore 与口令不得提交；升级必须继续使用同一密钥，否则老用户无法覆盖安装。完整发布流程见 [docs/RELEASE.md](docs/RELEASE.md)。

脚本按 `BIU_GRADLE` → `.android-tools/gradle/gradle-8.7/bin/gradle` → PATH 的顺序查找 Gradle；
Android SDK 通过 `android/local.properties` 或 `ANDROID_HOME`/`ANDROID_SDK_ROOT` 指定。

## 验证环境

- Android 14 AOSP x86_64 模拟器（早期布局/播放验证）
- HarmonyOS 7 + 卓易通（2026-10-30 真机验收）
- 390×844 手机视口

### 2026-10-30 真机验收（HarmonyOS 7 卓易通，重命名后 1.7.0 包）

- 冷启动、启动页、首页与底部导航正常，无闪退。
- 扫码登录成功，头像/昵称正确，重启后登录态保持。
- 搜索“周杰伦”、播放/暂停、上下首、拖动进度、多 P 切换正常。
- 通知栏封面/标题/控制正常，锁屏媒体卡片可见并可控制。
- 播放中切后台 10 分钟不中断，回前台不白屏。
- 新建 B 站收藏夹、把歌加入收藏夹成功，网页端可见。
- 结论：验收清单第 1–6 节全部通过，详见 [docs/ANDROID-VERIFY-CHECKLIST.md](docs/ANDROID-VERIFY-CHECKLIST.md)。
- 2.0.0 仅版本号/versionCode 变更，功能代码相同，建议快速复测冷启动/登录/播放。
- 仍未验证：正式 release keystore 签名与覆盖升级、可选通话暂停、第 7 节其他项。

### 2026-10-30 构建验证

- 工具链：Microsoft OpenJDK 17.0.21、Android SDK 34（ext7 r03）、Build-Tools 34.0.0、Gradle 8.7、AGP 8.5.2。
- `npm run android:build`：`BUILD SUCCESSFUL`，debug APK 0.77 MB，签名 `CN=Android Debug`。
- `npm run android:release`：`BUILD SUCCESSFUL`；提供测试 keystore 时产出 `app-release.apk`（0.70 MB，测试证书 `CN=biu Verification`），未提供时产出 `app-release-unsigned.apk`。
- 冷构建（删除 `android/app/build`、不设置 JDK/SDK/Gradle 环境变量）同样通过。
- 正式 release keystore 签名与升级覆盖仍未验证。

真机验收步骤与日志采集见 [docs/ANDROID-VERIFY-CHECKLIST.md](docs/ANDROID-VERIFY-CHECKLIST.md)。
