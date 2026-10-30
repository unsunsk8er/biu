# HarmonyOS HAP self-hosted CI

GitHub 托管的 Ubuntu runner 没有 DevEco Studio / HarmonyOS SDK，无法编译 ArkTS HAP。因此 HAP 使用 self-hosted Windows runner 构建；Web 与 Android 仍由 `.github/workflows/build.yml` 的 `mobile` job 构建。

## Runner 要求

- 操作系统：Windows
- Labels：`self-hosted`、`windows`、`harmonyos`
- DevEco Studio：`C:\Program Files\Huawei\DevEco Studio`
- Node.js 24
- 已存在的 `platform/HarmonyOSPhone/build-profile.json5`，包含本机有效签名配置
  - 该文件被 gitignore，不进入仓库；runner 首次配置需手动放好
- 已安装 `ohpm` / hvigor（DevEco 自带）

## 触发

- `workflow_dispatch`：手动运行
- 推送 `v*` tag，且仓库变量 `BIU_HARMONY_SELF_HOSTED=true`

未设置变量时，tag 推送不会把任务排入没有 runner 的队列。

## 产物

```text
release/biu-2.0.0-harmony-phone-release.hap
release/biu-2.0.0-harmony-phone-release.hap.sha256
```

由 `.github/workflows/harmony-self-hosted.yml` 上传为 `harmony-hap` artifact。

## 当前状态

- 工作流已加入并通过 YAML 解析。
- 本机没有注册 GitHub self-hosted runner，因此**尚未在 Actions 上实际执行**。
- 本地 release 构建与真机播放验证已通过。
