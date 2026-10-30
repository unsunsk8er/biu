import {
  app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, nativeTheme, net, protocol, screen, session, shell,
} from 'electron'
import fs from 'fs'
import path from 'path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { registerBiliApiHandlers } from './biliApi'
import { registerLyricsApiHandlers } from './lyricsApi'
import { registerCoverApiHandlers } from './coverApi'
import { getTrayHtml } from './trayHtml'
import { checkForUpdatesManually, initAutoUpdater } from './updater'
import {
  assertTrustedSender,
  isTrustedSender,
  trustWebContents,
  untrustWebContents,
} from './security'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isHarmonyOS = (process.platform as string) === 'openharmony'
const APP_NAME = 'biu'
// Previous user-data directory, assembled so it is not mistaken for current branding.
const PREVIOUS_APP_NAME = ['Bu', 'sic'].join('')
// The brand before this rename; assembled for the same reason, but still needed
// once for a one-time userData migration.
const LEGACY_BRAND_NAME = ['Biu', 'sic'].join('')
const DISPLAY_NAME = 'biu'
const APP_ID = 'com.unsunsk8er.biu'
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

// 固定应用名与 userData 目录：dev、electron-builder 打包、AppImage 三种运行方式
// 都会读写 ~/.config/biu，不会出现「换个方式启动就丢歌单」的情况。
// BIU_USER_DATA_DIR 用于便携模式/自动化测试指定独立目录。
app.setName(APP_NAME)
const userDataDir = process.env.BIU_USER_DATA_DIR
  ? path.resolve(process.env.BIU_USER_DATA_DIR)
  : path.join(app.getPath('appData'), APP_NAME)
// 首次启动时目录可能尚不存在；Chromium 的单实例锁需要它可写，先建出来
fs.mkdirSync(userDataDir, { recursive: true })
app.setPath('userData', userDataDir)

// 华为音乐风格使用应用内自绘标题栏；Linux 也不再使用 KWin/Breeze 原生窗框。
const useNativeFrame = false

// ===== 诊断日志 =====
// 黑屏/整机冻结后系统日志可能来不及落盘，应用侧日志能帮助区分「biu 崩溃」
// 与「KWin/GPU 冻结」。文件限制 2MB，避免长期运行无限增长。
const logFile = path.join(userDataDir, 'logs', 'biu.log')
function appendLog(line: string): void {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    try {
      if (fs.statSync(logFile).size > 2 * 1024 * 1024) {
        fs.rmSync(`${logFile}.1`, { force: true })
        fs.renameSync(logFile, `${logFile}.1`)
      }
    } catch {
      // 文件还不存在时忽略
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // 日志失败绝不影响主流程
  }
}
function logEvent(event: string, data?: unknown): void {
  let detail = ''
  if (data !== undefined) {
    try {
      detail = ` ${typeof data === 'string' ? data : JSON.stringify(data)}`
    } catch {
      detail = ' [unserializable]'
    }
  }
  appendLog(`${event}${detail}`)
}

// ===== SteamOS 稳定性模式 =====
// SteamOS 3.9.5 / Radeon 680M / Mesa 26.1.2 上，Electron 的 GPU 合成与该机
// KWin 的 OpenGL 上下文存在冲突风险：日志中反复出现
// GetVSyncParametersIfAvailable() failed，随后 KWin 在概览界面丢失 GL 上下文并整机冻结。
// 默认让 Electron 完全使用软件合成，避免 biu 参与 GPU 上下文。
// 需要调试硬件加速时可设置 BIU_ENABLE_GPU=1。
const allowGpu = process.env.BIU_ENABLE_GPU === '1'
const useSoftwareRendering = process.platform === 'linux' && !allowGpu
if (useSoftwareRendering) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-gpu-rasterization')
  app.commandLine.appendSwitch('disable-accelerated-2d-canvas')
  app.commandLine.appendSwitch('disable-accelerated-video-decode')
}

// ===== Wayland 输入法 =====
// KDE Wayland 下，XWayland 窗口无法使用 compositor 的 text-input 协议。
// 这会导致 IBus / Fcitx5 Rime 在搜索框里无法输入中文。
// Electron 36 的 Ozone 平台在 JS 之前就已选定，单纯 appendSwitch
// 不足以切到 Wayland，因此这里用同一可执行文件带参数重新启动一次。
// 需要用 XWayland 排查时：BIU_OZONE_PLATFORM=x11。
const ozoneEnv = process.env.BIU_OZONE_PLATFORM
const forceX11 = ozoneEnv === 'x11'
const forceWayland = ozoneEnv === 'wayland'
let cliOzone: string | undefined
const ozoneEqArg = process.argv.find((arg) => arg.startsWith('--ozone-platform='))
if (ozoneEqArg) {
  cliOzone = ozoneEqArg.split('=')[1]
} else {
  const ozoneIndex = process.argv.indexOf('--ozone-platform')
  if (ozoneIndex >= 0) cliOzone = process.argv[ozoneIndex + 1]
}
const waylandSession = process.platform === 'linux'
  && (forceWayland || (process.env.XDG_SESSION_TYPE === 'wayland' && Boolean(process.env.WAYLAND_DISPLAY)))
const useNativeWayland = process.platform === 'linux'
  && !forceX11
  && (cliOzone ? cliOzone === 'wayland' : waylandSession)

// Ozone 平台必须在进程启动前决定。父进程只负责拉起新进程，
// 自身不获取单实例锁，避免把子进程挡在门外。
if (process.platform === 'linux' && waylandSession && !forceX11 && !cliOzone && !process.env.BIU_WAYLAND_REEXEC) {
  const waylandArgs = [
    '--ozone-platform=wayland',
    '--enable-wayland-ime',
    '--wayland-text-input-version=3',
    '--enable-features=WaylandWindowDecorations',
  ]
  const relaunchTarget = process.env.APPIMAGE || process.execPath
  const relaunchArgs = [...waylandArgs, ...process.argv.slice(1)]
  try {
    logEvent('relaunch-wayland', { target: relaunchTarget, args: relaunchArgs })
    const child = spawn(relaunchTarget, relaunchArgs, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, BIU_WAYLAND_REEXEC: '1' },
    })
    child.unref()
    process.exit(0)
  } catch (err) {
    // 拉起失败时退回 XWayland，保证应用至少能启动。
    logEvent('relaunch-wayland-failed', err instanceof Error ? err.message : String(err))
  }
}

