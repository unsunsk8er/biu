# 原生迁移计划

> **状态：已完成。** 当前 HAP 为纯原生 ArkUI + ArkTS，不再包含 WebView、`rawfile/www`、React 或 Vite 构建链。

目标：把 ArkWeb 中的 React UI 逐页替换为 ArkUI，最终移除 WebView 与 `rawfile/www`。

## 已完成

### Phase 12：收藏 / 最近播放 / 登录 / 封面

- 原生收藏：播放页收藏按钮，收藏页列表
- 原生最近播放：播放自动记录，最近页列表
- 原生 B 站扫码登录：QRCode 生成 / 轮询 / Cookie 持久化（URL + Set-Cookie）
- 原生封面匹配：iTunes 搜索匹配专辑封面
- 旧缓存文件扫描：下载页自动导入 `biu-audio-v3-*` 缓存记录
- 播放页收藏按钮、歌单页「收藏 / 最近」入口
- 真机验证：收藏页显示已收藏曲目；扫码登录页正常生成二维码

### Phase 9：原生播放队列

- `NativeQueue.ets`：队列、索引、随机、循环、进度持久化
- 搜索 / 歌单 / 下载播放时建立原生队列
- 播放页上一首 / 下一首
- 队列页：当前曲目、随机开关、循环模式、点击切换
- 多P视频选中后展开全部分P到队列，按 cid 播放
- 播放结束自动下一首
- 真机验证：搜索 20 首结果建立队列，队列页正常显示

### Phase 8：移除 WebView 与 Web 构建链

- `Index.ets` 删除 `Web` 组件、`webview` 控制器、JS Proxy、`rawfile/www`
- `BiuBridge` 删除 WebView 请求代理、JS 回调、Cookie jar 依赖
- 删除原生页面中对 `runJavaScript` / localStorage 的同步
- React/Web 源码、Vite、Vitest、ESLint 配置归档到 `archive/legacy/web-ui/`
- `package.json` 只保留 HAP 构建与真机冒烟脚本
- `scripts/build-harmony-phone.mjs` 直接构建 HAP，不再先跑 Web 构建
- HAP 真机验证：无 WebView 启动、搜索、播放、歌词、歌单、下载均可用

### Phase 7：原生下载与离线播放

- `NativeLibrary` 增加下载元数据
- 原生播放完成缓存后自动登记下载
- `NativeDownloadsPage.ets`：缓存列表、删除记录、离线播放
- 原生播放页支持 `file://` 本地音频
- 四个一级 Tab 均已使用原生页面，WebView 只作为底层兜底
- 真机验证：播放`青花瓷`后下载页出现缓存，点击可离线播放

### Phase 6：原生歌单

- `NativeLibrary.ets`：原生 Preferences 歌单/收藏/最近播放存储
- 首次打开从 Web localStorage 迁移歌单
- `NativePlaylistsPage.ets`：歌单列表、新建歌单、歌单详情
- 点击曲目直接进入原生播放页
- 真机验证：新建歌单 `Test`、列表持久化

### Phase 5：原生全局播放 + 迷你播放栏

- 原生播放页收起后不停止音频
- 原生迷你播放栏：封面、标题、作者、播放/暂停
- 点击迷你栏重新打开原生播放页
- 播放页组件常驻，隐藏时保留 AVPlayer 与事件监听
- 切换 Tab 不再中断播放
- 原生搜索 → 播放 → 收起 → 迷你栏 真机验证通过

### Phase 4：原生歌词

- `NativeLyricsApi.ets`
- OIAPI 搜索、候选打分、LRC 解析
- 原生播放页歌词视图、当前行高亮、自动滚动
- 点击歌词行 seek
- 真机验证：`青花瓷` 歌词正确显示并随播放高亮

### Phase 3：原生播放主链路

- `NativeBiliApi.getVideoInfo()` 获取标题、封面、分P、CID
- `NativeBiliApi.getPlayUrl()` 获取 DASH 音频流与备份 URL
- `NativePlayerPage.ets` 原生播放页
- 原生缓存 → AVTranscoder/AVMuxer → AVPlayer
- 原生播放/暂停、进度条、时间显示
- 真机验证：搜索`青花瓷` → 点击结果 → 原生播放页播放到 0:30

当前还没有原生歌词、歌单、下载和迷你播放栏，WebView 仍作为这些页面的 fallback。

### Phase 2：原生搜索页

- `NativeSearchPage.ets`
- 纯 ArkUI 搜索框、结果列表、封面、时长
- 直接调用 `NativeBiliApi` 原生搜索
- 点击结果通过 `window.__biuNativePlay` 交给现有播放器
- 过渡期仍复用 Web Now Playing / 歌词页，原生播放页下一步替换
- 真机验证：搜索 `jay` 可返回结果，点击结果进入播放页

### Phase 1.5：原生数据层

- `NativeBiliApi.ets`
- ArkTS 原生 HTTP 请求
- WBI 签名（nav 取 key、MD5、参数签名）
- Cookie 持久化，并可从当前 WebView Cookie jar 迁移
- 原生搜索接口已验证：`青花瓷` 返回 3 条结果 / 总计 1000

### Phase 1：原生基础验证

- 新增 `NativeSettingsPage.ets`
- 原生 Preferences 持久化设置
- 设置变更同步回 Web localStorage，保持双轨一致
- 原生浅色 / 深色主题（设置页、原生底栏）
- 设置页从 Web 侧读取当前设置完成首次迁移
- 其他 Tab 继续使用 WebView fallback
- WebView 保持在底层存活，切到原生设置页不销毁播放状态

## 下一步

### Phase 2：原生壳

- 原生 `Tabs` 接管全部一级页面
- 原生迷你播放栏
- 原生 Now Playing
- WebView 只作为未迁移页面的容器

### Phase 3：页面迁移

按顺序：

1. 歌单
2. 下载
3. 搜索
4. 播放页 / 歌词
5. 队列 / 收藏 / 最近播放

### Phase 4：移除 WebView

- 删除 `rawfile/www`
- 删除 Vite / React 构建
- 删除 `BiuHarmony` JS 桥
- 仅保留 ArkTS + NAPI + 原生音频

## 当前边界

- 原生设置页已经可用；其余页面仍是 WebView
- 设置页开关会写入原生 Preferences，并同步到 Web
- 主题变更会立即作用于原生设置页和原生底栏
- 离开设置页时，WebView 会加载对应 Tab 路由
