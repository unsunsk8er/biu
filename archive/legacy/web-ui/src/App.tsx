import { lazy, Suspense } from 'react'
import { MotionConfig } from 'framer-motion'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PlayerProvider } from '@/contexts/PlayerContext'
import { NowPlayingProvider } from '@/contexts/NowPlayingContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AddToPlaylistProvider } from '@/contexts/AddToPlaylistContext'
import MainLayout from '@/components/layout/MainLayout'
import SearchPage from '@/pages/Search'
import Recent from '@/pages/Recent'
import Favorites from '@/pages/Favorites'
import Playlists from '@/pages/Playlists'
import Downloads from '@/pages/Downloads'
import Settings from '@/pages/Settings'
import { isAndroidApp } from '@/utils/mobile'
import { EASE_OUT, MOTION_BASE } from '@/utils/motion'

// 登录弹窗依赖二维码库，只在用户点击登录后加载
const LoginDialog = lazy(() => import('@/components/LoginDialog'))

function GlobalLoginDialog() {
  const { showLogin, setShowLogin, checkLogin } = useAuth()
  if (!showLogin) return null
  return (
    <Suspense fallback={null}>
      <LoginDialog
        onClose={() => setShowLogin(false)}
        onSuccess={() => {
          setShowLogin(false)
          checkLogin()
        }}
      />
    </Suspense>
  )
}

export default function App() {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: MOTION_BASE, ease: EASE_OUT }}
    >
    <AuthProvider>
      <PlayerProvider>
        <NowPlayingProvider>
          <AddToPlaylistProvider>
            <Routes>
              <Route element={<MainLayout />}>
                <Route path="/" element={<Navigate to="/search" replace />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/recommend" element={<Navigate to="/search" replace />} />
                <Route path="/recent" element={<Recent />} />
                <Route path="/favorites" element={isAndroidApp() ? <Navigate to="/playlists/__biu_favorites__" replace /> : <Favorites />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/playlists/:playlistId" element={<Playlists />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/search" replace />} />
              </Route>
            </Routes>
            <GlobalLoginDialog />
          </AddToPlaylistProvider>
        </NowPlayingProvider>
      </PlayerProvider>
    </AuthProvider>
    </MotionConfig>
  )
}
