import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
  Heart, Volume2, VolumeX, Music, Loader2, Maximize2, Minimize2, X, ExternalLink, RefreshCw, Image as ImageIcon, Captions, Download, ListMusic,
} from 'lucide-react'
import { usePlayer, usePlayerProgress } from '@/contexts/PlayerContext'
import { useNowPlaying } from '@/contexts/NowPlayingContext'
import { useAppSettings } from '@/hooks/useAppSettings'
import { useLyrics } from '@/hooks/useLyrics'
import PlayerSlider from '@/components/PlayerSlider'
import CoverArtwork from '@/components/CoverArtwork'
import SlowMarquee from '@/components/SlowMarquee'
import PlayQueue from '@/components/PlayQueue'
import LyricsView from '@/components/LyricsView'
import { isMobileApp, isMobilePhone } from '@/utils/mobile'
import { MOTION_BASE, EASE_OUT } from '@/utils/motion'

const sliderTheme = {
  ['--track-bg']: 'var(--np-track-bg, rgba(255,255,255,0.22))',
  ['--track-fill']: 'var(--plasma-accent)',
  ['--track-thumb']: 'var(--plasma-accent)',
} as React.CSSProperties

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
const AUTO_NOW_PLAYING_IDLE_MS = 30_000

function NowPlayingView() {
  const softwareRender = document.documentElement.dataset.renderMode === 'software'
  const lowPowerRender = softwareRender || document.documentElement.dataset.renderMode === 'mobile'
  const navigate = useNavigate()
  const player = usePlayer()
  const { expanded, close, open } = useNowPlaying()
  const { settings } = useAppSettings()
  const track = player.currentTrack
  const lyrics = useLyrics(track, expanded && settings.showLyrics)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [queueOpen, setQueueOpen] = useState(false)
  const [coverMode, setCoverMode] = useState<'cover' | 'lyrics'>('cover')
  const mobile = isMobilePhone()
  const tablet = isMobileApp() && !mobile
  const nowPlayingMotion = {
    initial: { opacity: 0, y: mobile ? 16 : 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: mobile ? 12 : 8 },
    transition: { duration: MOTION_BASE, ease: EASE_OUT },
  }
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const tabletCoverRef = useRef<HTMLDivElement | null>(null)
  const tabletArtistRef = useRef<HTMLButtonElement | null>(null)
  const tabletSideRef = useRef<HTMLElement | null>(null)
  const autoOpenedTrackRef = useRef<string | null>(null)

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, close])

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    api.isFullscreen?.().then(setFullscreen).catch(() => {})
    return api.onFullscreenChange?.(setFullscreen)
  }, [])

  useEffect(() => {
    const api = window.electronAPI
    if (api?.platform !== 'openharmony') return
    api.setWindowButtonVisibility?.(!expanded)
    return () => api.setWindowButtonVisibility?.(true)
  }, [expanded])

  const toggleFullscreen = () => {
    window.electronAPI?.toggleFullscreen?.()
    window.electronAPI?.isFullscreen?.()
      .then(setFullscreen)
      .catch(() => {})
    window.setTimeout(() => {
      window.electronAPI?.isFullscreen?.()
        .then(setFullscreen)
        .catch(() => {})
    }, 180)
  }

  const closeToTray = () => {
    if (isMobileApp()) {
      close()
      return
    }
    window.electronAPI?.close()
  }

  const openArtistSpace = () => {
    if (!track?.artist.trim()) return
    close()
    navigate('/search', { state: { openArtist: track.artist } })
  }

  const openSourceVideo = () => {
    if (!track?.bvid) return
    window.electronAPI?.openExternal?.(`https://www.bilibili.com/video/${track.bvid}`)
  }

  const cycleCoverMode = () => {
    setCoverMode(current => current === 'cover' ? 'lyrics' : 'cover')
  }

  const handleSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!mobile || event.touches.length !== 1) {
      swipeStartRef.current = null
      return
    }
    const target = event.target as HTMLElement
    if (target.closest('button,input,select,textarea,[role="slider"],[role="button"]')) {
      swipeStartRef.current = null
      return
    }
    const touch = event.touches[0]
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!mobile || !start) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (dx > 72 && dx > Math.abs(dy) * 1.35) close()
  }

  useEffect(() => {
    if (!expanded || !fullscreen) {
      setControlsVisible(true)
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const revealControls = () => {
      setControlsVisible(true)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setControlsVisible(false), 5000)
    }

    revealControls()
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'wheel', 'keydown', 'touchstart', 'touchmove']
    events.forEach(event => window.addEventListener(event, revealControls, { passive: true }))
    return () => {
      if (timer) clearTimeout(timer)
      events.forEach(event => window.removeEventListener(event, revealControls))
    }
  }, [expanded, fullscreen])

  useEffect(() => {
    setCoverMode('cover')
  }, [track?.id])

  useEffect(() => {
    if (!expanded) {
      setCoverMode('cover')
      setQueueOpen(false)
    }
  }, [expanded])


  // Let the queue sheet consume Back before NowPlaying itself closes.
  useEffect(() => {
    if (!queueOpen) return
    const onBack = (event: Event) => {
      event.preventDefault()
      setQueueOpen(false)
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [queueOpen])

  // HarmonyOS/Android containers deliver their edge-back gesture through
  // Activity.onBackPressed, not the WebView touch stream. Keep the native
  // side informed and expose a synchronous JS close handler.
  // Give the Android/HarmonyOS system back button its own history entry.
  // Edge-back then follows the normal WebView history path and popstate closes
  // the overlay; in-app button/swipe close removes the extra entry again.
  useEffect(() => {
    if (!expanded) return
    let popped = false
    const onPopState = () => {
      popped = true
      close()
    }
    try {
      window.history.pushState(
        { ...(window.history.state || {}), __biuNowPlaying: true },
        '',
        window.location.href,
      )
    } catch {
      return
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      if (!popped && window.history.state?.__biuNowPlaying) {
        window.history.back()
      }
    }
  }, [expanded, close])

  const lyricsContent = track ? (
    settings.showLyrics ? (
      <LyricsPanelWithProgress lyrics={lyrics} />
    ) : (
      <Centered>
        <Music size={42} strokeWidth={1.25} />
        <strong>歌词显示已关闭</strong>
        <span>可以在设置中重新开启歌词显示</span>
      </Centered>
    )
  ) : null

  useLayoutEffect(() => {
    if (!tablet || !expanded) return
    const cover = tabletCoverRef.current
    const artist = tabletArtistRef.current
    const side = tabletSideRef.current
    if (!cover || !artist || !side) return
    const syncHeight = () => {
      const top = cover.getBoundingClientRect().top
      const bottom = artist.getBoundingClientRect().bottom
      side.style.height = `${Math.max(0, Math.round(bottom - top))}px`
    }
    syncHeight()
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncHeight)
      : null
    observer?.observe(cover)
    observer?.observe(artist)
    window.addEventListener('resize', syncHeight)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncHeight)
      side.style.height = ''
    }
  }, [tablet, expanded, track?.id, track?.title, track?.artist])

  useEffect(() => {
    if (!tablet || !track) return
    if (expanded) {
      // Opening manually (or being auto-opened) counts as handling this track,
      // so closing it will not immediately pop it open again.
      autoOpenedTrackRef.current = track.id
      return
    }
    if (!player.isPlaying || player.loadingAudio) return
    if (autoOpenedTrackRef.current === track.id) return

    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (disposed) return
        if (document.hidden || hasEditableFocus()) {
          arm()
          return
        }
        autoOpenedTrackRef.current = track.id
        open()
      }, AUTO_NOW_PLAYING_IDLE_MS)
    }
    const onActivity = () => arm()
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer)
      } else {
        arm()
      }
    }
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach(event => window.addEventListener(event, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    arm()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      events.forEach(event => window.removeEventListener(event, onActivity))
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [tablet, expanded, track?.id, player.isPlaying, player.loadingAudio, open])

  if (!track) return null

  return (
    <motion.div
      key="now-playing"
      {...nowPlayingMotion}
      className={`now-playing ${tablet ? 'is-tablet' : ''} ${fullscreen ? 'is-fullscreen' : ''} ${fullscreen && !controlsVisible ? 'is-immersive-idle' : ''}`}
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
      onTouchCancel={() => { swipeStartRef.current = null }}
    >
          <div className="now-playing-smoke" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="now-playing-bg">
            {track.coverUrl && (
              <>
                <motion.div
                  className="now-playing-bg__cover"
                  style={{ backgroundImage: `url(${track.coverUrl})` }}
                  initial={false}
                  animate={lowPowerRender ? { opacity: 0.72 } : { opacity: 0.72, scale: [1.16, 1.25, 1.18] }}
                  transition={lowPowerRender ? undefined : { scale: { duration: 22, repeat: Infinity, ease: 'easeInOut' } }}
                />
                <motion.div
                  className="now-playing-bg__disc"
                  style={{ backgroundImage: `url(${track.coverUrl})` }}
                  animate={lowPowerRender ? { rotate: 0 } : { rotate: player.isPlaying ? 360 : 0 }}
                  transition={lowPowerRender ? undefined : { duration: 34, repeat: player.isPlaying ? Infinity : 0, ease: 'linear' }}
                />
              </>
            )}
          </div>

          {!tablet && <header className="now-playing-top now-playing-ui now-playing-ui--top" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
            <motion.button
              type="button"
              className="now-playing-close"
              onClick={close}
              title="收起 (Esc)"
              style={noDrag}
              whileHover={{ y: 1, backgroundColor: 'rgba(255,255,255,0.18)' }}
              whileTap={{ scale: 0.92 }}
            >
              <ChevronDown size={21} />
            </motion.button>
            <motion.button
              type="button"
              className="now-playing-content-mode"
              onClick={cycleCoverMode}
              style={noDrag}
              title={coverMode === 'cover' ? '显示歌词页' : '返回封面'}
              aria-label={coverMode === 'cover' ? '显示歌词页' : '返回封面'}
              whileHover={{ y: 1, backgroundColor: 'rgba(255,255,255,0.18)' }}
              whileTap={{ scale: 0.94 }}
            >
              {coverMode === 'cover' ? <Captions size={16} /> : <ImageIcon size={16} />}
              <span>{coverMode === 'cover' ? '歌词' : '封面'}</span>
            </motion.button>
            <div className="now-playing-top__actions" style={noDrag}>
              <motion.button
                type="button"
                className="now-playing-close"
                onClick={() => { void player.refreshCover() }}
                title="重新匹配歌曲信息"
                disabled={player.matchingCover}
                whileHover={player.matchingCover ? undefined : { y: 1, backgroundColor: 'rgba(255,255,255,0.18)' }}
                whileTap={player.matchingCover ? undefined : { scale: 0.92 }}
              >
                {player.matchingCover
                  ? <Loader2 size={18} className="spin" />
                  : <ImageIcon size={18} />}
              </motion.button>
              <motion.button
                type="button"
                className="now-playing-close"
                onClick={openSourceVideo}
                title="在浏览器中打开视频"
                whileHover={{ y: 1, backgroundColor: 'rgba(255,255,255,0.18)' }}
                whileTap={{ scale: 0.92 }}
              >
                <ExternalLink size={18} />
              </motion.button>
              <span className="now-playing-top__divider" aria-hidden="true" />
              <motion.button
                type="button"
                className="now-playing-close"
                onClick={toggleFullscreen}
                title={fullscreen ? '退出全屏' : '全屏'}
                whileHover={{ y: 1, backgroundColor: 'rgba(255,255,255,0.18)' }}
                whileTap={{ scale: 0.92 }}
              >
                {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </motion.button>
              <motion.button
                type="button"
                className="now-playing-close"
                onClick={closeToTray}
                title="关闭到托盘"
                whileHover={{ y: 1, backgroundColor: 'rgba(255,255,255,0.18)' }}
                whileTap={{ scale: 0.92 }}
              >
                <X size={19} />
              </motion.button>
            </div>
          </header>}

          <main className="now-playing-main">
            <section className="now-playing-left">
              <div className="now-playing-cover-wrap" ref={tabletCoverRef}>
                <motion.div
                  className="now-playing-cover-glow"
                  animate={lowPowerRender ? { opacity: 0.26 } : { opacity: player.isPlaying ? [0.35, 0.72, 0.4] : 0.26 }}
                  transition={lowPowerRender ? undefined : { duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <CoverArtwork
                  className="now-playing-cover"
                  src={track.coverUrl}
                  alt={track.title}
                  loading="eager"
                  iconSize={64}
                />
                {mobile && coverMode === 'lyrics' && (
                  <div className="now-playing-cover-lyrics">
                    {lyricsContent}
                  </div>
                )}
              </div>

              <div className="now-playing-meta">
                <div className="now-playing-title-block">
                  <h1>{tablet ? <SlowMarquee text={track.title} /> : track.title}</h1>
                  <button
                    type="button"
                    className="now-playing-artist-link"
                    ref={tabletArtistRef}
                    onClick={openArtistSpace}
                    title={`查看 ${track.artist} 的个人空间`}
                  >
                    {tablet ? <SlowMarquee text={track.artist} /> : track.artist}
                  </button>
                </div>
                <div className="now-playing-meta-actions">
                  {(mobile || tablet) && (
                    <motion.button
                      type="button"
                      className="now-playing-heart now-playing-match"
                      onClick={() => { void player.refreshCover() }}
                      disabled={player.matchingCover}
                      whileHover={player.matchingCover ? undefined : { scale: 1.08 }}
                      whileTap={player.matchingCover ? undefined : { scale: 0.88 }}
                      title="重新匹配歌曲信息"
                    >
                      {player.matchingCover
                        ? <Loader2 size={19} className="spin" />
                        : <RefreshCw size={19} />}
                    </motion.button>
                  )}
                  {mobile && (
                    <motion.button
                      type="button"
                      className="now-playing-heart now-playing-ui now-playing-download"
                      onClick={() => { void player.downloadCurrentTrack() }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.88 }}
                      title="下载当前歌曲"
                    >
                      <Download size={20} />
                    </motion.button>
                  )}
                  <motion.button
                    type="button"
                    className={`now-playing-heart now-playing-ui ${track.isLiked ? 'is-liked' : ''}`}
                    onClick={() => player.toggleLike(track.id)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.88 }}
                    title="喜欢"
                  >
                    <Heart size={22} fill={track.isLiked ? 'currentColor' : 'none'} />
                  </motion.button>
                  <motion.button
                    type="button"
                    className="now-playing-heart now-playing-ui now-playing-queue-button"
                    onClick={() => setQueueOpen(true)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.88 }}
                    title="当前播放列表"
                    aria-label="打开当前播放列表"
                  >
                    <ListMusic size={20} />
                    {player.queue.length > 0 && (
                      <span className="now-playing-queue-badge">
                        {player.queue.length > 99 ? '99+' : player.queue.length}
                      </span>
                    )}
                  </motion.button>
                </div>
              </div>

              {!tablet && <NowPlayingProgress trackDuration={track.duration || 0} />}

              {!tablet && (
              <div className="now-playing-controls now-playing-ui now-playing-ui--controls">
                <div className="now-playing-volume-popover" style={sliderTheme}>
                  <motion.button
                    type="button"
                    className="now-playing-volume-trigger"
                    onClick={() => player.setIsMuted(!player.isMuted)}
                    title={player.isMuted ? '取消静音' : '静音'}
                    whileHover={{ scale: 1.08, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    {player.isMuted || player.volume <= 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </motion.button>
                  <div className="now-playing-volume-panel">
                    <PlayerSlider
                      ariaLabel="音量"
                      value={player.isMuted ? 0 : player.volume}
                      max={100}
                      step={5}
                      onChange={(v) => { player.setVolume(Math.round(v)); if (player.isMuted && v > 0) player.setIsMuted(false) }}
                      variant="volume"
                    />
                  </div>
                </div>
                <PlaybackControls player={player} />
              </div>
              )}
            </section>

            {tablet ? (
              <section className="now-playing-tablet-side" ref={tabletSideRef}>
                <div className="now-playing-tablet-content">
                  {lyricsContent}
                </div>
                <div className="now-playing-tablet-footer">
                  <div className="now-playing-tablet-progress">
                    <NowPlayingProgress trackDuration={track.duration || 0} />
                  </div>
                  <div className="now-playing-tablet-transport">
                    <PlaybackControls player={player} />
                  </div>
                </div>
              </section>
            ) : !mobile && (
              <section className="now-playing-lyrics-card">
                {lyricsContent}
              </section>
            )}
          </main>

      <PlayQueue
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        heading="当前播放列表"
        zIndex={260}
        placement="now-playing"
      />
    </motion.div>
  )
}

export default function NowPlaying() {
  const { expanded } = useNowPlaying()
  const { currentTrack } = usePlayer()
  return (
    <AnimatePresence>
      {expanded && currentTrack && <NowPlayingView key="now-playing" />}
    </AnimatePresence>
  )
}

function NowPlayingProgress({ trackDuration }: { trackDuration: number }) {
  const { progress, duration: liveDuration, setProgress } = usePlayerProgress()
  const duration = liveDuration || trackDuration
  return (
    <div className="now-playing-progress now-playing-ui" style={sliderTheme}>
      <PlayerSlider
        ariaLabel="播放进度"
        value={progress}
        max={duration}
        onChange={setProgress}
        disabled={duration <= 0}
        formatValue={formatTime}
        variant="progress"
      />
      <div className="now-playing-time">
        <span>{formatTime(progress)}</span>
        <span>-{formatTime(Math.max(duration - progress, 0))}</span>
      </div>
    </div>
  )
}

/** 歌词高亮同样需要 4Hz 的 currentTime，单独订阅，避免整页跟着刷新。 */
function LyricsPanelWithProgress({
  lyrics,
}: {
  lyrics: ReturnType<typeof useLyrics>
}) {
  const { progress, setProgress } = usePlayerProgress()
  return <LyricsPanel lyrics={lyrics} currentTime={progress} onSeek={setProgress} />
}

function LyricsPanel({
  lyrics, onSeek, currentTime,
}: {
  lyrics: ReturnType<typeof useLyrics>
  onSeek: (t: number) => void
  currentTime: number
}) {
  const { status, result, retry } = lyrics

  return (
    <div className="lyrics-panel">
      <div className="lyrics-panel__body">
        {status === 'loading' && (
          <Centered>
            <Loader2 size={28} className="spin" />
            <span>匹配歌词中...</span>
          </Centered>
        )}
        {status === 'empty' && (
          <Centered>
            <Music size={42} strokeWidth={1.25} />
            <strong>暂无歌词</strong>
            <span>这首歌在歌词库里还没有匹配到</span>
            <button type="button" onClick={() => { retry() }}><RefreshCw size={14} /> 重新匹配歌词</button>
          </Centered>
        )}
        {(status === 'ok' || status === 'unsynced') && result && (
          <>
            {status === 'unsynced' && <div className="lyrics-panel__hint">该版本无逐行时间轴，按普通歌词显示</div>}
            <LyricsView lines={result.lines} currentTime={currentTime} synced={result.synced} onSeek={onSeek} />
          </>
        )}
      </div>


    </div>
  )
}

function hasEditableFocus(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  const tag = active.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || active.isContentEditable
}

function PlaybackControls({ player }: { player: ReturnType<typeof usePlayer> }) {
  return (
    <div className="now-playing-control-cluster">
      <RoundIcon active={player.isShuffled} onClick={() => player.setIsShuffled(!player.isShuffled)} title="随机播放">
        <Shuffle size={20} />
      </RoundIcon>
      <RoundIcon onClick={player.prev} title="上一首">
        <SkipBack size={27} />
      </RoundIcon>
      <motion.button
        type="button"
        className="now-playing-play"
        onClick={player.togglePlay}
        disabled={player.loadingAudio}
        whileHover={{ scale: player.loadingAudio ? 1 : 1.045 }}
        whileTap={{ scale: player.loadingAudio ? 1 : 0.94 }}
      >
        {player.loadingAudio
          ? <Loader2 size={27} className="spin" />
          : player.isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" style={{ marginLeft: 3 }} />}
      </motion.button>
      <RoundIcon onClick={player.next} title="下一首">
        <SkipForward size={27} />
      </RoundIcon>
      <RoundIcon
        active={player.repeatMode !== 'none'}
        onClick={() => {
          const modes = ['none', 'all', 'one'] as const
          player.setRepeatMode(modes[(modes.indexOf(player.repeatMode) + 1) % 3])
        }}
        title="循环模式"
      >
        <span className="now-playing-repeat">
          <Repeat size={20} />
          {player.repeatMode === 'one' && <span>1</span>}
        </span>
      </RoundIcon>
    </div>
  )
}


function RoundIcon({ children, active, onClick, title, className = '' }: { children: ReactNode; active?: boolean; onClick: () => void; title: string; className?: string }) {
  return (
    <motion.button
      type="button"
      className={`now-playing-round ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={onClick}
      title={title}
      whileHover={{ scale: 1.08, y: -1 }}
      whileTap={{ scale: 0.9 }}
    >
      {children}
    </motion.button>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="lyrics-centered">{children}</div>
}

function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
