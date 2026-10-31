# Android 构建环境与验证记录（2026-10-30）

本机首次补齐 Android 工具链并完成 debug/release 编译。

## 1. 环境

| 项 | 版本 / 位置 |
| --- | --- |
| 主机 | Windows 10 19045 x64 |
| Node | 24.22.1 |
| JDK | Microsoft OpenJDK 17.0.21（`.android-tools/jdk17`） |
| Android SDK | Platform 34（ext7 r03）、Build-Tools 34.0.0、Platform-Tools latest（`.android-tools/sdk`） |
| Gradle | 8.7（`.android-tools/gradle/gradle-8.7`） |
| AGP | 8.5.2（`android/build.gradle.kts`） |
| Gradle Home | `.android-tools/gradle-home` |
| Android User Home | `.android-tools/android-home` |

工具链全部放在仓库内 `.android-tools/`（已在 `.gitignore`），不进入版本库。

## 2. 安装过程中的问题与处理

1. **PowerShell/curl 的 TLS 连接被关闭**：`Invoke-WebRequest`、`curl.exe` 对 `dl.google.com`、`services.gradle.org` 均失败；Node 的 OpenSSL 栈可用。
   - 解决：用 Node `fetch` 下载官方 zip（Google SDK、Microsoft JDK、腾讯 Gradle 镜像）。
2. **sdkmanager 拉取清单失败**：Java 网络栈报 `Failed to download any source lists`，无法安装组件。
   - 解决：从 `repository2-3.xml` 读取官方包名，手动下载并布置：
     - `platform-34-ext7_r03.zip` → `sdk/platforms/android-34`
     - `build-tools_r34-windows.zip` → `sdk/build-tools/34.0.0`
     - `platform-tools-latest-windows.zip` → `sdk/platform-tools`
     - 写入 `sdk/licenses/android-sdk-license`。
3. **Gradle native-platform 初始化失败**：默认 `~/.gradle` 在工作区外，被 DSH 沙箱拦截。
   - 解决：`GRADLE_USER_HOME` 指向 `.android-tools/gradle-home`。
4. **AGP 无法写 `C:\Users\admin\.android`**：
   - 解决：`ANDROID_USER_HOME` 指向 `.android-tools/android-home`（AGP 仍会打印 metrics 警告，但不影响构建）。
5. **Java 临时目录 AccessDenied**：`mergeDebugJavaResource` 在 `%TEMP%` 创建临时目录失败。
   - 解决：构建时把 `TEMP`/`TMP` 指向 `.android-tools/tmp`（DSH 环境特有；普通桌面环境不需要）。
6. **Node 24 无法 spawn `gradle.bat`（EINVAL）**：
   - 修复：`scripts/build-android.mjs` 在 Windows 上通过 `cmd.exe` 执行（`shell: true`）。
7. **每次手动导出环境变量**：
   - 修复：`scripts/build-android.mjs` 自动发现 `.android-tools/{jdk17,sdk,gradle-home,android-home}`，并在 `local.properties` 缺失时生成。

## 3. 构建结果

### Debug

```bash
npm run android:build
```

- `BUILD SUCCESSFUL`，exit 0。
- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（0.77 MB）。
- 签名：`CN=Android Debug`（AGP 自动生成的 debug keystore）。
- 包含本轮 P1 的 `MainActivity` 桥接加固、CSRF 原生注入、`allowBackup=false` 等改动。
- 冷构建复验：删除 `android/app/build`、不设置任何 `JAVA_HOME`/`ANDROID_HOME`/`GRADLE_USER_HOME`/`TEMP`，`npm run android:build` 仍 exit 0（Gradle 缓存命中，约 11 秒）。

### Release（测试密钥）

```bash
BIU_KEYSTORE_PATH=.android-tools/biu-verify.jks \
BIU_KEYSTORE_PASSWORD=... \
BIU_KEY_ALIAS=biu-verify \
BIU_KEY_PASSWORD=... \
npm run android:release
```

- `BUILD SUCCESSFUL`，exit 0；`lintVitalRelease` 通过。
- 产物：`android/app/build/outputs/apk/release/app-release.apk`（0.70 MB）。
- 签名：测试证书 `CN=biu Verification`；`application-debuggable` 不存在，确认是 release 构建。

验证用 keystore 保留在 `.android-tools/biu-verify.jks`（已 gitignore，仅本机使用）。**正式包必须使用真实 release keystore 重新构建**；本次产物只用于验证签名配置，不可分发。

### Release（未配置签名）

不设置 `BIU_KEYSTORE_PATH` 时同样 `BUILD SUCCESSFUL`，产物为
`android/app/build/outputs/apk/release/app-release-unsigned.apk`（0.70 MB），Gradle 会打印未签名警告。

## 4. 复现

```bash
# 1. 工具链放在 .android-tools（或系统安装 JDK17/SDK34/Gradle8.7）
# 2. 构建
npm run android:build
npm run android:release
```

在 DSH/WSL 等受限环境之外，不需要设置 `TEMP`/`TMP`；构建脚本会自动处理 SDK/Gradle 路径。

## 5. 验证状态

**已验证（2026-10-30，HarmonyOS 7 卓易通真机）：**

- 安装与冷启动、启动页、首页、底部导航。
- B 站扫码登录、头像/昵称、重启后登录态保持。
- 搜索“周杰伦”、播放/暂停、上下首、拖动进度、多 P 切换。
- 通知栏封面/标题/控制、锁屏媒体卡片。
- 播放中切后台 10 分钟不中断，回前台不白屏。
- 新建 B 站收藏夹、加入歌曲并在网页端确认（原生 CSRF 注入验证通过）。

详见 [Android 验收清单](./ANDROID-VERIFY-CHECKLIST.md)。

**仍未验证：**

- 正式 release keystore 签名与覆盖升级安装（当前验收包使用本地验证证书）。
- 可选通话暂停、主题切换/输入法等第 7 节其他项。
- Android 自动化测试与 CI 构建。
