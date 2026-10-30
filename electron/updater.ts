import {
  app,
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'

// electron-updater 是 CJS 包；默认导入在 Node ESM 下最稳，命名导入依赖
// cjs-module-lexer 的静态分析。
const { autoUpdater } = electronUpdater

/**
 * 自动更新。
 *
 * 设计取舍：
 * - 只在打包后的应用启用（dev 没有 app-update.yml，也没有可替换的安装目录）。
 * - 下载由用户确认，避免在播放/演出场景中偷偷占用带宽。
 * - 安装前再次确认，退出流程交给 electron-updater 的 quitAndInstall。
 * - 任何失败只写日志，不阻塞启动；更新服务不可用不应影响播放器本身。
 *
 * 发布配置见 package.json 的 build.publish 与 docs/RELEASE.md。
 */

const INITIAL_CHECK_DELAY = 20_000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

type Logger = (event: string, data?: unknown) => void

let started = false
let prompting = false
let promptedVersion = ''
let timer: NodeJS.Timeout | null = null
let getWindow: () => BrowserWindow | null = () => null
let log: Logger = () => {}

function logUpdate(event: string, data?: unknown): void {
  log(`update:${event}`, data)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function showMessage(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  const window = getWindow()
  if (window && !window.isDestroyed()) return dialog.showMessageBox(window, options)
  return dialog.showMessageBox(options)
}

async function promptDownload(info: UpdateInfo): Promise<void> {
  if (prompting || promptedVersion === info.version) return
  prompting = true
  promptedVersion = info.version
  try {
    const result = await showMessage({
      type: 'info',
      title: '发现新版本',
      message: `biu ${info.version} 已发布`,
      detail: `当前版本 ${app.getVersion()}。是否现在下载更新？下载完成后可选择重启安装。`,
      buttons: ['下载更新', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (result.response === 0) {
      logUpdate('download-start', { version: info.version })
      await autoUpdater.downloadUpdate()
    } else {
      logUpdate('download-deferred', { version: info.version })
    }
  } catch (error) {
    logUpdate('download-failed', errorMessage(error))
  } finally {
    prompting = false
  }
}

async function promptInstall(info: UpdateInfo): Promise<void> {
  if (prompting) return
  prompting = true
  try {
    const result = await showMessage({
      type: 'info',
      title: '更新已下载',
      message: `biu ${info.version} 已准备就绪`,
      detail: '重启后完成安装。未保存的播放进度会在重启后自动恢复。',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (result.response === 0) {
      logUpdate('install-now', { version: info.version })
      // 让当前的消息框先关闭，再交给 electron-updater 退出并安装。
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    } else {
      logUpdate('install-deferred', { version: info.version })
    }
  } finally {
    prompting = false
  }
}

function wireEvents(): void {
  autoUpdater.on('checking-for-update', () => logUpdate('checking'))
  autoUpdater.on('update-available', (info) => {
    logUpdate('available', { version: info.version })
    void promptDownload(info)
  })
  autoUpdater.on('update-not-available', (info) => {
    logUpdate('up-to-date', { version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    logUpdate('progress', { percent: Math.round(progress.percent), bytesPerSecond: progress.bytesPerSecond })
  })
  autoUpdater.on('update-downloaded', (info) => {
    logUpdate('downloaded', { version: info.version })
    void promptInstall(info)
  })
  autoUpdater.on('error', (error) => {
    logUpdate('error', errorMessage(error))
  })
}

/** 托盘菜单/设置页可主动触发；开发模式下给出明确提示而不是静默失败。 */
export function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    void showMessage({
      type: 'info',
      title: '检查更新',
      message: '开发模式不检查更新',
      detail: '打包后的版本才会连接发布源。',
      buttons: ['知道了'],
      noLink: true,
    })
    return
  }
  logUpdate('manual-check')
  autoUpdater.checkForUpdates().catch((error) => logUpdate('check-failed', errorMessage(error)))
}

export function initAutoUpdater(options: {
  getWindow: () => BrowserWindow | null
  log: Logger
}): void {
  if (started) return
  if (!app.isPackaged) {
    logUpdate('skipped', 'not packaged')
    return
  }
  if (process.env.BIU_DISABLE_UPDATES === '1') {
    logUpdate('skipped', 'disabled by BIU_DISABLE_UPDATES')
    return
  }

  started = true
  getWindow = options.getWindow
  log = options.log

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = process.env.BIU_ALLOW_PRERELEASE === '1'

  wireEvents()

  const check = () => {
    autoUpdater.checkForUpdates().catch((error) => logUpdate('check-failed', errorMessage(error)))
  }
  const initial = setTimeout(check, INITIAL_CHECK_DELAY)
  initial.unref?.()
  timer = setInterval(check, CHECK_INTERVAL)
  timer.unref?.()

  logUpdate('ready', {
    current: app.getVersion(),
    prerelease: autoUpdater.allowPrerelease,
  })
}

export function stopAutoUpdater(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