// 子进程已经带 CLI 参数时这一步是幂等的；保留是为了覆盖直接从
// 已带 Wayland 参数的终端启动的情况。
if (useNativeWayland) {
  app.commandLine.appendSwitch('enable-wayland-ime')
  app.commandLine.appendSwitch('wayland-text-input-version', '3')
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
}

process.on('uncaughtException', (error) => {
  logEvent('uncaughtException', error?.stack || String(error))
})
process.on('unhandledRejection', (reason) => {
  logEvent('unhandledRejection', reason instanceof Error ? reason.stack : String(reason))
})
app.on('child-process-gone', (_event, details) => {
  logEvent('child-process-gone', {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    serviceName: details.serviceName,
  })
})

// 读取 Plasma 的选中色（Breeze 默认 #3daee9），让 biu 跟随 SteamOS 的系统强调色。
// 找不到或解析失败时退回 Breeze 蓝，不影响启动。
function readPlasmaAccentColor(): string {
  try {
    const text = fs.readFileSync(path.join(app.getPath('home'), '.config', 'kdeglobals'), 'utf8')
    let section = ''
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      if (line.startsWith('[') && line.endsWith(']')) {
        section = line.slice(1, -1)
        continue
      }
      if (section === 'Colors:Selection' && line.startsWith('BackgroundNormal=')) {
        const rgb = line.slice('BackgroundNormal='.length).split(',').map((part) => Number(part.trim()))
        if (rgb.length === 3 && rgb.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
          return `#${rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
        }
      }
    }
  } catch {
    // 非 KDE 桌面或还没有 kdeglobals 时使用默认 Breeze 蓝
  }
  return '#3daee9'
}
const plasmaAccentColor = readPlasmaAccentColor()

// 单实例必须最早判断：第二实例从桌面/AppImage 重复启动时直接退出，由已有实例
// 处理 second-instance 并唤起窗口，避免两个进程争抢托盘、Cookie 与调试端口。
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.exit(0)
  process.exit(0)
}
app.on('second-instance', () => {
  if (!isQuitting) showMainWindow()
})

logEvent('startup', {
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  softwareRendering: useSoftwareRendering,
  nativeWayland: useNativeWayland,
  ozonePlatform: useNativeWayland ? 'wayland' : (cliOzone || 'x11'),
  appImage: Boolean(process.env.APPIMAGE),
})

// One-time migration from the pre-rename brand directory into the new biu
// userData directory. Runs first so newer data wins over the older Busic copy.
function migrateLegacyBrandData() {
  if (process.env.BIU_NO_MIGRATE === '1') return
  const marker = path.join(userDataDir, '.migrated-from-legacy-brand')
  if (fs.existsSync(marker)) return
  const legacyDir = path.join(app.getPath('appData'), LEGACY_BRAND_NAME)
  if (!fs.existsSync(legacyDir)) return
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    const entries = [
      'Local Storage', 'Cookies', 'Cookies-journal', 'Session Storage',
      'Preferences', 'renderer-persistent-store.json', 'window-state.json',
    ]
    let copied = 0
    for (const entry of entries) {
      const src = path.join(legacyDir, entry)
      const dest = path.join(userDataDir, entry)
      if (!fs.existsSync(src) || fs.existsSync(dest)) continue
      fs.cpSync(src, dest, { recursive: true, force: false, errorOnExist: false })
      copied += 1
    }
    fs.writeFileSync(marker, `${new Date().toISOString()}\nfrom=${legacyDir}\n`)
    console.log(`[${APP_NAME}] migrated legacy-brand data (${copied} entries)`)
  } catch (err) {
    console.warn(`[${APP_NAME}] legacy-brand migration skipped:`, err instanceof Error ? err.message : String(err))
  }
}
migrateLegacyBrandData()

// Migrate the previous-brand userData directory into biu before the
// older BiliMusic migration runs, so playlists, cookies and window preferences
// survive the rename.
function migratePreviousBrandData() {
  if (process.env.BIU_NO_MIGRATE === '1') return
  const marker = path.join(userDataDir, '.migrated-from-previous-brand')
  if (fs.existsSync(marker)) return
  const legacyDir = path.join(app.getPath('appData'), PREVIOUS_APP_NAME)
  if (!fs.existsSync(legacyDir)) return
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    const entries = [
      'Local Storage', 'Cookies', 'Cookies-journal', 'Session Storage',
      'Preferences', 'renderer-persistent-store.json', 'window-state.json',
    ]
    let copied = 0
    for (const entry of entries) {
      const src = path.join(legacyDir, entry)
      const dest = path.join(userDataDir, entry)
      if (!fs.existsSync(src) || fs.existsSync(dest)) continue
      fs.cpSync(src, dest, { recursive: true, force: false, errorOnExist: false })
      copied += 1
    }
    fs.writeFileSync(marker, `${new Date().toISOString()}\nfrom=${legacyDir}\n`)
    console.log(`[${APP_NAME}] migrated previous-brand data (${copied} entries)`)
  } catch (err) {
    console.warn(`[${APP_NAME}] previous-brand migration skipped:`, err instanceof Error ? err.message : String(err))
  }
}
migratePreviousBrandData()

// 从旧版 BiliMusic 无缝升级：只搬运登录 Cookie 与本地资料库，
// 不复制缓存目录，也不迁移 OTA 渲染补丁（避免把旧品牌界面带进 biu）。
function migrateLegacyUserData() {
  if (process.env.BIU_NO_MIGRATE === '1') return
  const marker = path.join(userDataDir, '.migrated-from-bilimusic')
  if (fs.existsSync(marker)) return
  const legacyDirs = ['bilimusic', 'BiliMusic'].map((name) => path.join(app.getPath('appData'), name))
  const legacy = legacyDirs.find((dir) =>
    fs.existsSync(path.join(dir, 'Local Storage')) || fs.existsSync(path.join(dir, 'Cookies')),
  )
  if (!legacy) return
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    const entries = [
      'Local Storage',
      'Cookies',
      'Cookies-journal',
      'Session Storage',
      'Preferences',
      'renderer-persistent-store.json',
    ]
    let copied = 0
    for (const entry of entries) {
      const src = path.join(legacy, entry)
      const dest = path.join(userDataDir, entry)
      if (!fs.existsSync(src) || fs.existsSync(dest)) continue
      fs.cpSync(src, dest, { recursive: true, force: false, errorOnExist: false })
      copied += 1
    }
    fs.writeFileSync(marker, `${new Date().toISOString()}\nfrom=${legacy}\n`)
    console.log(`[${APP_NAME}] migrated user data from ${legacy} (${copied} entries)`)
  } catch (err) {
    console.warn(`[${APP_NAME}] user data migration skipped:`, err instanceof Error ? err.message : String(err))
  }
}
migrateLegacyUserData()

// 生产环境用自定义 app:// 协议加载渲染层：file:// 下 ESM(type=module) 脚本会被
// Chromium 的 CORS 策略拦截（file:// 为不透明源）导致页面空白。自定义标准安全协议
// 提供合法 origin，模块脚本与相对资源即可正常加载。须在 app ready 之前注册。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// 远程调试仅在开发态或显式 BIU_DEBUG_PORT 下开启，正式运行不再暴露 17689 端口。
const debugPort = process.env.BIU_DEBUG_PORT || (isDev ? '17689' : '')
if (debugPort) {
  app.commandLine.appendSwitch('remote-debugging-port', debugPort)
  app.commandLine.appendSwitch('remote-allow-origins', '*')
}

// 恢复上次播放需要无手势自动播放；后台不节流，隐藏到托盘后进度/音频状态仍持续更新。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const chromeMajor = process.versions.chrome?.split('.')[0] || '136'
const desktopUserAgent = process.platform === 'win32'
  ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
  : process.platform === 'darwin'
    ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`
    : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`

// B站请求头处理
//
// 注意：Electron 每个 session 的 webRequest 事件只允许注册一个监听器，
// 重复调用 onBeforeSendHeaders 会覆盖之前的。因此资源 CDN 与 API 的请求头
// 处理必须合并在同一个监听器内，否则后注册的会让前者失效（音频 CDN 拿不到
// Referer → 403）。
function setupBiliHeaders() {
  // 覆盖 B站所有资源/接口域名（图片、音频 CDN、API、登录）
  const biliUrls = [
    'https://*.hdslb.com/*',
    'https://*.bilivideo.com/*',
    'https://*.bilivideo.cn/*',
    'https://*.akamaized.net/*',
    'https://*.bilibili.com/*',
  ]

  // 记录每个 API 请求的渲染进程真实 Origin，供 onHeadersReceived 回显。
  // credentials:'include' 模式下浏览器要求 ACAO 必须是具体 origin，不能为 '*'，
  // 否则跨域响应被拦（dev 的 http://localhost:5173 会触发，file:// 不会）。
  const reqOrigin = new Map<number, string>()

  // 请求发出前：注入 Referer + Origin（改写到 bilibili.com 绕过反爬）。
  // 音频/图片 CDN（bilivideo/hdslb）缺少 Referer 会返回 403。
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: biliUrls }, (details, callback) => {
    const headers = details.requestHeaders
    const origin = headers['Origin'] || headers['origin']
    // 仅记录 API/passport 请求的真实 origin（这些请求才有对应的 onHeadersReceived 消费并清理）
    if (origin && /^(https?|app):\/\//.test(origin) && /\/\/(api|passport)\.bilibili\.com/.test(details.url)) {
      reqOrigin.set(details.id, origin)
    }
    headers['Referer'] = 'https://www.bilibili.com'
    headers['Origin'] = 'https://www.bilibili.com'
    callback({ requestHeaders: headers })
  })

  // API/passport 响应：写入 CORS 头，让渲染进程的浏览器 fetch 可跨域读取
  const apiUrls = { urls: ['https://api.bilibili.com/*', 'https://passport.bilibili.com/*'] }
  session.defaultSession.webRequest.onHeadersReceived(apiUrls, (details, callback) => {
    const respHeaders: Record<string, string[]> = {}
    if (details.responseHeaders) {
      for (const [key, value] of Object.entries(details.responseHeaders)) {
        if (!key.toLowerCase().startsWith('access-control-allow')) {
          respHeaders[key] = value as string[]
        }
      }
    }
    const origin = reqOrigin.get(details.id)
    reqOrigin.delete(details.id)
    // 回显渲染进程真实 origin（带 credentials 时不能用 '*'）；取不到时退回 '*'（file:// 场景）
    respHeaders['access-control-allow-origin'] = [origin || '*']
    respHeaders['access-control-allow-credentials'] = ['true']
    respHeaders['access-control-allow-methods'] = ['GET, POST, PUT, DELETE, OPTIONS']
    respHeaders['access-control-allow-headers'] = ['*']
    callback({ responseHeaders: respHeaders })
  })

  // 请求失败时 onHeadersReceived 不会触发，未消费的 origin 记录需要在这里清理，
  // 否则长时间运行会缓慢泄漏 request id → origin 的映射。
  session.defaultSession.webRequest.onErrorOccurred(apiUrls, (details) => {
    reqOrigin.delete(details.id)
  })
}

// 匿名设备指纹：未登录状态也带 buvid3/buvid4，能显著降低 B站接口的风控概率。
// 失败完全静默，不影响启动与登录。
async function ensureBuvidCookies() {
  try {
    const existing = await session.defaultSession.cookies.get({ domain: '.bilibili.com' })
    if (existing.some((cookie) => cookie.name === 'buvid3')) return
    const res = await net.fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { Referer: 'https://www.bilibili.com', 'User-Agent': desktopUserAgent },
    })
    if (!res.ok) return
    const payload = (await res.json()) as { code?: number; data?: { b_3?: string; b_4?: string } }
    if (payload.code !== 0 || !payload.data?.b_3) return
    const write = async (name: string, value?: string) => {
      if (!value) return
      await session.defaultSession.cookies.set({
        url: 'https://www.bilibili.com',
        domain: '.bilibili.com',
        path: '/',
        name,
        value,
        secure: true,
      })
    }
    await write('buvid3', payload.data.b_3)
    await write('buvid4', payload.data.b_4)
    console.log(`[${APP_NAME}] anonymous buvid cookies initialized`)
  } catch {
    // 指纹初始化失败时继续使用匿名访问，不阻塞任何功能
  }
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null
let trayWindowReady = false
let trayAvailable = false
let pendingTrayShow: { x: number; y: number } | null = null
let isQuitting = false
let windowStateTimer: NodeJS.Timeout | null = null
let hiddenToTray = false
let hiddenBounds: { x: number; y: number; width: number; height: number } | null = null
let hiddenMaximized = false
let hiddenFullscreen = false
let windowStateSuspended = false
let mainWindowMinWidth = 1024
let mainWindowMinHeight = 640
let pageFrozen = false
let debuggerAttached = false

type TrayCommand = 'toggle-play' | 'next' | 'prev' | 'show-window' | 'quit'

interface TrayPlayerState {
  hasTrack: boolean
  title: string
  artist: string
  coverUrl: string
  isPlaying: boolean
  queueLength: number
  theme: 'light' | 'dark'
}

let trayPlayerState: TrayPlayerState = {
  hasTrack: false,
  title: '未在播放',
  artist: '搜索并播放音乐',
  coverUrl: '',
  isPlaying: false,
  queueLength: 0,
  theme: 'dark',
}

// 应用图标：dev 时从 electron 源目录加载，打包后从 dist-electron 同级加载（由 copy 脚本随构建复制）
function loadAppIcon(fileName = 'icon.png') {
  const iconPath = isDev
    ? path.join(__dirname, '../electron', fileName)
    : path.join(__dirname, fileName)
  return nativeImage.createFromPath(iconPath)
}

function createTrayIcon() {
  // SteamOS 桌面默认 200% 缩放，32px 源图会被放大发虚；64px 让面板自行缩放更清晰。
  const size = process.platform === 'linux' ? 64 : 32
  for (const fileName of ['tray.png', 'icon.png']) {
    const image = loadAppIcon(fileName)
    if (!image.isEmpty()) return image.resize({ width: size, height: size })
  }
  return nativeImage.createEmpty()
}

function persistentStoreFile() {
  return path.join(app.getPath('userData'), 'renderer-persistent-store.json')
}

function readPersistentStore(): Record<string, string> {
  try {
    const file = persistentStoreFile()
    if (!fs.existsSync(file)) return {}
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    )
  } catch {
    return {}
  }
}

function writePersistentStore(store: Record<string, string>) {
  try {
    const file = persistentStoreFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 先写临时文件再原子替换，避免崩溃/断电时把设置文件写成半截 JSON
    const temp = `${file}.tmp`
    fs.writeFileSync(temp, JSON.stringify(store, null, 2))
    fs.renameSync(temp, file)
  } catch {
    // Persistence failures should not block the renderer.
  }
}

interface SavedWindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function readSavedWindowState(
  workArea: { x: number; y: number; width: number; height: number },
  minWidth: number,
  minHeight: number,
): SavedWindowState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8')) as Partial<SavedWindowState>
    const width = Math.round(Number(raw.width))
    const height = Math.round(Number(raw.height))
    const rawX = Number(raw.x)
    const rawY = Number(raw.y)
    if (![width, height, rawX, rawY].every(Number.isFinite)) return null
    if (width < minWidth || height < minHeight) return null
    const x = Math.min(Math.max(Math.round(rawX), workArea.x), workArea.x + workArea.width - 120)
    const y = Math.min(Math.max(Math.round(rawY), workArea.y), workArea.y + workArea.height - 80)
    const visibleWidth = Math.min(x + width, workArea.x + workArea.width) - Math.max(x, workArea.x)
    const visibleHeight = Math.min(y + height, workArea.y + workArea.height) - Math.max(y, workArea.y)
    if (visibleWidth < 120 || visibleHeight < 80) return null
    return {
      x,
      y,
      width: Math.min(width, workArea.width),
      height: Math.min(height, workArea.height),
      maximized: Boolean(raw.maximized),
    }
  } catch {
    return null
  }
}

function writeWindowStateNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  try {
    // 隐藏到托盘时窗口会被缩到 200x150 以停止大面积软件合成；
    // 此时退出必须保存隐藏前的真实 bounds，而不是这个占位尺寸。
    const bounds = hiddenToTray && hiddenBounds ? hiddenBounds : mainWindow.getNormalBounds()
    const state: SavedWindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: hiddenToTray ? hiddenMaximized : mainWindow.isMaximized(),
    }
    const file = windowStateFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(state, null, 2))
  } catch {
    // 窗口状态只是体验优化，写入失败不应影响退出流程
  }
}

function scheduleWindowStateSave() {
  if (windowStateSuspended || hiddenToTray) return
  if (windowStateTimer) clearTimeout(windowStateTimer)
  windowStateTimer = setTimeout(() => {
    windowStateTimer = null
    writeWindowStateNow()
  }, 350)
}

async function setPageFrozen(frozen: boolean): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (pageFrozen === frozen) return
  try {
    const debuggerApi = mainWindow.webContents.debugger
    if (!debuggerAttached) {
      if (!debuggerApi.isAttached()) debuggerApi.attach('1.3')
      debuggerAttached = true
      debuggerApi.once('detach', () => {
        debuggerAttached = false
        pageFrozen = false
      })
    }
    await debuggerApi.sendCommand('Page.setWebLifecycleState', { state: frozen ? 'frozen' : 'active' })
    pageFrozen = frozen
    logEvent('page-lifecycle', { state: frozen ? 'frozen' : 'active' })
  } catch (err) {
    // DevTools 或外部调试器占用时无法 attach；跳过冻结即可，不影响运行。
    debuggerAttached = false
    logEvent('page-lifecycle-failed', err instanceof Error ? err.message : String(err))
  }
}

function waitForRendererActive(): Promise<void> {
  return pageFrozen ? setPageFrozen(false) : Promise.resolve()
}

function showMainWindow() {
  void setPageFrozen(false)
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (process.platform === 'darwin') app.dock?.show()

  if (hiddenToTray && mainWindow) {
    hiddenToTray = false
    windowStateSuspended = true
    try {
      mainWindow.setMinimumSize(mainWindowMinWidth, mainWindowMinHeight)
      if (hiddenBounds) mainWindow.setBounds(hiddenBounds)
      if (hiddenFullscreen) {
        mainWindow.setFullScreen(true)
      } else if (hiddenMaximized) {
        mainWindow.maximize()
      }
    } catch (err) {
      logEvent('restore-window-failed', err instanceof Error ? err.message : String(err))
    } finally {
      windowStateSuspended = false
    }
    logEvent('window-restore', { bounds: hiddenBounds, maximized: hiddenMaximized, fullscreen: hiddenFullscreen })
    hiddenBounds = null
    hiddenMaximized = false
    hiddenFullscreen = false
  }

  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

function updateTrayState() {
  try {
    tray?.setToolTip(trayPlayerState.hasTrack
      ? `${trayPlayerState.isPlaying ? '正在播放' : '已暂停'}: ${trayPlayerState.title}`
      : DISPLAY_NAME)
  } catch {
    // 某些 Linux 桌面环境在托盘服务重启后会短暂抛错，忽略即可
  }
  trayWindow?.webContents.send('tray:state', trayPlayerState)
}

function quitApp() {
  isQuitting = true
  if (windowStateTimer) {
    clearTimeout(windowStateTimer)
    windowStateTimer = null
  }
  writeWindowStateNow()
  try {
    trayWindow?.destroy()
  } catch {
    /* ignore */
  }
  trayWindow = null
  trayWindowReady = false
  try {
    tray?.destroy()
  } catch {
    /* ignore */
  }
  tray = null
  trayAvailable = false
  mainWindow?.destroy()
  app.quit()
}

function createTrayWindow() {
  if (isHarmonyOS) return null
  if (trayWindow) return trayWindow
  try {
    trayWindowReady = false
    trayWindow = new BrowserWindow({
      width: 330,
      height: 292,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      backgroundColor: '#00000000',
      opacity: 0,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: isDev
          ? path.join(__dirname, '../electron/tray-preload.cjs')
          : path.join(__dirname, 'tray-preload.cjs'),
        // 托盘面板只需要读状态 + 发命令：保持隔离，不再给 data: 页面 Node 能力。
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    trustWebContents(trayWindow.webContents)
    const trayContentsId = trayWindow.webContents.id
    trayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    trayWindow.webContents.on('will-navigate', (event) => event.preventDefault())
    trayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getTrayHtml(plasmaAccentColor))}`)
    trayWindow.once('ready-to-show', () => {
      trayWindowReady = true
      if (pendingTrayShow) {
        const pos = pendingTrayShow
        pendingTrayShow = null
        showTrayWindowAt(pos.x, pos.y)
      }
    })
    trayWindow.on('blur', () => {
      trayWindow?.setOpacity(0)
      trayWindow?.hide()
    })
    trayWindow.on('closed', () => {
      untrustWebContents(trayContentsId)
      trayWindow = null
      trayWindowReady = false
      pendingTrayShow = null
    })
    return trayWindow
  } catch (err) {
    console.warn(`[${APP_NAME}] tray window unavailable:`, err instanceof Error ? err.message : String(err))
    trayWindow = null
    trayWindowReady = false
    return null
  }
}

function showTrayWindowAt(x: number, y: number) {
  const win = createTrayWindow()
  if (!win) return
  if (!trayWindowReady) {
    pendingTrayShow = { x, y }
    return
  }
  try {
    win.setPosition(Math.round(x), Math.round(y), false)
  } catch {
    // Wayland 下部分合成器不允许程序定位窗口，退化为默认位置即可，不应中断托盘交互
  }
  updateTrayState()
  win.setOpacity(0)
  win.showInactive()
  setTimeout(() => {
    if (!trayWindow?.isVisible()) return
    trayWindow.setOpacity(1)
    trayWindow.focus()
  }, 20)
}

function toggleTrayWindow() {
  if (isHarmonyOS || !tray) return
  const win = createTrayWindow()
  if (!win) return
  if (win.isVisible()) {
    win.setOpacity(0)
    win.hide()
    return
  }

  const width = 330
  const height = 292
  let anchor: { x: number; y: number; width: number; height: number } | null = null
  try {
    const bounds = tray.getBounds()
    if (bounds.width > 0 && bounds.height > 0 && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
      anchor = bounds
    }
  } catch {
    anchor = null
  }
  const display = anchor
    ? screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y })
    : screen.getPrimaryDisplay()
  const { workArea } = display
  const x = anchor
    ? Math.round(Math.min(
        Math.max(anchor.x + anchor.width / 2 - width / 2, workArea.x + 8),
        workArea.x + workArea.width - width - 8,
      ))
    : workArea.x + workArea.width - width - 8
  // SteamOS 的 Plasma 面板默认在底部（且自动隐藏，workArea 往往等于全屏）。
  // 拿不到托盘图标坐标时，统一贴在右下角，既靠近托盘，也不会挡住标题栏。
  const fallbackY = workArea.y + workArea.height - height - 8
  const aboveY = anchor ? anchor.y - height - 10 : fallbackY
  const belowY = anchor ? anchor.y + anchor.height + 10 : fallbackY
  const y = anchor
    ? (aboveY >= workArea.y ? aboveY : Math.min(belowY, workArea.y + workArea.height - height - 8))
    : Math.min(fallbackY, workArea.y + workArea.height - height - 8)

  showTrayWindowAt(x, Math.round(y))
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '播放 / 暂停', click: () => sendTrayCommand('toggle-play') },
    { label: '上一首', click: () => sendTrayCommand('prev') },
    { label: '下一首', click: () => sendTrayCommand('next') },
    { type: 'separator' },
    { label: '检查更新', click: checkForUpdatesManually },
    { label: `显示 ${DISPLAY_NAME}`, click: showMainWindow },
    { label: `退出 ${DISPLAY_NAME}`, accelerator: 'CmdOrCtrl+Q', click: quitApp },
  ])
}

