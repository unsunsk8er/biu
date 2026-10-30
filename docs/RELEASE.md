# 发布、签名与自动更新

本文档描述 biu 2.0.0 起的发布流程。签名证书、口令与 Apple 凭据**只能**放在本地环境变量或 GitHub Actions secrets 中，不得提交到仓库（`npm run verify` 会检查鸿蒙签名材料是否误入库）。

> 当前状态（2026-10-30）：项目按「只自用」发布——Android 使用本地 `CN=biu Verification` 签名，Windows/macOS 未签名；未配置正式证书。正式对外分发前需完成本文第 2、4 节，并重新构建所有平台产物。

## 1. 版本与触发

- 版本号以 `package.json` 的 `version` 为准；`npm version patch|minor|major` 会同步更新 lockfile 并打 tag。
- tag 必须是 `v<version>`（例如 `v2.0.1`），CI 在 tag 推送时构建并发布 GitHub Release。
- `workflow_dispatch` 只构建产物，不发布。

## 2. 桌面端签名

CI 的 package 步骤读取以下 secrets；未配置时 electron-builder 会产出未签名包（构建不会失败，但用户会看到 SmartScreen/Gatekeeper 提示）。

| Secret | 平台 | 说明 |
| --- | --- | --- |
| `WIN_CSC_LINK` | Windows | Authenticode `.pfx` 的 base64 或 URL |
| `WIN_CSC_KEY_PASSWORD` | Windows | PFX 口令 |
| `MAC_CSC_LINK` | macOS | Developer ID Application `.p12` 的 base64 或 URL（CI 中映射为 `CSC_LINK`） |
| `MAC_CSC_KEY_PASSWORD` | macOS | P12 口令（CI 中映射为 `CSC_KEY_PASSWORD`） |
| `APPLE_ID` | macOS | Apple Developer 账号 |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS | App 专用密码（不是账号密码） |
| `APPLE_TEAM_ID` | macOS | Team ID |

macOS 的 `hardenedRuntime` 已开启；当 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 同时存在时，electron-builder 会自动调用 `@electron/notarize` 完成公证。也可改用 `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`。

拿到 Windows 证书后，把 `package.json` 的 `build.win.publisherName` 设为证书 Subject 的 CN（或完整 Subject），electron-updater 才会校验更新包签名；未设置时 Windows 更新签名校验会被跳过。

本地验证：

```bash
# Windows
signtool verify /pa /v release/biu-Setup-*.exe
# macOS
codesign --verify --deep --strict --verbose=2 "release/mac/biu.app"
spctl --assess --type execute --verbose "release/mac/biu.app"
```

## 3. Linux

AppImage/DEB 默认不签名。发布前至少提供 `SHA256SUMS`，并在 Release Notes 中说明校验方式。

## 4. Android 签名

`android/app/build.gradle.kts` 在检测到以下环境变量时启用 release 签名，否则输出未签名 APK 并打印警告：

| 变量 | 说明 |
| --- | --- |
| `BIU_KEYSTORE_PATH` | keystore 绝对路径（CI 中由 secret 落盘到临时目录） |
| `BIU_KEYSTORE_PASSWORD` | keystore 口令 |
| `BIU_KEY_ALIAS` | key alias |
| `BIU_KEY_PASSWORD` | key 口令 |

```bash
export BIU_KEYSTORE_PATH=/secure/biu-release.jks
export BIU_KEYSTORE_PASSWORD=...
export BIU_KEY_ALIAS=biu
export BIU_KEY_PASSWORD=...
npm run android:release
apksigner verify --print-certs release/biu-2.0.0-android.apk
```

keystore 与口令不得入库；建议放在 CI secret 或密码管理器中，并保留离线备份。升级链一旦更换签名 key，老用户将无法覆盖安装。

## 5. HarmonyOS

`platform/HarmonyOS/build-profile.json5` 不再包含任何证书路径或口令，`signingConfigs` 为空。请在 DevEco Studio 的 **File → Project Structure → Signing Configs** 中为本机生成/选择签名，并**不要提交** DevEco 写回的签名段。

`npm run harmony:build` 在没有本地签名配置时只能完成资源同步，HAP 构建会失败或产出未签名包；这是预期行为。发布 HAP 前需在 DevEco 中完成一次签名构建并记录 SDK/证书版本。

## 6. 自动更新

- 客户端：`electron/updater.ts`，使用 `electron-updater`。
- 行为：打包版启动 20 秒后检查，之后每 6 小时一次；发现新版本先询问，用户确认后下载；下载完成再次询问，确认后 `quitAndInstall`。
- 关闭：`BIU_DISABLE_UPDATES=1`；预发布通道：`BIU_ALLOW_PRERELEASE=1`（读取 GitHub prerelease）。
- 发布源：`package.json` 的 `build.publish` 当前指向 `unsunsk8er/biu`。如果实际仓库不同，修改 `owner` / `repo` 后重新打包；`app-update.yml` 会随安装包生成。
- GitHub Release 必须包含 electron-builder 生成的 `latest.yml`（Windows）、`latest-mac.yml`、`latest-linux.yml`、对应安装包与 `.blockmap`，否则更新检查会 404。
- 草稿（draft）Release 对更新接口不可见；确认后再发布。

回滚：electron-updater 不支持降级。出现问题时下线有问题的 Release，发布一个更高的修复版本；同时保留上一版安装包供手动回退。

## 7. 发布检查清单

```bash
npm ci
npm run check        # typecheck + verify + unit tests
npm run build
npx electron-builder --dir --publish never   # 快速验证打包内容
npm run smoke        # 需桌面环境
npm run electron:build
```

- [ ] `package.json` 版本与 tag 一致
- [ ] `LICENSE` / `NOTICE` 随包存在
- [ ] Windows 安装包已签名，macOS 已签名并公证
- [ ] Android release APK 已用发布 keystore 签名
- [ ] Release 包含 `latest*.yml` 与 `.blockmap`
- [ ] 用上一版安装包实际验证一次“检查更新 → 下载 → 重启安装”
