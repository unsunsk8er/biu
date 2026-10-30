# Android 正式签名记录（2026-10-30）

> 本文只记录路径、证书指纹和构建方式；**密码不写入仓库**。

## 签名材料

| 项 | 值 |
| --- | --- |
| Keystore（工作副本） | `.android-tools/biu-release.jks`（gitignore） |
| Keystore（备份） | `C:\Users\admin\.biu-signing\biu-release.jks` |
| 凭据文件 | `C:\Users\admin\.biu-signing\biu-release.properties` |
| Alias | `biu` |
| 算法 | RSA 4096 / SHA384withRSA |
| 有效期 | 10000 天 |
| 证书 DN | `CN=biu release, OU=Mobile, O=biu, L=Shanghai, ST=Shanghai, C=CN` |
| 证书 SHA-256 | `52d90addcfb673634d18edd6c6cbbaa2cca08130b67e91dc46d279790d3c336b` |

`biu-release.properties` 包含 `BIU_KEYSTORE_PATH`、口令与 alias，必须和 keystore 分开备份，不能提交。

## 构建

```powershell
Get-Content C:\Users\admin\.biu-signing\biu-release.properties | ForEach-Object {
  $i = $_.IndexOf('=')
  if ($i -gt 0) { Set-Item "Env:$($_.Substring(0, $i))" $_.Substring($i + 1) }
}
npm run android:release
```

产物：

```text
android/app/build/outputs/apk/release/app-release.apk
release/biu-2.0.0-android.apk
```

本次 APK：

```text
release/biu-2.0.0-android.apk
SHA-256: ba358b776a45223fa52dd6f689b4e548e87b7d54cb350aa7ae0435303f61dcc4
cert: CN=biu release
```

## 升级规则

- 从本次开始，后续 Android 包必须继续使用同一 keystore 与 alias，否则无法覆盖升级。
- 旧的 `biu-2.0.0-android-verify.apk`（`CN=biu Verification`）和 debug 证书包与新正式包签名不同，首次安装正式包前需要卸载旧包。
- 不要把 keystore 或口令提交到 Git；当前 `.android-tools/` 已在 `.gitignore` 中。
- 建议把 `C:\Users\admin\.biu-signing` 再备份到离线介质。

## 离线备份

已创建备份包：

```text
C:\Users\admin\.biu-signing\biu-release-backup-2026-10-30.zip
D:\biu-signing-backup\biu-release-backup-2026-10-30.zip
SHA-256: 176b4c650f0033ea9e518ff65b4944fdbf7a3b54433591957c93e816a61fc9af
```

D 盘副本已校验哈希一致；仍建议再复制到 U 盘/加密盘，避免整机故障。

恢复验证已完成：

1. 解压到临时目录；
2. 用恢复出的 keystore 重新签一个测试 APK；
3. `apksigner` 验签得到同一证书指纹 `52d90addcfb673634d18edd6c6cbbaa2cca08130b67e91dc46d279790d3c336b`。

**请把这个 ZIP 复制到离线介质（U 盘/加密盘）**；只留在本机不算离线备份。恢复时还需要 `biu-release.properties` 中的口令。

## HarmonyOS 说明

HarmonyOS release HAP 也已验证可播放，但仍使用 DevEco 自用 debug 证书签名；上架/正式分发需要华为开发者证书，和本文的 Android keystore 不是同一套材料。