function createTray() {
  if (tray) return
  try {
    const icon = createTrayIcon()
    if (icon.isEmpty()) throw new Error('tray icon is empty')
    tray = new Tray(icon)
    trayAvailable = true
  } catch (err) {
    tray = null
    trayAvailable = false
    console.warn(`[${APP_NAME}] tray unavailable, falling back to minimize:`, err instanceof Error ? err.message : String(err))
    return
  }
  updateTrayState()
  tray.on('double-click', showMainWindow)

  // 鸿蒙上窗口显示/隐藏与托盘强相关，只注册托盘本身，不使用自定义浮层
  if (isHarmonyOS) {
    tray.on('click', showMainWindow)
    return
  }

  if (process.platform === 'linux') {
    // 稳定性优先：Linux 使用原生托盘菜单，不再创建透明的 always-on-top
    // BrowserWindow。透明置顶窗口会让 KWin 额外合成一个表面，在已有 GL
    // 上下文异常的 SteamOS 上是不必要的风险。
    tray.setContextMenu(buildTrayMenu())
    tray.on('click', showMainWindow)
    logEvent('tray', { mode: 'native-menu' })
  } else {
    tray.on('click', showMainWindow)
    tray.on('right-click', toggleTrayWindow)
    createTrayWindow()
    logEvent('tray', { mode: 'custom-popup' })
  }
}

