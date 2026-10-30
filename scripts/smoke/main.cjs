const { app, BrowserWindow, ipcMain, protocol, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

/**
 * biu 运行时冒烟测试（隐藏窗口，不弹 UI）。
 *
 * 前置：先执行 npm run build，产物在 dist/ 与 dist-electron/。
 * 运行：npm run smoke
 *
 * 检查项：
 *   1. 渲染层能在 app:// 协议下启动，React 挂载出界面，无 console error
 *   2. preload 暴露的 API 与预期一致
 *   3. 托盘面板的 data: URL 页面在 sandbox preload 下能拿到 trayAPI 并收到 IPC 状态
 */

const appRoot = path.resolve(__dirname, '..', '..')
const distRoot = path.join(appRoot, 'dist')
const preload = path.join(appRoot, 'dist-electron', 'preload.cjs')
const trayPreload = path.join(appRoot, 'dist-electron', 'tray-preload.cjs')
const outDir = path.join(__dirname, 'out')

if (!fs.existsSync(path.join(distRoot, 'index.html')) || !fs.existsSync(preload)) {
  console.error('缺少构建产物：请先运行 npm run build')
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
// CI 容器里没有 user namespace/沙箱权限，由 workflow 显式放行。
if (process.env.BIU_SMOKE_NO_SANDBOX === '1') app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()
app.setPath('userData', path.join(__dirname, 'userdata'))
app.commandLine.appendSwitch('disable-gpu')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const result = { renderer: {}, tray: {}, consoleErrors: [], consoleWarnings: [], failedLoads: [] }
const trayCommands = []

function loadRealTrayHtml() {
  // 现场把 electron/trayHtml.ts 转译成 CommonJS 再调用，确保测的是真实托盘页面
  const ts = require(path.join(appRoot, 'node_modules', 'typescript'))
  const source = fs.readFileSync(path.join(appRoot, 'electron', 'trayHtml.ts'), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const factory = new Function('exports', 'module', 'require', '__filename', '__dirname', output)
  factory(mod.exports, mod, require, path.join(appRoot, 'electron', 'trayHtml.ts'), path.join(appRoot, 'electron'))
  return mod.exports.getTrayHtml('#FF5C93')
}

function registerMinimalIpc() {
  ipcMain.handle('window:isMaximized', () => false)
  ipcMain.handle('window:isFullscreen', () => false)
  ipcMain.handle('bili:getCookies', () => ({ isLoggedIn: false }))
  ipcMain.handle('lyrics:search', () => [])
  ipcMain.handle('lyrics:get', () => null)
  ipcMain.handle('cover:search', () => [])
  ipcMain.on('app:get-system-accent', (event) => { event.returnValue = '#3daee9' })
  ipcMain.on('persistent-storage:get', (event) => { event.returnValue = null })
  ipcMain.on('persistent-storage:set', () => {})
  ipcMain.on('persistent-storage:remove', () => {})
  ipcMain.on('tray:player-state', () => {})
  ipcMain.on('tray:command', (_event, command) => { trayCommands.push(command) })
  ipcMain.handle('tray:get-state', () => ({
    hasTrack: true,
    title: '冒烟测试曲目',
    artist: 'biu',
    coverUrl: '',
    isPlaying: true,
    queueLength: 2,
    theme: 'dark',
  }))
  for (const channel of [
    'window:minimize', 'window:maximize', 'window:close', 'window:resize-start',
    'window:resize-move', 'window:resize-end', 'window:toggle-fullscreen',
    'window:set-button-visibility', 'shell:open-external',
  ]) {
    ipcMain.on(channel, () => {})
  }
}

function createWindow(url, webPreferences, label) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: { ...webPreferences, contextIsolation: true, nodeIntegration: false },
  })
  win.webContents.on('console-message', (event, legacyLevel, legacyMessage) => {
    // Electron 36 起推荐 event 对象；这里兼容两种签名
    const level = typeof legacyLevel === 'string' ? legacyLevel : legacyLevel
    const message = typeof legacyMessage === 'string' ? legacyMessage : event.message
    const line = `[${label}] ${message}`
    if (level === 'error' || level >= 3) result.consoleErrors.push(line)
    else if (level === 'warning' || level === 2) result.consoleWarnings.push(line)
    else console.log(line)
  })
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    result.failedLoads.push(`[${label}] ${code} ${description} ${url}`)
  })
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    result.consoleErrors.push(`[${label}] preload-error ${preloadPath} ${error}`)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    result.consoleErrors.push(`[${label}] render-process-gone ${JSON.stringify(details)}`)
  })
  win.loadURL(url)
  return win
}

