<div align="center">
  <img src="./src/assets/icon.png" width="112" height="112" alt="biu Logo" />
  <h1>biu</h1>
  <p>
    <strong>把 Bilibili 变成一座精致、灵动、拥有华为音乐风格的桌面音乐资料库。</strong>
  </p>
  <p>
    <a href="./README.en.md">English</a>
    ·
    <a href="#-快速开始">快速开始</a>
    ·
    <a href="#-harmonyos-pc">HarmonyOS PC</a>
    ·
  </p>
  <p>
    <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-45-47848F?style=for-the-badge&logo=electron&logoColor=fff" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=fff" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=fff" />
    <img alt="HarmonyOS" src="https://img.shields.io/badge/HarmonyOS-PC-D81E06?style=for-the-badge" />
  </p>
</div>

<br />

<div align="center">
  <table>
    <tr>
      <td align="center" width="25%">
        <h3>华为音乐风格</h3>
        <p>华为红、圆角卡片、深色沉浸播放页，自绘无边框标题栏与直角外框。</p>
      </td>
      <td align="center" width="25%">
        <h3>Bilibili 音乐源</h3>
        <p>搜索、推荐、排行榜、UP 主空间，一键转为音乐曲目。</p>
      </td>
      <td align="center" width="25%">
        <h3>桌面级播放器</h3>
        <p>托盘、队列、歌单、歌词、播放状态持久化。</p>
      </td>
      <td align="center" width="25%">
        <h3>HarmonyOS PC</h3>
        <p>鸿蒙 Electron 工程与 PC 端窗口行为专项适配。</p>
      </td>
    </tr>
  </table>
</div>

<br />

<div align="center">
  <pre>
┌──────────────────────────────────────────────────────────────┐
│                        biu                             │
│  Recommend · Search · Queue · Lyrics · Playlists · HarmonyOS  │
└──────────────────────────────────────────────────────────────┘
  </pre>
</div>

## 目录