function hideToTray() {
  if (!mainWindow) return
  if (!trayAvailable) {
    // 托盘不可用时隐藏窗口会让应用彻底失联，退化为最小化
    if (!mainWindow.isMinimized()) mainWindow.minimize()
    return
  }

  if (process.platform === 'darwin') app.dock?.hide()

  // 紧凑隐藏 + 冻结渲染层仅用于 Linux/SteamOS；其他平台保持原有 hide 行为。
  if (process.platform !== 'linux' || isHarmonyOS) {
    mainWindow.hide()
    if (trayWindow) {
      trayWindow.setOpacity(0)
      trayWindow.hide()
    }
    return
  }

  if (!hiddenToTray) {
    hiddenToTray = true
    windowStateSuspended = true
    try {
      hiddenMaximized = mainWindow.isMaximized()
      hiddenFullscreen = mainWindow.isFullScreen()
      hiddenBounds = mainWindow.getNormalBounds()
      // 先隐藏再缩小，避免用户看到窗口突然变成一个小方块。
      mainWindow.hide()
      if (hiddenFullscreen) mainWindow.setFullScreen(false)
      if (hiddenMaximized) mainWindow.unmaximize()
      // 隐藏后软件合成不再需要绘制 2400x1440 的大表面。把窗口缩到
      // 200x150 可以显著降低托盘后台时的 CPU/GPU 占用，音频不受影响。
      mainWindow.setMinimumSize(1, 1)
      mainWindow.setSize(200, 150)
      logEvent('window-hidden', {
        bounds: hiddenBounds,
        maximized: hiddenMaximized,
        fullscreen: hiddenFullscreen,
        compactSize: { width: 200, height: 150 },
        playing: trayPlayerState.isPlaying,
      })
      // 暂停状态隐藏时冻结渲染层：保留音频状态，进一步降低后台 CPU。
      // 播放中不冻结，避免音频结束/自动下一首事件被挂起。
      if (!trayPlayerState.isPlaying) void setPageFrozen(true)
    } catch (err) {
      logEvent('window-hide-failed', err instanceof Error ? err.message : String(err))
    } finally {
      windowStateSuspended = false
    }
  } else {
    mainWindow.hide()
  }

  if (trayWindow) {
    trayWindow.setOpacity(0)
    trayWindow.hide()
  }
}

