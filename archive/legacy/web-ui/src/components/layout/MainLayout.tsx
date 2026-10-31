import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import TitleBar from './TitleBar'
import WindowResizeHandles from './WindowResizeHandles'
import Sidebar from './Sidebar'
import PlayerBar from './PlayerBar'
import MobileNav from './MobileNav'
import MobilePlayerBar from './MobilePlayerBar'
import NowPlaying from '@/components/NowPlaying'
import MediaSessionSync from '@/components/MediaSessionSync'
import { isAndroidApp, isLargeScreen, isMobileApp } from '@/utils/mobile'
import { useNowPlaying } from '@/contexts/NowPlayingContext'
import { useAuth } from '@/contexts/AuthContext'

const MAIN_PAGES = new Set(['/search', '/playlists', '/downloads', '/settings'])

function hasFocusedTextInput(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  const tag = active.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || active.isContentEditable
}

export default function MainLayout() {
  const contentRef = useRef<HTMLElement | null>(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { showLogin, setShowLogin } = useAuth()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const android = isAndroidApp()
  const mobileShell = isMobileApp()
  const [largeScreen, setLargeScreen] = useState(() => mobileShell && isLargeScreen())
  const phone = mobileShell && !largeScreen
  const { expanded, close } = useNowPlaying()

  useEffect(() => {
    if (!mobileShell) return
    const syncLayout = () => {
      const large = isLargeScreen()
      // A soft keyboard may resize the WebView. Never collapse a tablet into
      // the phone shell while the user is typing, otherwise the focused input
      // unmounts and the IME closes immediately.
      if (!large && hasFocusedTextInput()) return
      setLargeScreen(large)
      const root = document.documentElement
      if (large) {
        delete root.dataset.biuMobile
        delete root.dataset.renderMode
        root.dataset.biuTablet = 'true'
      } else {
        delete root.dataset.biuTablet
        root.dataset.biuMobile = 'true'
        root.dataset.renderMode = 'mobile'
      }
    }
    syncLayout()
    window.addEventListener('resize', syncLayout)
    window.addEventListener('orientationchange', syncLayout)
    return () => {
      window.removeEventListener('resize', syncLayout)
      window.removeEventListener('orientationchange', syncLayout)
    }
  }, [android])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.isFullscreen?.().then(setIsFullscreen).catch(() => {})
    return api.onFullscreenChange?.(setIsFullscreen)
  }, [])

  // 切换页面时回到顶部，避免从已滚动的列表页进入设置页时停在半截
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  // Native ArkUI bottom tabs drive the router directly. ArkWeb's
  // location.hash assignment does not reliably reach HashRouter's history
  // listener, so the native bar calls into this function instead.
  useEffect(() => {
    const bridgeWindow = window as unknown as {
      __biuNavigate?: (path: string) => void
    }
    bridgeWindow.__biuNavigate = (path: string) => {
      window.setTimeout(() => navigate(path), 0)
    }
    return () => {
      if (bridgeWindow.__biuNavigate) delete bridgeWindow.__biuNavigate
    }
  }, [navigate])

  // Android/卓易通 edge-back is delivered to Activity.onBackPressed, which
  // delegates here. Resolve in-app layers first; only the four main tabs send
  // the task to the background, keeping the WebView/audio process alive.
  useEffect(() => {
    const handler = (): 'handled' | 'background' | 'fallback' => {
      const active = document.activeElement
      if (active instanceof HTMLElement) {
        const tag = active.tagName.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || active.isContentEditable) {
          active.blur()
          return 'handled'
        }
      }

      if (showLogin) {
        setShowLogin(false)
        return 'handled'
      }

      // Page/sheet overlays (search user space, download manage/delete
      // confirmation, playlist create/edit, add-to-playlist, queue) can claim
      // the gesture before NowPlaying is collapsed.
      const overlay = new CustomEvent('biu:back', { cancelable: true })
      window.dispatchEvent(overlay)
      if (overlay.defaultPrevented) return 'handled'

      if (expanded) {
        close()
        return 'handled'
      }

      const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
      if (/^\/playlists\/[^/]+/.test(cleanPath)) {
        navigate('/playlists')
        return 'handled'
      }
      if (MAIN_PAGES.has(cleanPath) || cleanPath === '/recent' || cleanPath === '/favorites') {
        return 'background'
      }

      // Unknown/legacy route: return to the search home instead of finishing
      // the Activity and interrupting playback.
      navigate('/search')
      return 'handled'
    }
    window.__biuBackPressed = handler
    return () => {
      if (window.__biuBackPressed === handler) delete window.__biuBackPressed
    }
  }, [pathname, expanded, close, navigate, showLogin, setShowLogin])

  // HarmonyOS root-page back must fall through to the system so the side-back
  // gesture returns to the launcher. In-app pages (including Now Playing) keep
  // consuming it in ArkUI and resolve through __biuBackPressed.
  useEffect(() => {
    const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
    const atRoot = !expanded && (
      MAIN_PAGES.has(cleanPath) || cleanPath === '/recent' || cleanPath === '/favorites'
    )
    window.BiuHarmony?.setBackMode(atRoot)
  }, [pathname, expanded])

  return (
    <div
      className={`app-shell ${isFullscreen ? 'is-fullscreen' : ''} ${phone ? 'is-mobile' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--color-background)',
      }}
    >
      {!mobileShell && <TitleBar />}
      {!mobileShell && <WindowResizeHandles />}

      <div
        className="app-body"
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {!phone && <Sidebar />}

        <main
          ref={contentRef}
          className="app-content"
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            background: 'var(--color-view)',
            padding: '20px 24px 24px',
          }}
        >
          <Outlet key={mobileShell ? (largeScreen ? 'tablet' : 'phone') : 'desktop'} />
        </main>
      </div>

      {!phone && <PlayerBar />}
      {phone && !expanded && <MobilePlayerBar />}
      {phone && !expanded && <MobileNav />}

      <NowPlaying />
      <MediaSessionSync />
    </div>
  )
}
