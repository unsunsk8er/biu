# 原生迁移计划

目标：把 ArkWeb 中的 React UI 逐页替换为 ArkUI，最终移除 WebView 与 `rawfile/www`。

## 已完成

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