function sendTrayCommand(command: TrayCommand) {
  if (command === 'show-window') {
    showMainWindow()
    trayWindow?.hide()
    return
  }
  if (command === 'quit') {
    quitApp()
    return
  }
  // 托盘菜单在渲染层冻结时也能工作：先唤醒页面，发送命令，
  // 如果命令执行后仍是暂停状态且窗口仍隐藏，再冻结回去。
  void waitForRendererActive().then(() => {
    mainWindow?.webContents.send('tray:player-command', command)
    setTimeout(() => {
      if (hiddenToTray && !trayPlayerState.isPlaying) void setPageFrozen(true)
    }, 1800)
  })
}

/**
 * 判断导航目标是否为应用自身页面。
 *
 * 不能用 `url.startsWith(devUrl)`：`http://localhost:5173.evil.com` 也会命中。
 * 生产环境只认 app://local/，开发环境按 origin 严格比较。
 */
function isInternalUrl(url: string): boolean {
  if (url.startsWith('app://local/')) return true
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (!devUrl) return false
  try {
    return new URL(url).origin === new URL(devUrl).origin
  } catch {
    return false
  }
}

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workArea
  const minWidth = Math.max(640, Math.min(1024, workArea.width))
  const minHeight = Math.max(480, Math.min(640, workArea.height))
  mainWindowMinWidth = minWidth
  mainWindowMinHeight = minHeight
  const saved = readSavedWindowState(workArea, minWidth, minHeight)
  const defaultWidth = Math.min(1280, Math.max(minWidth, workArea.width - 80))
  const defaultHeight = Math.min(820, Math.max(minHeight, workArea.height - 80))
  // 首次启动使用窗口模式，避免在小屏 Steam Deck 上直接铺满屏幕；用户最大化后会被记住。
  const startMaximized = saved ? saved.maximized : false
  const bounds = saved && !saved.maximized
    ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    : {
        x: workArea.x + Math.round((workArea.width - defaultWidth) / 2),
        y: workArea.y + Math.round((workArea.height - defaultHeight) / 2),
        width: defaultWidth,
        height: defaultHeight,
      }

  mainWindow = new BrowserWindow({
    title: DISPLAY_NAME,
    ...bounds,
    minWidth,
    minHeight,
    show: false,
    // 统一使用无边框窗口 + 应用内自绘标题栏。
    frame: useNativeFrame,
    transparent: false,
    backgroundColor: '#151517',
    hasShadow: false,
    minimizable: true,
    maximizable: true,
    closable: true,
    ...(!useNativeFrame && !isHarmonyOS ? { titleBarStyle: 'hidden' as const } : {}),
    icon: loadAppIcon('tray.png'),
    webPreferences: {
      preload: isDev
        ? path.join(__dirname, '../electron/preload.cjs')
        : path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 渲染层只需要 preload 暴露的白名单能力；显式开启 sandbox（也是 Electron 的默认值）。
      sandbox: true,
      // 隐藏到托盘后允许 Chromium 降低定时器频率，减少后台 CPU/合成开销。
      // 音频由 HTMLAudioElement 播放，不受此开关影响。
      backgroundThrottling: !useNativeFrame,
      spellcheck: false,
      zoomFactor: 1,
    },
  })
  mainWindow.setMenuBarVisibility(false)
  // Pinch/visual zoom and Chromium page zoom are both disabled for this app.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})
  mainWindow.webContents.setZoomFactor(1)
  mainWindow.webContents.on('zoom-changed', (event) => {
    event.preventDefault()
    mainWindow?.webContents.setZoomFactor(1)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logEvent('render-process-gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
  })
  mainWindow.webContents.on('unresponsive', () => logEvent('renderer-unresponsive'))
  mainWindow.webContents.on('responsive', () => logEvent('renderer-responsive'))
  mainWindow.webContents.on('did-finish-load', () => {
    logEvent('renderer-loaded')
    mainWindow?.webContents.setZoomFactor(1)
    // Transparent surfaces on some Wayland compositors do not emit ready-to-show.
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return
      mainWindow.show()
      mainWindow.focus()
      logEvent('window-show-fallback')
    }, 600)
  })
  logEvent('window-created', {
    bounds: mainWindow.getBounds(),
    nativeFrame: useNativeFrame,
    softwareRendering: useSoftwareRendering,
  })

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL('app://local/index.html')
  }
  trustWebContents(mainWindow.webContents)
  const mainContentsId = mainWindow.webContents.id

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return
    if (startMaximized) mainWindow.maximize()
    mainWindow.show()
    mainWindow.focus()
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideToTray()
  })

  mainWindow.on('closed', () => {
    untrustWebContents(mainContentsId)
    mainWindow = null
    if (!trayAvailable && !isQuitting) app.quit()
  })

  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('show', () => {
    if (pageFrozen) void setPageFrozen(false)
  })
  mainWindow.on('restore', () => {
    if (pageFrozen) void setPageFrozen(false)
  })

  const sendMaximizeState = () => {
    mainWindow?.webContents.send('window:maximized-change', Boolean(mainWindow?.isMaximized() || mainWindow?.isFullScreen()))
  }
  const sendFullscreenState = () => {
    mainWindow?.webContents.send('window:fullscreen-change', Boolean(mainWindow?.isFullScreen()))
  }
  mainWindow.on('maximize', () => {
    sendMaximizeState()
    scheduleWindowStateSave()
  })
  mainWindow.on('unmaximize', () => {
    sendMaximizeState()
    scheduleWindowStateSave()
  })
  mainWindow.on('enter-full-screen', () => {
    sendMaximizeState()
    sendFullscreenState()
  })
  mainWindow.on('leave-full-screen', () => {
    sendMaximizeState()
    sendFullscreenState()
  })

  // 外部链接交给系统浏览器，避免把主窗口导航到 B站网页后无法返回。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternalUrl(url)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  // SteamOS 桌面模式常用的键盘操作：Ctrl+Q 退出、Ctrl+W 收进托盘、F11 全屏、Esc 退出全屏。
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    const modifier = input.control || input.meta
    const zoomKey = key === '+' || key === '=' || key === '-' || key === '_' || key === '0'
      || input.code === 'NumpadAdd' || input.code === 'NumpadSubtract'
    if (modifier && zoomKey) {
      event.preventDefault()
      return
    }
    if (modifier && key === 'q') {
      event.preventDefault()
      quitApp()
    } else if (modifier && key === 'w') {
      event.preventDefault()
      hideToTray()
    } else if (input.key === 'F11') {
      event.preventDefault()
      if (!mainWindow) return
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    } else if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
      event.preventDefault()
      mainWindow.setFullScreen(false)
    }
  })
}

