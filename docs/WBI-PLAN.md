# WBI 单通道改造计划

目标：把「渲染进程直连 B 站 + 主进程改写 CORS」收敛为「主进程统一代理」，去掉 CORS 补丁，让 Cookie 只存在于主进程。

## 背景与现状

- 渲染层 [bilibiliApi.ts](../src/services/bilibiliApi.ts) 自带 WBI 签名（mixin key + `wts/w_rid`），所有搜索/详情/播放地址都走浏览器 `fetch`。
- 主进程 [main.ts](../electron/main.ts) 通过 `webRequest.onHeadersReceived` 回写 `Access-Control-Allow-Origin`，让渲染层能跨域读响应；这是当前架构最脆弱的点。
- `electron/biliApi.ts` 只剩收藏夹/扫码登录；主进程没有任何 WBI 实现，`net.fetch` 直连会被 `-352` 风控。

## 目标架构

```text
渲染层 api.ts ──IPC──▶ electron/biliApi.ts + wbi.ts ──▶ api.bilibili.com（带 Cookie/Referer/签名）
Android 渲染层 ──BiliProxy──▶ api.bilibili.com（保持现状）
```

## 实施步骤

### 1. WBI 签名模块 `electron/wbi.ts`

- 常量：64 位 `mixinKeyEncTab`。
- `fetchWbiKeys()`：`GET /x/web-interface/nav`，从 `data.wbi_img.img_url/sub_url` 取文件名拼 64 位 raw key，缓存 6 小时。
- `signQuery(params)`：按 key 排序、过滤 `!'()*`、`URLSearchParams` 编码、追加 `wts`、`w_rid = md5(query + mixinKey)`。
- MD5 用 Node `crypto.createHash('md5')`，不引第三方依赖。
- 验证：Node 脚本直连 nav + 一次 WBI 搜索，断言 `code === 0`。

### 2. 主进程数据层 `electron/biliApi.ts`

按现有渲染层实现逐个搬迁（保持参数与返回结构不变）：

| 域 | 接口 |
| --- | --- |
| 搜索 | `/x/web-interface/wbi/search/type`（video / bili_user） |
| 视频 | `/x/web-interface/view`、`/x/player/playurl`（fnval=16） |
| 推荐 | `/x/web-interface/popular`、`/x/web-interface/index/top/rcmd`、`/x/web-interface/ranking/region` |
| 空间 | `/x/space/wbi/arc/search` |
| 评论 | `/x/v2/reply/wbi/main` |
| 收藏 | 现有 `favorite*` 保持不变 |

统一封装 `biliFetch(path, params, { signed })`：Cookie、Referer、UA、10s 超时、`BiliApiError`、非 JSON 响应防御。

### 3. 渲染层切换 `src/services/api.ts`

- 新增 `const mode = window.electronAPI?.apiMode`（preload 暴露 `BIU_API_MODE`，默认 `renderer`）。
- `mode === 'main'` 时走 IPC，否则保持现有动态 import 渲染层实现。
- `bilibiliApi.ts` 保留给 Android / 浏览器，不删。

### 4. 移除 CORS 补丁

- `main.ts` 的 `onHeadersReceived(apiUrls, ...)` 仅在 `renderer` 模式注册。
- `onBeforeSendHeaders` 继续保留：音频/图片 CDN 仍需要 Referer。

### 5. 验证与切换

1. `npm run typecheck && npm run verify && npm run build`。
2. `BIU_API_MODE=main npm run smoke`（冒烟需扩展：真实搜索/播放）。
3. 真实网络验收：搜索、播放、歌词、登录、收藏夹导入/推送。
4. 全部通过后把 preload 默认值改为 `main`，删除 `renderer` 分支与 CORS 补丁，更新 README。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 主进程签名/参数与渲染层不一致 | 先双跑对比同一查询的响应结构，再切换 |
| Cookie 注入遗漏导致未登录 | 统一 `bilibiliCookieHeader()`，启动时校验 `SESSDATA` 是否存在 |
| B 站风控差异（UA/IP） | 复用现有 `desktopUserAgent`；失败时回退 `renderer` 模式 |
| 大改造回归面广 | 环境变量开关 + 默认旧路径，可随时回滚 |

## 回滚

删除 `BIU_API_MODE`（或设为 `renderer`）即可恢复旧路径；`bilibiliApi.ts` 与 CORS 补丁在验证通过前不删除。
