# HarmonyOS AppGallery 内部测试上架手册

> 目标：用 AppGallery Connect 的内部测试，在不要求测试用户开启开发者模式的情况下安装原生 HAP。
>
> 当前状态：**本地 release 密钥/CSR 已生成；AGC 发布证书/profile 和账号操作尚未完成。**

## 一、当前签名基线

`platform/HarmonyOSPhone/build-profile.json5` 目前仍使用 DevEco 的 **debugKey**：

- 证书：`C:\Users\admin\.ohos\config\default_HarmonyOSPhone_...cer`
- Profile：`...p7b`
- Keystore：`...p12`
- Alias：`debugKey`

因此当前 `release/biu-2.0.0-harmony-phone-release.hap` 虽然文件名带 release，**仍是调试签名，不能上传 AppGallery，也不能作为内部测试包**。

## 二、已生成的 release 签名材料

目录：`C:\Users\admin\.biu-harmony-signing`

| 文件 | 用途 |
| --- | --- |
| `biu-harmony-release.p12` | release 私钥，必须备份、不可泄露 |
| `biu-harmony-release.csr` | 上传 AGC 换取 release 证书 |
| `release-signing.properties` | keystore 密码/alias，权限敏感 |

- Key alias：`biuRelease`
- 算法：EC P-384 / SHA256withECDSA
- 有效期：9125 天
- 证书 SHA-256 指纹：`E8:55:20:37:F5:1A:BB:B0:F5:3D:D9:3E:B7:0A:62:6F:AB:DF:92:97:A3:17:A4:28:35:A9:D0:7C:DF:B2:58:CA`

备份副本：

```text
D:\biu-signing-backup\biu-harmony-release-2026-10-31\
```

> 不要把 `.p12`、`release-signing.properties` 提交到 Git 或发给外部人员。丢失私钥后无法更新已发布应用。

## 三、AGC 操作（必须使用你的华为开发者账号）

### 1. 创建应用

1. 登录 [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html)。
2. 我的应用 → 创建应用。
3. 平台选择 HarmonyOS，包名填写 `com.unsunsk8er.biu`。
4. 应用名称暂填 `biu`，分类选择音乐/音频。

### 2. 用 CSR 创建 release 证书

1. 进入 **证书、APP ID 和 Profile**。
2. 证书 → 新增证书。
3. 证书类型选择 **发布证书 / Release**。
4. 上传：

```text
C:\Users\admin\.biu-harmony-signing\biu-harmony-release.csr
```

5. 下载生成的 `.cer`，放到：

```text
C:\Users\admin\.biu-harmony-signing\biu-harmony-release.cer
```

### 3. 创建 release Profile

1. Profile → 新增 Profile。
2. 类型选择 **发布 / Release**。
3. 选择刚创建的应用和 release 证书。
4. 设备类型勾选 phone（需要平板则加 tablet）。
5. 下载 `.p7b`，放到：

```text
C:\Users\admin\.biu-harmony-signing\biu-harmony-release.p7b
```

### 4. 在 DevEco 配置 release 签名

1. DevEco Studio → File → Project Structure → Signing Configs。
2. 取消自动签名，选择手动配置。
3. 填入：
   - Store file：`biu-harmony-release.p12`
   - Store password / Key password：从 `release-signing.properties` 读取
   - Key alias：`biuRelease`
   - Certpath：`biu-harmony-release.cer`
   - Profile：`biu-harmony-release.p7b`
4. 点击 Apply，让 DevEco 写入加密后的 `build-profile.json5`。

> 不要手工把明文密码粘进 `build-profile.json5`；当前文件里的密码是 DevEco 加密格式。

### 5. 构建 release HAP

```powershell
npm run harmony:phone:release
```

产物：

```text
release/biu-2.0.0-harmony-phone-release.hap
```

构建后用 `hdc install` 在已授权开发机验证一次，再上传 AGC。

## 四、创建内部测试

1. AGC → 我的应用 → biu → 测试与发布 / 内部测试。
2. 创建内部测试版本，上传 release HAP。
3. 填写版本说明、测试范围、隐私政策 URL。
4. 添加测试用户的华为账号（华为 ID）。
5. 提交内部测试。
6. 测试用户在 AppGallery 的测试入口接受邀请并安装，不需要开发者模式。

> 内部测试不等于“免审核”。AGC 仍可能要求应用信息、隐私政策、资质或版权材料；以提交时页面要求为准。

## 五、上架前必须补齐的材料

- [ ] 软件著作权登记证书
- [ ] APP 备案（工信部）及备案号
- [ ] 隐私政策 URL（可公网访问）
- [ ] 权限说明：网络、后台运行
- [ ] 第三方服务清单：哔哩哔哩、OIAPI 歌词
- [ ] 内容版权/合作授权，或删除 B 站内容聚合/音轨提取能力
- [ ] 应用截图、图标、简介
- [ ] 测试用户华为 ID 列表

## 六、当前阻塞

1. **没有 AGC 登录/实名主体**：无法创建 release 证书和 profile。
2. **没有软件著作权、APP 备案、隐私政策 URL**：AGC 可能直接拒绝。
3. **内容授权缺失**：这是最大风险，内部测试也不能消除 B 站投诉/下架风险。
4. **当前 HAP 是 debug 签名**：在完成第 3 步前不能上传。

## 七、下一步

1. 你登录 AGC，创建应用并上传 CSR。
2. 把生成的 `.cer`、`.p7b` 放到 `C:\Users\admin\.biu-harmony-signing\`。
3. 我继续配置 release 签名、构建 HAP、核对签名并准备上传包。
4. 你上传内部测试并添加测试账号。

> 本手册是工程操作说明，不构成法律意见；B 站内容授权问题请先咨询律师或取得授权。
