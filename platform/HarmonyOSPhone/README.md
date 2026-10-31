# biu HarmonyOS 7（手机）

这是 `biu 2.0.0` 的 HarmonyOS 手机工程，面向 Mate 70 Pro / HarmonyOS 7，使用 **ArkTS + ArkUI Web** 承载现有 React UI，不再经过 Android 兼容层或 Electron。

## 已验证（Mate 70 Pro，HarmonyOS 7）

- 启动、ArkWeb 渲染、状态栏/挖孔沉浸布局
- 状态栏与手势导航条安全区：顶部标题、底部播放条/导航栏不再被系统栏遮挡
- 系统返回键：Now Playing → 主界面；其他页面按应用内路由返回；主界面侧边返回桌面，应用保持后台播放
- 稳定性：外部封面源返回非法 `Set-Cookie` 时不再触发 `17100005` JsError 闪退
- 音频兜底：DASH/渐进流都被 CDN 拒绝时，原生带 Referer 下载到缓存并用 `file://` 播放
- 后台音频：申请 `KEEP_BACKGROUND_RUNNING` + `AUDIO_PLAYBACK` 持续任务；AVSession 显式声明 volume/maxVolume，避免退桌面后被系统静音
- 动效：统一 motion token；交互 100–110ms、弹层 120ms、页面 180ms；移动端 100/160/240ms；所有弹层（含播放队列/登录/歌单删除/下拉）统一 120ms 位移淡入\n- 浅色评论框改为实色白底、无 backdrop 模糊，修复手机端圆角四角透出深色底的黑边，搜索 stagger 12ms，触屏移除 hover 抬升
- 分P弹窗：首屏 24 P，滚动增量加载；`content-visibility` 跳过屏外行，改用 140ms 位移淡入，去掉 scale/大阴影
- 音质：playurl 使用 `fnval=4048` 请求 FLAC/杜比；设置只影响新加载曲目，缺失目标流时按 30280→30232→30216 回退
- B 站搜索（原生 HTTP 桥绕过 ArkWeb CORS）
- 搜索结果 → 分P选择 → 音频播放
- 多源封面匹配（QQ/网易云/酷狗/iTunes，原生桥），自动补全歌名/歌手/专辑
- QQ 音乐歌词匹配（OIAPI 直连，LRC 解析/滚动）
- 播放进度、底部播放条、底部导航（搜索/歌单/下载/设置）
- 原生 AVSession：控制中心/通知栏显示封面、歌名/歌手、当前歌词行、进度和播放控制
- 按 Home 退到后台后音频继续播放，系统顶部出现媒体胶囊
- 扫码登录二维码生成

尚未验证：实际扫码登录后的收藏夹同步、锁屏媒体卡片细节。

## 关键实现

- **单文件 Web 资源**：ArkWeb 的 `resource://rawfile` origin 是 `null`，普通 ES module/CSS 会被 CORS 拦截。构建时用 `vite-plugin-singlefile` 把所有 JS/CSS 内联进 `index.html`，再放进 `rawfile/www`。
- **手机布局**：UA 带 `BiuHarmony`，`isMobileApp()` 同时识别 Android 与 HarmonyOS，`MainLayout` 使用手机壳并渲染 `MobileNav`。
- **安全区**：`Web` 使用 `expandSafeArea`，页面 CSS 继续用 `--biu-inset-*` / `env(safe-area-inset-*)`。
- **原生 HTTP 桥**：B 站 API 与封面/歌词目录通过 `BiuHarmony` 走 `@ohos.net.http`，绕过 ArkWeb CORS。
- **控制中心/通知栏**：`AVSession` 由 `MediaSessionSync` 同步 title/artist/album/artwork/lyric/singleLyricText，并接收控制中心 play/pause/next/previous/seek 指令。
- **后台音频**：ArkWeb 的 media session 被系统接管，退后台后音频继续，系统媒体胶囊可用。

## 构建

前置：DevEco Studio 26（本机 `C:\Program Files\Huawei\DevEco Studio`），SDK API 26。

```powershell
# 单文件 Web + 复制到 rawfile
npm run harmony:phone:prepare

# debug HAP
npm run harmony:phone:build

# release HAP（debug:false，但仍是 DevEco debugKey 签名）
npm run harmony:phone:release
```

产物：

```text
platform/HarmonyOSPhone/entry/build/default/outputs/default/entry-default-signed.hap
release/biu-2.0.0-harmony-phone.hap           # debug
release/biu-2.0.0-harmony-phone-release.hap   # release 模式 + debug 签名
```

## 签名与 release

本机已经用 DevEco 自动签名生成并验证了 `com.unsunsk8er.biu`：