// 窗口控制 IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', hideToTray)

type WindowResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
let windowResizeState: {
  edge: WindowResizeEdge
  bounds: Electron.Rectangle
  cursorX: number
  cursorY: number
  workArea: Electron.Rectangle
} | null = null

function stopWindowResize() {
  windowResizeState = null
}

ipcMain.on('window:resize-start', (_event, payload: { edge: WindowResizeEdge; screenX: number; screenY: number }) => {
  if (!mainWindow) return
  const validEdges: WindowResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
  if (!payload || !validEdges.includes(payload.edge)) return
  const bounds = mainWindow.getBounds()
  windowResizeState = {
    edge: payload.edge,
    bounds,
    cursorX: payload.screenX,
    cursorY: payload.screenY,
    workArea: screen.getDisplayMatching(bounds).workArea,
  }
})

ipcMain.on('window:resize-move', (_event, payload: { screenX: number; screenY: number }) => {
  if (!mainWindow || !windowResizeState || !payload) return
  const { edge, bounds, cursorX, cursorY, workArea } = windowResizeState
  const dx = payload.screenX - cursorX
  const dy = payload.screenY - cursorY
  let x = bounds.x
  let y = bounds.y
  let width = bounds.width
  let height = bounds.height
  if (edge.includes('e')) width = bounds.width + dx
  if (edge.includes('s')) height = bounds.height + dy
  if (edge.includes('w')) {
    width = bounds.width - dx
    x = bounds.x + dx
  }
  if (edge.includes('n')) {
    height = bounds.height - dy
    y = bounds.y + dy
  }
  width = Math.max(mainWindowMinWidth, Math.min(width, workArea.width))
  height = Math.max(mainWindowMinHeight, Math.min(height, workArea.height))
  if (edge.includes('w')) x = Math.min(x, bounds.x + bounds.width - mainWindowMinWidth)
  if (edge.includes('n')) y = Math.min(y, bounds.y + bounds.height - mainWindowMinHeight)
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width))
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))
  mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) })
})

