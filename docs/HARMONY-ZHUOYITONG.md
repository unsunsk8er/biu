# 鸿蒙 7 · 卓易通运行 Android APK

> 方案 B：不通过 AppGallery，不开启开发者模式，用卓易通安装 Android APK。
>
> 状态：APK 已传到手机下载目录；设备尚未安装卓易通。

## 1. APK

| 项 | 值 |
| --- | --- |
| 文件 | `release/biu-2.0.0-android.apk` |
| 包名 | `com.unsunsk8er.biu` |
| 版本 | 2.0.0 / versionCode 140 |
| 签名 | `CN=biu release` |
| SHA-256 | `ba358b776a45223fa52dd6f689b4e548e87b7d54cb350aa7ae0435303f61dcc4` |
| 手机路径 | `/storage/media/100/local/files/Docs/Download/biu-2.0.0-android.apk` |

## 2. 安装卓易通

当前设备的 `bm dump` 中没有发现卓易通；只有“出境易”（`com.easy.hmos.abroad`），两者不是同一个应用。

1. 打开华为应用市场。
2. 搜索 **卓易通**。
3. 安装并打开。

> 卓易通是否上架、是否支持当前 HarmonyOS 7 机型，以应用市场实际结果为准。

## 3. 导入 APK

1. 打开卓易通。
2. 选择“本地安装 / 导入 APK / 文件安装”（不同版本入口名称可能不同）。
3. 进入“下载”目录，选择：

```text
biu-2.0.0-android.apk
```

4. 按提示安装。
5. 首次启动允许通知/后台运行（如果系统询问）。

## 4. 验证

- 应用能启动到搜索页；
- 能播放；
- 桌面出现新 `b` Logo；
- 锁屏/通知栏媒体卡是否可用，取决于卓易通兼容层。

## 5. 已知限制

- 不是原生鸿蒙应用，后台播放/通知栏/AVSession 可能不完整；
- 卓易通内是独立 Android 环境，数据与原生 HAP 版不共享；
- 部分 HarmonyOS 7 版本可能不允许安装卓易通或限制其后台；
- 如果卓易通不可用，回退方案 A（AppGallery 内部测试）或 Web/PWA。

## 6. 卸载/回退

- 在卓易通内卸载 biu 即可；
- 原生 HAP 版不受影响；
- AppGallery 内部测试包已生成，但未完成上架流程。
