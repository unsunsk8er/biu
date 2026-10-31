# HarmonyOS AppGallery 内部测试上架手册

> 目标：用 AppGallery Connect 内部测试，让测试用户在不开启开发者模式的情况下安装原生 HAP。
>
> **当前状态（2026-10-31）：AGC release 证书/Profile 已取得；`.app` 与 `.hap` 均已用 release 证书签名并通过验证。还差 AGC 上传、隐私政策 URL、软著/APP 备案和内容授权。**

## 一、签名材料

目录：`C:\Users\admin\.biu-harmony-signing`

| 文件 | 用途 |
| --- | --- |
| `biu-harmony-release.p12` | release 私钥，必须备份、不可泄露 |
| `biu-harmony-release.csr` | 已用于申请 AGC release 证书 |
| `biu-harmony-release.cer` | AGC release 证书链 |
| `biu-harmony-release.p7b` | AGC release Profile |
| `release-signing.properties` | keystore 密码/alias，权限敏感 |

- Key alias：`biuRelease`
- 算法：EC P-384 / SHA256withECDSA
- Profile：`type=release`，`app-distribution-type=app_gallery`
- Bundle：`com.unsunsk8er.biu`
- Profile 有效期至：2029-10-31

备份：

```text
D:\biu-signing-backup\biu-harmony-release-2026-10-31\
```

> 不要把 `.p12`、`release-signing.properties` 提交到 Git 或发给外部人员。

## 二、已签名的上传包

| 包 | 路径 | SHA-256 |
| --- | --- | --- |
| APP（优先） | `release/biu-2.0.0-harmony-phone-appgallery.app` | `32bbd89b1e7b71c483d4d78cd6b71aad580a25d87e63f471ae41093e1da07f9d` |
| HAP（备选） | `release/biu-2.0.0-harmony-phone-appgallery.hap` | `29e63dc415351837bbda057f0c6e349cc07c73220551ee34f90f34cdca1d5ae7` |

验证结果：

- 外层 `.app`：`hap-sign-tool verify-app` 通过
- 内层 `entry-default.hap`：`type=release`，签名验证通过
- HAP 独立文件：签名验证通过
- 旧 `release/biu-2.0.0-harmony-phone-release.hap` 仍是 `debugKey` 签名，**不要上传**。

## 三、上传内部测试

1. 登录 [AppGallery Connect](https://developer.huawei.com/consumer/cn/service/josp/agc/index.html)。
2. 我的应用 → biu → 测试与发布 / 内部测试。
3. 上传 `release/biu-2.0.0-harmony-phone-appgallery.app`。
   - 如果页面只接受 HAP，改用 `.hap`。
4. 填写版本说明、测试范围、隐私政策 URL。
5. 添加测试用户华为账号。
6. 提交并发布测试版本。
7. 测试用户在 AppGallery 测试入口接受邀请安装，不需要开发者模式。

> 内部测试不等于免审核；AGC 仍可能要求隐私政策、资质或版权材料。

## 四、以后重新构建

当前 `build-profile.json5` 仍是 `debugKey`。以后修改代码后要重新出包，需要：

1. DevEco → Project Structure → Signing Configs 手动配置 release：
   - Store file：`biu-harmony-release.p12`
   - Certpath：`biu-harmony-release.cer`
   - Profile：`biu-harmony-release.p7b`
   - Key alias：`biuRelease`
   - 密码从 `release-signing.properties` 读取
2. 构建：

```powershell
npm run harmony:phone:release
```

3. 重新检查签名：

```powershell
# 使用 DevEco 自带 hap-sign-tool
java -jar "<DevEco>/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar" `
  verify-app -inFile release/biu-2.0.0-harmony-phone-appgallery.hap `
  -outCertChain cert.cer -outProfile profile.p7b
```

> 当前已签名的 `.app`/`.hap` 是本次可直接上传的产物；重新构建前先备份。

## 五、上架前必须补齐

- [ ] 软件著作权登记证书
- [ ] APP 备案（工信部）及备案号
- [ ] 可公网访问的隐私政策 URL
- [ ] 权限说明：网络、后台运行
- [ ] 第三方服务清单：哔哩哔哩、OIAPI 歌词
- [ ] 内容版权/合作授权，或删除 B 站内容聚合/音轨提取能力
- [ ] 应用截图、图标、简介
- [ ] 测试用户华为 ID 列表

## 六、当前阻塞

1. **AGC 页面上传尚未执行**：需要你的开发者账号在浏览器操作。
2. **隐私政策 URL 未部署**：`docs/privacy-policy.html` 还是模板，需填主体/邮箱并托管到 HTTPS。
3. **软著、APP 备案未知**：缺失时可能被拒。
4. **B 站内容授权缺失**：最大风险，内部测试也不能消除投诉/下架风险。

## 七、下一步

1. 把 `docs/privacy-policy.html` 的主体/邮箱补全并部署，拿到 HTTPS URL。
2. 在 AGC 上传 `.app`，填隐私政策 URL，添加测试账号。
3. 如 AGC 要求软著/备案，先补齐再提交。
4. 如因 B 站版权被拒，只能取得授权或删除相关内容能力后重做。

> 本手册是工程操作说明，不构成法律意见。