ipcMain.on('window:resize-end', stopWindowResize)
ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized() || mainWindow?.isFullScreen()))
ipcMain.on('window:toggle-fullscreen', () => {
  if (!mainWindow) return
  const next = !mainWindow.isFullScreen()
  mainWindow.setFullScreen(next)
  mainWindow.webContents.send('window:fullscreen-change', next)
  mainWindow.webContents.send('window:maximized-change', Boolean(mainWindow.isMaximized() || next))
})
ipcMain.on('window:set-button-visibility', (_event, visible: boolean) => {
  if (!isHarmonyOS) return
  const next = Boolean(visible)
  const setWindowButtonVisibility = (mainWindow as unknown as {
    setWindowButtonVisibility?: (visible: boolean) => void
  } | null)?.setWindowButtonVisibility
  if (typeof setWindowButtonVisibility === 'function') {
    setWindowButtonVisibility.call(mainWindow, next)
  }
  mainWindow?.setTitle(`__BIU_WINDOW_BUTTONS__:${next ? 'show' : 'hide'}`)
})
ipcMain.handle('window:isFullscreen', () => Boolean(mainWindow?.isFullScreen()))
ipcMain.on('tray:player-state', (_event, state: TrayPlayerState) => {
  trayPlayerState = {
    hasTrack: Boolean(state?.hasTrack),
    title: String(state?.title || '未在播放'),
    artist: String(state?.artist || '搜索并播放音乐'),
    coverUrl: String(state?.coverUrl || ''),
    isPlaying: Boolean(state?.isPlaying),
    queueLength: Number(state?.queueLength || 0),
    theme: state?.theme === 'light' ? 'light' : 'dark',
  }
  updateTrayState()
})
ipcMain.on('tray:command', (event, command: TrayCommand) => {
  if (!isTrustedSender(event)) return
  sendTrayCommand(command)
})
ipcMain.handle('tray:get-state', (event) => {
  assertTrustedSender(event)
  return trayPlayerState
})
ipcMain.on('persistent-storage:get', (event, key: string) => {
  if (!isTrustedSender(event) || typeof key !== 'string') {
    event.returnValue = null
    return
  }
  event.returnValue = readPersistentStore()[key] ?? null
})
ipcMain.on('persistent-storage:set', (event, key: string, value: string) => {
  if (!isTrustedSender(event) || typeof key !== 'string' || typeof value !== 'string') return
  const store = readPersistentStore()
  store[key] = value
  writePersistentStore(store)
})
ipcMain.on('persistent-storage:remove', (event, key: string) => {
  if (!isTrustedSender(event) || typeof key !== 'string') return
  const store = readPersistentStore()
  delete store[key]
  writePersistentStore(store)
})
// 用系统默认浏览器打开外部链接（仅放行 http/https，避免任意协议执行）
ipcMain.handle('shell:open-external', (event, url: string) => {
  assertTrustedSender(event)
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url)
})
ipcMain.on('app:get-system-accent', (event) => {
  if (!isTrustedSender(event)) {
    event.returnValue = ''
    return
  }
  event.returnValue = plasmaAccentColor
})