async function main() {
  registerMinimalIpc()

  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url)
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '')
    const filePath = path.resolve(distRoot, relative)
    if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  const mainWindow = createWindow('app://local/index.html', { preload, sandbox: true }, 'renderer')
  await new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve))
  await new Promise((resolve) => setTimeout(resolve, 3000))

  result.renderer = await mainWindow.webContents.executeJavaScript(`(() => ({
    rootChildren: document.querySelectorAll('#root *').length,
    hasAppShell: Boolean(document.querySelector('.app-shell')),
    apiKeys: Object.keys(window.electronAPI || {}).sort(),
    biliKeys: Object.keys((window.electronAPI || {}).biliApi || {}).sort(),
    title: document.title,
    bodyTextLength: document.body.innerText.length
  }))()`)

  try {
    const image = await mainWindow.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'renderer.png'), image.toPNG())
    result.renderer.screenshot = 'ok'
  } catch (error) {
    result.renderer.screenshot = `failed: ${error.message}`
  }

  // 沉浸播放页：种一条播放状态后重载，展开播放页，验证进度控件
  // （4Hz 进度订阅已下沉到 NowPlayingProgress / LyricsPanelWithProgress）
  const fakeTrack = {
    id: 'BV1smoke', bvid: 'BV1smoke', title: '冒烟测试曲目', artist: 'biu',
    coverUrl: '', duration: 200, videoUrl: 'https://www.bilibili.com/video/BV1smoke',
    playCount: 0, isLiked: false,
  }
  const seededState = {
    currentTrack: fakeTrack, queue: [fakeTrack], progress: 42, duration: 200,
    volume: 80, isMuted: false, repeatMode: 'none', isShuffled: false,
    wasPlaying: false, currentIndex: 0,
  }
  // 页面卸载时 PlayerContext 会把当前（空）状态写回 localStorage，直接种数据会被覆盖。
  // 这里先让 setItem 忽略该 key，再用原始方法写入种子，重载后新页面即可恢复出曲目。
  const seedJson = JSON.stringify(seededState)
  await mainWindow.webContents.executeJavaScript(`(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'biu_player_state') return
      return original.call(this, key, value)
    }
    original.call(localStorage, 'biu_player_state', ${JSON.stringify(seedJson)})
    return true
  })()`)
  await new Promise((resolve) => {
    mainWindow.webContents.once('did-finish-load', resolve)
    mainWindow.webContents.reload()
  })
  await new Promise((resolve) => setTimeout(resolve, 2000))
  const diag = await mainWindow.webContents.executeJavaScript(`(() => ({
    stored: (localStorage.getItem('biu_player_state') || '').slice(0, 120),
    buttons: Array.from(document.querySelectorAll('button')).map((b) => b.title || b.getAttribute('aria-label') || '').filter(Boolean).slice(0, 20),
    bodyText: document.body.innerText.slice(0, 160)
  }))()`)
  const clicked = await mainWindow.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button[title="查看歌词"]')
    if (button) button.click()
    return Boolean(button)
  })()`)
  await new Promise((resolve) => setTimeout(resolve, 800))
  result.overlay = {
    foundButton: clicked,
    diag,
    ...(await mainWindow.webContents.executeJavaScript(`(() => ({
      hasOverlay: Boolean(document.querySelector('.now-playing')),
      hasProgress: Boolean(document.querySelector('.now-playing-progress')),
      timeText: (document.querySelector('.now-playing-time') || {}).textContent || ''
    }))()`)),
  }
  try {
    // 隐藏窗口里 framer-motion 的入场动画可能停在 opacity: 0，截图前强制显形
    await mainWindow.webContents.executeJavaScript(`(() => {
      const overlay = document.querySelector('.now-playing')
      if (overlay) { overlay.style.opacity = '1'; overlay.style.transform = 'none' }
      return true
    })()`)
    await new Promise((resolve) => setTimeout(resolve, 250))
    const overlayShot = await mainWindow.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'now-playing.png'), overlayShot.toPNG())
    result.overlay.screenshot = 'now-playing.png'
  } catch (error) {
    result.overlay.screenshot = `failed: ${error.message}`
  }

  // 托盘面板：使用真实的 electron/trayHtml.ts（现场转译），验证
  // data: 页面 + sandbox preload + CSP 下按钮/状态都正常。
  const trayHtml = loadRealTrayHtml()
  const trayWindow = createWindow(
    `data:text/html;charset=utf-8,${encodeURIComponent(trayHtml)}`,
    { preload: trayPreload, sandbox: true },
    'tray',
  )
  await new Promise((resolve) => trayWindow.webContents.once('did-finish-load', resolve))
  await new Promise((resolve) => setTimeout(resolve, 1200))
  result.tray = await trayWindow.webContents.executeJavaScript(`(() => ({
    trayKeys: Object.keys(window.trayAPI || {}).sort(),
    title: document.getElementById('title') && document.getElementById('title').textContent,
    artist: document.getElementById('artist') && document.getElementById('artist').textContent,
    buttons: document.querySelectorAll('button').length,
    hasCsp: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')),
    playOnclick: typeof document.getElementById('play').onclick,
    commandType: typeof (window.trayAPI || {}).command
  }))()`)
  await trayWindow.webContents.executeJavaScript("document.getElementById('play').click()")
  await new Promise((resolve) => setTimeout(resolve, 400))
  result.tray.commands = trayCommands

  const failures = []
  if (result.renderer.rootChildren < 50) failures.push('渲染层没有挂载出界面')
  if (!result.renderer.hasAppShell) failures.push('缺少 .app-shell')
  if (result.renderer.apiKeys.length === 0) failures.push('preload 未暴露 electronAPI')
  if (!result.renderer.apiKeys.includes('biliApi')) failures.push('preload 缺少 biliApi')
  if (result.consoleErrors.length > 0) failures.push(`console error ${result.consoleErrors.length} 条`)
  if (result.failedLoads.length > 0) failures.push(`页面加载失败 ${result.failedLoads.length} 条`)
  const trayKeys = result.tray.trayKeys || []
  if (!result.overlay || !result.overlay.foundButton) failures.push('播放条没有渲染“查看歌词”入口')
  if (!result.overlay?.hasOverlay) failures.push('沉浸播放页没有打开')
  if (!result.overlay?.hasProgress) failures.push('播放页缺少进度控件')
  if (!/0:42/.test(result.overlay?.timeText || '')) {
    failures.push(`播放页进度未按状态渲染：${result.overlay?.timeText}`)
  }
  if (!['command', 'getState', 'onState'].every((key) => trayKeys.includes(key))) {
    failures.push('托盘 preload 暴露的 API 不完整')
  }
  if (result.tray.title !== '冒烟测试曲目') failures.push(`托盘标题未渲染：${result.tray.title}`)
  if (result.tray.buttons !== 5) failures.push(`托盘按钮数量异常：${result.tray.buttons}`)
  if (!result.tray.hasCsp) failures.push('托盘页面缺少 CSP')
  if (!(result.tray.commands || []).includes('toggle-play')) failures.push('托盘按钮没有发出 IPC 命令')

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ ...result, failures }, null, 2))

  if (failures.length > 0) {
    console.error('SMOKE_FAILED ' + JSON.stringify(failures))
    app.exit(1)
  } else {
    console.log('SMOKE_OK ' + JSON.stringify({
      rootChildren: result.renderer.rootChildren,
      trayKeys,
      warnings: result.consoleWarnings.length,
    }))
    app.exit(0)
  }
}

app.whenReady().then(main).catch((error) => {
  console.error('SMOKE_FAILED', error)
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ fatal: String((error && error.stack) || error) }, null, 2))
  app.exit(1)
})
