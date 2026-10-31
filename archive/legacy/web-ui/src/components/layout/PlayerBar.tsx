import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  ListPlus,
  Volume2,
  VolumeX,
  ListMusic,
  Settings,
  Music,
  Maximize2,
} from 'lucide-react'
import { usePlayer, usePlayerProgress } from '@/contexts/PlayerContext'
import { useNowPlaying } from '@/contexts/NowPlayingContext'
import { useAddToPlaylist } from '@/contexts/AddToPlaylistContext'
import PlayQueue from '@/components/PlayQueue'
import PlayerSlider from '@/components/PlayerSlider'
import CoverArtwork from '@/components/CoverArtwork'

const spring = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.7,
} as const

const sliderVars = {
  '--track-bg': 'var(--player-track-bg)',
  '--track-fill': 'var(--player-track-fill)',
  '--track-thumb': 'var(--player-track-thumb)',
} as CSSProperties

export default function PlayerBar() {
  const player = usePlayer()
  const { open } = useNowPlaying()
  const { openAddToPlaylist } = useAddToPlaylist()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [queueOpen, setQueueOpen] = useState(false)

  useEffect(() => {
    if (!queueOpen) return
    const onBack = (event: Event) => {
      event.preventDefault()
      setQueueOpen(false)
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [queueOpen])

  return (
    <motion.div
      className="am-player-bar"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={{
        height: 76,
        width: '100%',
        background: 'var(--player-bg)',
        borderTop: '1px solid var(--player-border)',
        boxShadow: 'none',
        color: 'var(--player-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        gap: 16,
        flexShrink: 0,
        zIndex: 50,
        fontFamily: 'var(--font-body)',
      } as CSSProperties}
    >
      <div
        style={{
          width: 280,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <motion.button
          type="button"
          onClick={() => { if (player.currentTrack) open() }}
          title={player.currentTrack ? '查看歌词' : undefined}
          whileHover={player.currentTrack ? { backgroundColor: 'var(--player-hover)' } : undefined}
          whileTap={player.currentTrack ? { scale: 0.985 } : undefined}
          transition={{ duration: 0.2 }}
          style={{
            minWidth: 0,
            flex: 1,
            padding: '5px 10px 5px 5px',
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--player-text)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: player.currentTrack ? 'pointer' : 'default',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <motion.div
            whileHover={player.currentTrack ? { scale: 1.035 } : undefined}
            transition={spring}
            style={{
              width: 46,
              height: 46,
              borderRadius: 6,
              background: player.currentTrack
                ? 'var(--player-cover-bg)'
                : 'linear-gradient(135deg, var(--player-cover-bg), transparent)',
              border: '1px solid var(--player-cover-border)',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {player.currentTrack && (
              <>
                <CoverArtwork
                  src={player.currentTrack.coverUrl}
                  alt={player.currentTrack.title}
                  loading="eager"
                  iconSize={21}
                />
                <motion.div
                  initial={false}
                  whileHover={{ opacity: 1 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.42)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                  }}
                >
                  <Maximize2 size={17} strokeWidth={2.2} />
                </motion.div>
              </>
            )}
            {!player.currentTrack && <Music size={21} strokeWidth={2} style={{ color: 'var(--player-subtle-text)' }} />}
          </motion.div>

          <div style={{ minWidth: 0, flex: 1 }}>
            {player.currentTrack ? (
              <>
                <motion.div
                  style={{
                    color: 'var(--player-text)',
                    fontSize: 14,
                    fontWeight: 650,
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {player.currentTrack.title}
                </motion.div>
                <motion.div
                  style={{
                    marginTop: 4,
                    color: 'var(--player-subtle-text)',
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {player.currentTrack.artist}
                </motion.div>
              </>
            ) : (
              <>
                <div
                  style={{
                    color: 'var(--player-subtle-text)',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  未在播放
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: 'var(--player-faint-text)',
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.2,
                  }}
                >
                  搜索并添加音乐
                </div>
              </>
            )}
          </div>
        </motion.button>

        {player.currentTrack && (
          <>
            <IconButton
              ariaLabel="添加至歌单"
              onClick={() => openAddToPlaylist(player.currentTrack!)}
            >
              <ListPlus size={18} />
            </IconButton>
            <IconButton
              active={Boolean(player.currentTrack.isLiked)}
              ariaLabel="喜欢"
              onClick={() => player.toggleLike(player.currentTrack!.id)}
            >
              <Heart
                size={18}
                fill={player.currentTrack.isLiked ? 'currentColor' : 'none'}
              />
            </IconButton>
          </>
        )}
      </div>

      <div
        style={{
          flex: 1,
          maxWidth: 620,
          minWidth: 280,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <TransportButton
            active={player.isShuffled}
            onClick={() => player.setIsShuffled(!player.isShuffled)}
            ariaLabel="随机播放"
          >
            <Shuffle size={18} />
          </TransportButton>
          <TransportButton onClick={player.prev} ariaLabel="上一首">
            <SkipBack size={21} />
          </TransportButton>
          <PlayButton
            isPlaying={player.isPlaying}
            loading={player.loadingAudio}
            onClick={player.togglePlay}
          />
          <TransportButton onClick={player.next} ariaLabel="下一首">
            <SkipForward size={21} />
          </TransportButton>
          <TransportButton
            active={player.repeatMode !== 'none'}
            onClick={() => {
              const modes = ['none', 'all', 'one'] as const
              const idx = modes.indexOf(player.repeatMode)
              player.setRepeatMode(modes[(idx + 1) % 3])
            }}
            ariaLabel="循环模式"
          >
            <span style={{ position: 'relative', display: 'flex' }}>
              <Repeat size={18} />
              {player.repeatMode === 'one' && (
                <span
                  style={{
                    position: 'absolute',
                    top: -7,
                    right: -9,
                    minWidth: 12,
                    height: 12,
                    borderRadius: 8,
                    background: 'rgba(0, 0, 0, 0.75)',
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 800,
                    lineHeight: '12px',
                    textAlign: 'center',
                  }}
                >
                  1
                </span>
              )}
            </span>
          </TransportButton>
        </div>

        <PlayerProgressBar />
      </div>

      <div
        style={{
          width: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <IconButton
          active={pathname === '/settings'}
          ariaLabel="设置"
          onClick={() => navigate('/settings')}
        >
          <Settings size={18} />
        </IconButton>

        <IconButton
          active={queueOpen}
          ariaLabel="播放队列"
          onClick={() => setQueueOpen(o => !o)}
        >
          <ListMusic size={18} />
          {player.queue.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 2,
                minWidth: 15,
                height: 15,
                padding: '0 3px',
                borderRadius: 4,
                background: 'var(--plasma-accent)',
                color: '#fff',
                border: '2px solid var(--player-bg)',
                fontSize: 9,
                fontWeight: 800,
                lineHeight: '11px',
                textAlign: 'center',
              }}
            >
              {player.queue.length}
            </span>
          )}
        </IconButton>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginLeft: 2,
            ...sliderVars,
          } as CSSProperties}
        >
          <IconButton
            ariaLabel={player.isMuted ? '取消静音' : '静音'}
            onClick={() => player.setIsMuted(!player.isMuted)}
            active={player.isMuted}
          >
            {player.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </IconButton>
          <PlayerSlider
            ariaLabel="音量"
            value={player.isMuted ? 0 : player.volume}
            max={100}
            onChange={(value) => {
              player.setVolume(Math.round(value))
              if (player.isMuted && value > 0) player.setIsMuted(false)
            }}
            width={98}
            step={5}
            variant="volume"
          />
        </div>
      </div>

      <PlayQueue open={queueOpen} onClose={() => setQueueOpen(false)} />
    </motion.div>
  )
}

function PlayerProgressBar() {
  const player = usePlayer()
  const { progress, duration, setProgress } = usePlayerProgress()
  const trackDuration = duration || player.currentTrack?.duration || 0
  const remaining = Math.max(trackDuration - progress, 0)
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11 }}>
      <TimeLabel align="right">{formatTime(progress)}</TimeLabel>
      <div style={{ ...sliderVars, flex: 1 } as CSSProperties}>
        <PlayerSlider
          ariaLabel="播放进度"
          value={progress}
          max={trackDuration}
          onChange={setProgress}
          disabled={trackDuration <= 0}
          formatValue={formatTime}
          variant="progress"
        />
      </div>
      <TimeLabel>{trackDuration > 0 ? `-${formatTime(remaining)}` : '0:00'}</TimeLabel>
    </div>
  )
}

function PlayButton({ isPlaying, loading, onClick }: { isPlaying: boolean; loading?: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={loading}
      whileHover={{ scale: loading ? 1 : 1.06, backgroundColor: 'var(--hw-red)' }}
      whileTap={{ scale: loading ? 1 : 0.94 }}
      transition={spring}
      style={{
        width: 34,
        height: 34,
        borderRadius: 4,
        background: 'var(--plasma-accent)',
        color: '#ffffff',
        border: 'none',
        boxShadow: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.72 : 1,
      }}
    >
      {loading ? (
        <span
          style={{
            width: 16,
            height: 16,
            border: '2px solid rgba(255, 255, 255, 0.35)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : isPlaying ? (
        <Pause size={20} fill="currentColor" />
      ) : (
        <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />
      )}
    </motion.button>
  )
}

function TransportButton({
  children,
  active = false,
  onClick,
  ariaLabel,
}: {
  children: ReactNode
  active?: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <motion.button
      type="button"
      className={active ? 'is-active' : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      whileHover={{ color: active ? 'var(--plasma-accent)' : 'var(--player-text)' }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.14 }}
      style={{
        width: 26,
        height: 28,
        padding: 0,
        background: 'none',
        border: 'none',
        color: active ? 'var(--plasma-accent)' : 'var(--player-subtle-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {children}
    </motion.button>
  )
}

function IconButton({
  children,
  active = false,
  ariaLabel,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  ariaLabel: string
  onClick?: () => void
}) {
  return (
    <motion.button
      type="button"
      className={active ? 'is-active' : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      whileHover={{
        backgroundColor: 'var(--player-hover)',
        color: active ? 'var(--plasma-accent)' : 'var(--player-text)',
      }}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: 0.14 }}
      style={{
        position: 'relative',
        width: 30,
        height: 30,
        borderRadius: 4,
        border: 'none',
        background: active ? 'var(--color-primary-light)' : 'transparent',
        color: active ? 'var(--plasma-accent)' : 'var(--player-subtle-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </motion.button>
  )
}

function TimeLabel({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <span
      style={{
        color: 'var(--player-subtle-text)',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        minWidth: 39,
        textAlign: align,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </span>
  )
}

function formatTime(seconds: number): string {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