// 全局兜底：任何 webContents 都禁止挂载 <webview>，window.open 默认拒绝。
// 主窗口/托盘窗口随后会用各自的 handler 覆盖成“外链交给系统浏览器/直接拒绝”。
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID)
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  // 标准 Chrome UA：避免部分站点把 Electron 内置 UA 判为爬虫；也避免登录页出现兼容性提示
  session.defaultSession.setUserAgent(desktopUserAgent)
  // 播放器不需要摄像头/麦克风/定位/通知等任何 Web 权限：一律拒绝。
  // 需要系统能力时都走 preload 白名单里的显式 IPC，而不是浏览器权限弹窗。
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  try {
    logEvent('gpu-feature-status', app.getGPUFeatureStatus())
  } catch {
    // 某些平台没有 GPU 状态信息
  }
  const primaryDisplay = screen.getPrimaryDisplay()
  logEvent('display', {
    bounds: primaryDisplay.bounds,
    workArea: primaryDisplay.workArea,
    scaleFactor: primaryDisplay.scaleFactor,
  })
  // 每 5 分钟记录一次主进程内存/运行时长，黑屏前可据此判断是否存在内存异常。
  const healthTimer = setInterval(() => {
    logEvent('health', {
      uptimeSeconds: Math.round(process.uptime()),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    })
  }, 5 * 60 * 1000)
  healthTimer.unref()

  // 生产环境注册 app:// 协议，映射到打包后的 dist 目录（asar 内 file:// 读取透明支持）
  if (!isDev) {
    protocol.handle('app', async (request) => {
      // 渲染层根目录是包内 dist（net.fetch 透明读 asar 内部）
      const root = path.resolve(path.join(__dirname, '../dist'))
      let filePath: string
      try {
        const { pathname } = new URL(request.url)
        const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '')
        filePath = path.resolve(root, relativePath)
      } catch {
        // 畸形 URL（非法转义等）不应让整个协议 handler 抛错导致白屏
        return new Response('Bad Request', { status: 400 })
      }
      // 阻止 app://local/../../etc/passwd 之类的目录穿越
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 })
      }
      try {
        return await net.fetch(pathToFileURL(filePath).toString())
      } catch (err) {
        // 关键诊断：鸿蒙上若读沙箱 asar 失败会在此命中（filePath 含 .asar）
        console.log(`[${APP_NAME}] app:// fetch FAILED:`, filePath, '—', err instanceof Error ? err.message : String(err))
        throw err
      }
    })
  }
  setupBiliHeaders()
  registerBiliApiHandlers()
  registerLyricsApiHandlers()
  registerCoverApiHandlers()
  void ensureBuvidCookies()
  initAutoUpdater({ getWindow: () => mainWindow, log: logEvent })
  if (isHarmonyOS) {
    // OpenHarmony 上窗口显示/隐藏与托盘强相关，需先创建托盘再创建主窗口。
    createTray()
    createWindow()
  } else {
    createWindow()
    createTray()
  }
  console.log(`[${APP_NAME}] ready · version=${app.getVersion()} · electron=${process.versions.electron} · appImage=${process.env.APPIMAGE ? 'yes' : 'no'}`)
})

process.on('SIGTERM', () => {
  logEvent('SIGTERM')
  quitApp()
})
process.on('SIGINT', () => {
  logEvent('SIGINT')
  quitApp()
})

app.on('before-quit', () => {
  logEvent('before-quit')
  isQuitting = true
  writeWindowStateNow()
})

app.on('window-all-closed', () => {
  // 托盘可用时允许后台继续播放；无托盘时必须退出，避免留下看不见的僵尸进程
  if ((isQuitting || !trayAvailable) && process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
  else showMainWindow()
})