```text
release/biu-2.0.0-harmony-phone.hap
SHA-256: d8f8a3211ada14038f525c56ba550c536485b45bc146413d1adf6e5fa02b242f

release/biu-2.0.0-harmony-phone-release.hap
SHA-256: 34ce37272770f967adb6794fc85721fd40e9f7da6aa3da985667c7f0e754ad91
```

> 上面的 release 文件只是 release 构建模式，签名仍是 `debugKey`，不能上传 AppGallery。

## AppGallery release 签名

AGC release 证书/Profile 已生成并完成签名验证。用于邀请测试/内部测试的包：

```text
release/biu-2.0.0-harmony-phone-appgallery.app
SHA-256: a3a0e5b1703f85dd940236b7d4404e7b74ae7731f0c4c4c548fdf62a1b73f6da

release/biu-2.0.0-harmony-phone-appgallery.hap
SHA-256: ec00cd14525ad133172f01a7102b021e17286c5de52a0f592f2118502f36e386
```

- `.app` 内层 HAP 与外层 APP 均已用 AGC release 证书签名并通过 `hap-sign-tool verify-app`。
- Profile：`type=release`，`app-distribution-type=app_gallery`，bundle `com.unsunsk8er.biu`。
- 上传时优先使用 `.app`；如果 AGC 只接受 HAP，再用 `.hap`。

`biu-2.0.0-harmony-phone-release.hap` 是 **release 构建**（`debug:false`），已在 Mate 70 Pro 上验证：

- B 站搜索走原生 HTTP 桥
- 音频首连 CDN 仍可能 403，但会自动走渐进流/原生缓存 `file://` 回退
- AVSession 状态更新已节流到约 1s，通知栏和控制中心正常

它仍使用 DevEco 自用 debug 证书签名，**不是华为正式发布证书**。正式上架仍需华为开发者证书与 AppGallery 签名链路。

`build-profile.json5` 含本机绝对路径与加密密码，已 gitignore，不入库。

## 发布定位（2026-10-30）

当前决定：**自用 release 包，暂不推进 AppGallery 正式证书。**

- 本包用于 Mate 70 Pro 自用安装，不对外分发、不承诺应用商店升级。
- 触发重新评估正式证书的条件：需要公开分发、上架 AppGallery，或出现第二台长期维护设备。
- 届时需要重新处理华为开发者证书、签名 profile 和升级覆盖验证。

## 设备冒烟

```powershell
# 安装 release HAP、启动并校验移动壳
npm run smoke:harmony

# 已安装时跳过安装
npm run smoke:harmony -- --skip-install
```

脚本会检查进程存活、页面文本（搜索/歌单/设置/正在播放），布局 dump 写入 `.archive/smoke/layout.json`。

## 真实播放 E2E

```powershell
npm run e2e:harmony -- --skip-install
```

当前 E2E 覆盖：

- 搜索并打开 100P 集合的 P1
- 播放页进度前进
- seek 到 75%
- 音频服务 `HpaeSinkInputNode` 进入 RUNNING（输出活跃证据）
- Home 后台进程存活
- 通知栏媒体卡暂停（AVSession `SetAVPlaybackState:3`）
- 无 `[biu-audio] playback error` / jscrash

CDN 403 的 DASH→渐进流→原生缓存回退由 40 个单测覆盖；尚未在设备上制造真实 CDN 故障。结果写入 `.archive/e2e/summary.json`。

新克隆或换机时：

1. 复制 `build-profile.template.json5` 为 `build-profile.json5`；
2. 在 DevEco 打开工程，`File > Project Structure > Signing Configs`；
3. 选择 `default`，勾选 **Automatically generate signature**（需要登录华为账号）；
4. 点击 **Apply**（只点“自动生成”不会写回密码）；
5. `Build > Build Hap(s)`，或运行 `npm run harmony:phone:build`。

DevEco 会为 `com.unsunsk8er.biu` 生成 `.p7b/.cer/.p12`，并把 `signingConfigs` 与 `signingConfig` 写入工程级 `build-profile.json5`。

## 目录

```text
AppScope/                 应用级配置与图标
entry/                    EntryAbility + ArkUI Web 壳
entry/src/main/resources/rawfile/www/   构建时生成的单文件 UI（gitignore）
```

## 限制

- 这是 **ArkWeb 壳**，不是纯 ArkUI 重写；搜索/播放/歌单等页面仍是现有 React UI。
- 锁屏/控制中心已接入 AVSession；若要自定义通知栏/锁屏样式，后续考虑原生 `AVPlayer` 替代 WebView 音频。
- `release/` 未入库；二进制通过本地构建或 GitHub Releases 分发。