- [项目愿景](#-项目愿景)
- [体验亮点](#-体验亮点)
- [功能全景](#-功能全景)
- [界面设计](#-界面设计)
- [技术架构](#-技术架构)
- [快速开始](#-快速开始)
- [桌面端构建](#-桌面端构建)
- [HarmonyOS PC](#-harmonyos-pc)
- [项目结构](#-项目结构)
- [数据持久化](#-数据持久化)
- [开发说明](#-开发说明)
- [路线图](#-路线图)
- [免责声明](#-免责声明)

## 项目愿景

biu 不是简单地“把 B 站视频拿来播放”。它试图做的是另一件事：把 Bilibili 上庞大、松散、标题复杂、形态各异的音乐内容，整理成一个真正适合聆听的桌面音乐体验。

在 biu 里，视频标题会被清洗成更适合歌词搜索的关键词；搜索结果会被组织成音乐列表；UP 主空间可以像音乐人主页一样浏览；播放队列、喜欢、最近播放和歌单会像资料库一样自然地沉淀下来。界面参考华为音乐的卡片化语言：深色内容面、圆角卡片、柔和阴影、华为红强调色，以及可切换的浅色模式；同时用自绘无边框顶栏和直角外框替代 KDE 标题栏。

这也是一个跨平台实验项目。除了常规 Electron 桌面端，它还把 `platform/HarmonyOS` 下的鸿蒙 PC Electron 工程纳入主流程，针对鸿蒙托盘、窗口三键、无边框窗口、播放器沉浸界面等行为做了单独适配。

## 体验亮点

### 1. 像音乐 App，而不是网页播放器

- 主页、推荐、搜索、歌单、设置页面均采用统一的华为音乐视觉语言。
- 页面切换、卡片悬停、播放器展开、歌词滚动都带有细腻动画。
- 底部播放器始终保持轻量，展开后进入沉浸式播放空间。
- 歌曲封面、沉浸式播放页、唱片旋转和歌词运动共同构成完整的播放氛围。

### 2. 把 Bilibili 视频整理成可听的音乐

- 支持 Bilibili 视频搜索。
- 支持用户搜索与 UP 主空间视频浏览。
- 支持推荐页。
- 视频结果会转换为统一的曲目模型，进入队列、歌单、喜欢和最近播放。

### 3. 适合长期使用的资料库

- 最近播放自动记录。
- 喜欢的歌曲独立聚合。
- 自定义歌单持久化保存。
- 支持导入/导出歌单 JSON。
- 支持从 B 站收藏夹导入歌单，并可把本地歌单或「我喜欢」手动推送到 B 站收藏夹。
- 播放队列和播放状态可恢复，退出重开后不丢上下文。
- 播放中的歌曲会自动匹配歌曲名、歌手与专辑封面（网易云 / QQ 音乐 / iTunes），播放页也可手动重新匹配。

### 4. 深度桌面化

- B 站搜索 / 详情 / 播放地址由渲染进程直连（带 WBI 签名），主进程负责 Cookie 与 CORS；登录、收藏夹同步与歌词、封面查询走 IPC。
- 关闭窗口时隐藏到托盘。
- 托盘菜单可控制播放。
- 支持 Windows/macOS/Linux 的 electron-builder 配置。
- 支持 HarmonyOS PC 的 Electron 工程资源同步与 HAP 构建准备。

## 功能全景

### 搜索

搜索页不仅是一个输入框。它参考华为音乐的搜索与分类卡片重新设计：

- 支持视频搜索和用户搜索。
- 搜索结果以专辑/歌曲列表风格展示。
- 用户结果可进入对应空间，继续浏览该 UP 主视频。
- 搜索空状态、加载状态、错误状态均有独立视觉。
- 每条曲目都支持播放、下一首播放、加入队列、添加至歌单。

### 推荐

- 推荐页展示 Bilibili 推荐音乐内容。
- 首页式 hero 区块使用封面作为视觉焦点。
- 曲目列表保持高密度但不拥挤，适合快速扫视。

### 播放器

底部播放器提供常用控制：

- 播放/暂停。
- 上一首/下一首。
- 随机播放。
- 循环模式。
- 播放进度拖动。
- 音量控制与静音。
- 打开播放队列。
- 添加当前歌曲至歌单。
- 展开沉浸播放页。

沉浸播放器提供更强的视觉表达：

- 大封面与动态背景。
- 旋转唱片装饰。
- 歌词面板与手动歌词匹配。
- 全屏/退出全屏。
- 关闭到托盘。
- 收起回主界面。

### 歌词

Bilibili 视频标题常常包含“官方 MV”“完整版”“翻唱”“Live”“高音质”等噪声。biu 在搜索歌词前会做一层标题处理：

- 去除常见视频标题噪声。
- 提取书名号、引号中的候选歌名。
- 生成多组搜索关键词。
- 对歌词候选按标题相似度、歌手、专辑、时长进行评分。
- 缓存匹配成功和失败结果，减少重复请求。
- 支持手动搜索歌词并选择具体版本。

### 歌单

- 侧边栏播放列表区域可新建歌单。
- 新建歌单弹窗支持歌单名和描述。
- 歌单显示在“所有歌单”与侧边栏列表中。
- 歌曲可从任意页面添加至歌单。
- 歌单详情页支持播放全部、删除歌单、单曲移出、批量移出。
- 批量操作进入编辑模式后才显示选择框，避免常态界面杂乱。

### 播放队列

- 查看当前播放队列。
- 当前播放曲目有动态均衡器指示。
- 支持将队列歌曲加入歌单。
- 支持单首移出队列。
- 支持选择编辑模式与批量移除。

### 设置

设置页按照华为音乐 / 系统设置的卡片分组风格重构：

- 外观默认深色，支持浅色 / 深色 / 跟随系统；Linux 使用自绘无边框标题栏、自定义窗口控制和无圆角外框。
- 侧边栏展开 / 折叠 / 自动。
- 播放音质（标准 / 高品质 / 无损，取源时按目标档位排序并自动回退）。
- 自动播放。
- 歌词显示。
- 歌单导入 / 导出。
- B 站收藏夹导入与手动推送：登录后可在「歌单同步」中选择收藏夹导入，或将本地歌单/「我喜欢」推送到已有/新建收藏夹；推送只新增，不删除 B 站已有收藏。
- 登录状态显示与扫码登录入口。

## 界面设计

biu 的设计目标不是“炫技”，而是让复杂功能保持音乐应用应有的轻盈感。

| 设计元素       | 使用方式                                                       |
| -------------- | -------------------------------------------------------------- |
| 华为音乐风格 | 华为红强调色、圆角卡片、深色优先、沉浸播放页、自绘无边框顶栏 |
| 应用图标       | 柔和方圆形底 + 奶油色 B + 星芒点缀，小尺寸自动简化               |
| 字体           | Inter（OFL）用于拉丁字符，Noto Sans CJK 负责中文                 |
| 圆角与层级     | 软件外框无圆角，窗口与全屏均直角铺满；无外描边/外阴影；内部卡片保留圆角 |
| 轻量动效       | 播放器展开、歌词滚动、卡片悬停；NowPlaying 背景静态柔焦           |
| 高密度列表     | 歌曲列表可快速扫视，操作按钮在悬停时浮现                         |

## 技术架构

```text
┌──────────────────────────────────────────────────────────────┐
│                         React UI                              │
│ Pages · Components · Contexts · Hooks · Services              │
└──────────────────────────────┬───────────────────────────────┘
                               │ window.electronAPI
┌──────────────────────────────▼───────────────────────────────┐
│                    Electron Preload Bridge                    │
│ Bili API · Lyrics API · Window Control · Tray Control         │
└──────────────────────────────┬───────────────────────────────┘
                               │ IPC
┌──────────────────────────────▼───────────────────────────────┐
│                    Electron Main Process                      │
│ Protocol · BrowserWindow · Tray · API Proxy · Persistence     │
└──────────────────────────────┬───────────────────────────────┘
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
┌───────▼────────┐                          ┌─────────▼─────────┐
│ Desktop Builds │                          │ HarmonyOS PC HAP   │
│ Win/macOS/Linux│                          │ platform/HarmonyOS │
└────────────────┘                          └───────────────────┘
```

### 前端层

- `pages/` 负责路由页面。
- `components/` 负责播放器、歌词、队列、布局和复用 UI。
- `contexts/` 管理播放、登录、播放页、添加歌单等全局状态。
- `services/` 封装 Bilibili 数据、歌词匹配和本地资料库。
- `hooks/` 封装主题、设置、歌词等状态逻辑。

### Electron 层

- 主进程注册 Bilibili API、歌词 API 和窗口控制 IPC。
- 使用自定义 `app://` 协议加载生产环境前端资源，避免 `file://` 下 ESM/CORS 问题。
- 托盘和主窗口生命周期在主进程统一管理。
- `preload.cjs` 暴露有限的安全 bridge 给渲染进程。

### HarmonyOS PC 层

- `scripts/prepare-harmony.mjs` 将构建产物同步到鸿蒙工程资源目录。
- `scripts/build-harmony.mjs` 尝试调用 Hvigor 构建 HAP。
- `platform/HarmonyOS/web_engine` 中包含鸿蒙 Electron 适配层。
- 针对 `process.platform === "openharmony"` 做平台差异处理。

### HarmonyOS Phone 层

- `platform/HarmonyOSPhone` 是 Mate 70 Pro / HarmonyOS 7 的 ArkTS Web 壳工程。
- `npm run harmony:phone:prepare` 生成单文件 Web 资源；`npm run harmony:phone:build` 调用 hvigor 产出 HAP。
- 使用 ArkWeb 直接加载内置 UI；已验证搜索、分P播放、后台音频、扫码登录二维码与底部导航。
- 详见 [platform/HarmonyOSPhone/README.md](platform/HarmonyOSPhone/README.md)。

## 快速开始

### 环境要求

- Node.js 22.12 或更高版本（推荐 24 LTS）。
- npm。
- 桌面打包需要对应平台环境。
- HarmonyOS PC 构建需要 DevEco Studio 和鸿蒙 Electron 工程环境。
- HarmonyOS Phone 构建需要 DevEco Studio 26 / HarmonyOS SDK API 26，并配置调试签名。

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 启动 Electron

```bash
npm run electron:start
```

## 桌面端构建

```bash
npm run electron:build
```

构建产物输出到：

```text
release/
```

当前 electron-builder 已配置：

- Windows: NSIS 安装包。
- macOS: DMG 与 ZIP。
- Linux: AppImage 与 DEB。

### 代码签名与自动更新

- CI 读取 `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`（Windows）与 `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD`（macOS）签名安装包；macOS 在提供 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` 时自动公证。未配置 secrets 时产出未签名包。
- 打包版通过 `electron-updater` 检查 GitHub Release：启动后延迟检查，用户确认后下载，重启完成安装。可用 `BIU_DISABLE_UPDATES=1` 关闭。
- Android release 签名读取 `BIU_KEYSTORE_PATH` 等环境变量；签名材料不入库。
- 完整流程、secrets 列表与回滚说明见 [docs/RELEASE.md](./docs/RELEASE.md)。

### SteamOS / Linux AppImage

```bash
npm run build:appimage
```

产物：

```text
release/biu-2.0.0-x86_64.AppImage
```

首次运行前赋予执行权限：

```bash
chmod +x release/biu-2.0.0-x86_64.AppImage
./release/biu-2.0.0-x86_64.AppImage
```

SteamOS 3.9 桌面模式（KDE Wayland + XWayland）已验证：

- 无需额外安装依赖，系统自带的 FUSE 2、NSS、GTK3、Noto CJK 字体即可运行。
- 界面采用华为音乐风格的深色/浅色主题、华为红强调色、Inter + Noto Sans 和圆角卡片；Linux 下使用自绘无边框标题栏与直角外框。
- 从旧版 BiliMusic 升级时会自动迁移登录 Cookie、歌单与喜欢到 `~/.config/biu`。
- 关闭窗口会收进系统托盘；托盘不可用时自动退化为最小化，不会留下无法找回的后台进程。
- 支持 Ctrl+Q 退出、Ctrl+W 收进托盘、F11 全屏、Esc 退出全屏。

### SteamOS 稳定性模式

在部分 SteamOS 3.9 / AMD Radeon 680M / Mesa 26.x / KWin 6.7 组合上，Electron 的 GPU 合成与 KWin 的 OpenGL 上下文同时工作时可能出现 VSync 失败、KWin 丢失 GL 上下文，极端情况下整机黑屏冻结。biu 1.2.1 起在 Linux 上默认启用稳定性模式：

- **Wayland 会话默认使用原生 Wayland 窗口**，启用 Chromium `text-input-v3`，ibus / Fcitx5 Rime 都可以在搜索框正常输入中文；Linux 使用自绘无边框标题栏，KWin 只负责窗口管理。
- **禁用 Electron GPU 合成**，改用软件渲染；不再创建第二个 GPU/GL 上下文。
- **Linux 托盘改用原生菜单**，不再创建透明的 always-on-top 弹层窗口。
- 隐藏到托盘时暂停渲染器的动画/定时器（播放中除外），并缩小隐藏窗口的表面尺寸，降低后台 CPU 占用。
- 软件渲染下自动关闭背景模糊、毛玻璃和大面积动态背景。
- 主进程会把启动、GPU 状态、窗口、渲染进程崩溃、健康状态写入 `~/.config/biu/logs/biu.log`。
- 如确实需要调试硬件加速，可设置 `BIU_ENABLE_GPU=1` 启动；不建议日常使用。

如果输入法候选框不出现，请确认 Plasma 的输入法（虚拟键盘）设置为当前正在使用的 IBus 或 Fcitx5，并确认输入法服务正在运行。少数 Wayland 环境下若原生窗口出现问题，可临时用 XWayland 回退：

```bash
BIU_OZONE_PLATFORM=x11 ./release/biu-2.0.0-x86_64.AppImage
```

如果黑屏仍然发生，请优先检查系统层日志：

```bash
journalctl -b -1 -k | grep -iE "amdgpu|drm|gpu|timeout|reset"
journalctl -b -1 | grep -iE "kwin_wayland|plasmashell|context"
```

这台机器此前的日志中没有 biu 崩溃或 amdgpu 重置记录，但 KWin 在 biu 启动前就有 GL 上下文告警，并在打开 KWin Overview 后立即硬冻结；这更像是 SteamOS 的 KWin/Mesa 层问题，建议同时更新 SteamOS，出现异常时避免使用概览界面。

## HarmonyOS PC

鸿蒙 PC Electron 工程位于：

```text
platform/HarmonyOS
```

### 准备资源

```bash
npm run harmony:prepare
```

该命令会：

1. 执行 `npm run build`。
2. 清理旧的鸿蒙 app 资源目录。
3. 复制 `dist/`。
4. 复制 `dist-electron/`。
5. 写入最小运行时 `package.json`。

目标目录：

```text
platform/HarmonyOS/web_engine/src/main/resources/resfile/resources/app
```

### 构建 HAP

```bash
npm run harmony:build
```

如果当前命令行环境找不到 `hvigor` 或 `hvigorw`，请使用 DevEco Studio 打开：

```text
platform/HarmonyOS
```

然后执行：

```text
Build -> Build Hap(s)/APP(s) -> Build Hap(s)
```

### 鸿蒙专项行为

| 场景         | 处理                                                      |
| ------------ | --------------------------------------------------------- |
| 平台判断     | `process.platform === "openharmony"`                      |
| 托盘图标     | 使用 `electron/tray.png`                                  |
| 托盘右键窗口 | 鸿蒙禁用，避免黑色浮窗                                    |
| 主窗口       | 保持无边框，同时通过适配层显示鸿蒙原生三键                |
| 播放器界面   | 隐藏鸿蒙原生三键，退出后恢复                              |
| 全屏         | 保持播放器和系统全屏状态同步                              |
| 资源         | AppScope 与 electron 模块图标、启动图标、托盘图标均已替换 |

## 常用脚本

| 命令                      | 说明                              |
| ------------------------- | --------------------------------- |
| `npm run dev`             | 启动 Vite 开发服务器              |
| `npm run typecheck`       | 渲染层 + 主进程 TypeScript 校验   |
| `npm run verify`          | IPC 通道/窗口安全静态门禁         |
| `npm run lint`            | ESLint（0 error，warning 有上限）  |
| `npm test`                | Vitest 单元测试                   |
| `npm run check`           | typecheck + verify + lint + test  |
| `npm run smoke`           | 构建后启动隐藏窗口做运行时冒烟    |
| `npm run build`           | 构建前端与 Electron 主进程        |
| `npm run preview`         | 预览前端构建产物                  |
| `npm run electron:start`  | 构建后启动 Electron               |
| `npm run electron:build`  | 打包桌面安装包                    |
| `npm run build:appimage`  | 构建 Linux AppImage               |
| `npm run harmony:prepare` | 构建并同步鸿蒙资源                |
| `npm run harmony:build`   | 同步资源并尝试构建 HAP            |

## 项目结构

```text
biu
├─ electron/
│  ├─ main.ts                Electron 主进程入口（窗口、托盘、持久化、协议）
│  ├─ updater.ts             electron-updater 自动更新
│  ├─ security.ts            IPC 发送方白名单
│  ├─ preload.cjs            渲染层安全 bridge
│  ├─ tray-preload.cjs       托盘面板最小 bridge
│  ├─ trayHtml.ts            托盘面板 HTML
│  ├─ biliApi.ts             B 站收藏夹 / 扫码登录 IPC
│  ├─ lyricsApi.ts           歌词 API 代理
│  ├─ coverApi.ts            第三方封面查询
│  ├─ icon.png               桌面应用图标
│  └─ tray.png               HarmonyOS 托盘图标
├─ src/
│  ├─ assets/                前端资源
│  ├─ components/            播放器、队列、歌词、布局和通用组件
│  ├─ contexts/              播放、登录、播放页、歌单弹窗状态
│  ├─ hooks/                 主题、设置、歌词等 hooks
│  ├─ pages/                 搜索、歌单、下载、设置
│  ├─ services/              Bilibili 数据、歌词匹配、音频缓存
│  ├─ styles/                全局样式与华为音乐设计系统
│  └─ types/                 Electron bridge 与业务类型
├─ scripts/
│  ├─ prepare-android.mjs    构建并同步 Android WebView 资源
│  ├─ build-android.mjs      解析 Gradle 并执行 assembleDebug/Release
│  ├─ prepare-harmony.mjs    同步 HarmonyOS app 资源
│  └─ build-harmony.mjs      尝试调用 Hvigor 构建 HAP
├─ platform/HarmonyOS/       HarmonyOS PC Electron 工程
├─ dist/                     前端构建产物
├─ dist-electron/            Electron 构建产物
└─ release/                  桌面端安装包输出
```

## 数据持久化

项目会在本地保存：

- 当前播放曲目。
- 播放队列。
- 播放进度。
- 音量、静音、随机、循环。
- 最近播放。
- 我喜欢。
- 自定义歌单。
- 歌词缓存和手动匹配结果。
- 主题和设置项。
- 登录用户基础信息。

主要存储方式：

- `localStorage`：前端状态、资料库、歌单、歌词缓存。
- HarmonyOS：上述关键键值同步写入 `userData/renderer-persistent-store.json`，避免 WebEngine 清空 localStorage 时丢歌单。
- `IndexedDB`：离线音频缓存（Android 下载与自动缓存）。

## 开发说明

### 标题清洗与歌词匹配

歌词匹配逻辑集中在 `src/services/lyrics.ts`。它会对 Bilibili 标题做多轮处理：

- Unicode 规范化。
- 去除常见视频噪声词。
- 提取引号和书名号内容。
- 去掉投稿描述、合集、排行、直播等非歌名信息。
- 构建多个候选搜索词。
- 对候选歌词按相似度评分。

### 播放队列与状态

播放状态集中在 `src/contexts/PlayerContext.tsx`：

- 队列。
- 当前曲目。
- 播放/暂停。
- 音量。
- 进度。
- 随机和循环。
- 自动播放。
- 托盘状态同步。

### 歌单系统

歌单相关能力由本地服务和 UI 共同完成：

- `src/utils/storage.ts` 负责歌单的读写与导入导出（HarmonyOS 下经持久层双写）。
- `Sidebar` 负责新建歌单入口。
- `AddToPlaylistContext` 提供通用添加弹窗。
- `Playlists` 页面负责总览、详情、批量编辑。

### 桌面窗口策略

窗口逻辑集中在 `electron/main.ts`：

- 普通平台使用自绘标题栏按钮。
- HarmonyOS PC 使用原生三键。
- 关闭窗口默认隐藏到托盘。
- 生产环境使用 `app://local/index.html` 加载页面。
- 播放器界面会要求隐藏平台原生三键。

## 路线图

- [ ] 更完整的本地下载管理。
- [ ] 歌词源配置与多源回退。
- [ ] 更精确的 Bilibili 音频质量选择。
- [ ] 歌单封面编辑。
- [ ] 播放历史统计。
- [ ] Mini Player / 迷你播放窗。
- [ ] HarmonyOS PC 行为继续细化。
- [ ] 更完整的自动化测试。

## 贡献

欢迎提交 issue、建议和 PR。这个项目更偏向产品体验驱动，因此 UI、动效、交互、歌词匹配、跨平台行为和稳定性都很重要。

建议提交前至少确认：

```bash
npm run check
npm run build
```

如果修改了 HarmonyOS 工程：

```bash
npm run harmony:prepare
```

并在 DevEco Studio 中重新构建验证。

## 免责声明

biu 仅用于学习、研究和个人使用。项目与 Bilibili、华为、华为音乐及相关服务提供方没有从属、授权或商业合作关系。界面为独立实现，不包含官方素材。项目不内置任何音频、视频或歌词资源。

请遵守相关平台服务条款、版权规定和当地法律法规。不要将本项目用于侵犯版权、规避平台限制或违反服务条款的用途。

## 许可证

biu 源代码以 [MIT License](./LICENSE) 发布。第三方组件、字体与 HarmonyOS 目录中华为提供材料的授权说明见 [NOTICE](./NOTICE)。

## 作者

由 MikannQAQ 设计与开发。

