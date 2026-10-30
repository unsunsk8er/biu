import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { migrateLegacyStorage } from './utils/storageMigration'
import { initTheme } from './hooks/useTheme'
import { isAndroidApp, isLargeScreen } from './utils/mobile'
import './styles/index.css'
import './styles/huawei-music.css'

migrateLegacyStorage()
initTheme()

// Desktop fallbacks: block Chromium's Ctrl/Cmd + wheel page zoom and its
// keyboard zoom shortcuts before any app-level handler sees them.
if (window.electronAPI) {
  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  }, { passive: false, capture: true })
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (['+', '=', '-', '_', '0'].includes(key)) event.preventDefault()
  }, { capture: true })
}

// Android WebView APK 使用独立的移动布局；桌面端不受影响。
if (isAndroidApp()) {
  if (isLargeScreen()) {
    document.documentElement.dataset.biuTablet = 'true'
  } else {
    document.documentElement.dataset.biuMobile = 'true'
    // 手机端关闭高成本合成效果，减少 WebView 的 GPU/CPU 压力。
    document.documentElement.dataset.renderMode = 'mobile'
  }
}

// Linux 默认使用软件合成（见 electron/main.ts 的稳定性说明）。
// 标记渲染模式，让 CSS 关闭毛玻璃、背景模糊等成本较高的合成效果。
if (window.electronAPI?.platform === 'linux') {
  document.documentElement.dataset.renderMode = 'software'
}

// 跟随 Plasma 系统强调色（Breeze 默认 #3daee9）；主进程已从 kdeglobals 读取。
const systemAccent = window.electronAPI?.getSystemAccent?.()
if (systemAccent && /^#[0-9a-f]{6}$/i.test(systemAccent)) {
  document.documentElement.style.setProperty('--plasma-accent', systemAccent)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </AppErrorBoundary>
  </StrictMode>,
)
