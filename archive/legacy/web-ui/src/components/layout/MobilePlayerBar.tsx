import { useEffect, useRef, useState } from 'react'
import { Download, Heart, ListMusic, Loader2, Pause, Play, SkipForward } from 'lucide-react'
import { usePlayer, usePlayerProgress } from '@/contexts/PlayerContext'
import { useNowPlaying } from '@/contexts/NowPlayingContext'
import CoverArtwork from '@/components/CoverArtwork'
import SlowMarquee from '@/components/SlowMarquee'
import PlayQueue from '@/components/PlayQueue'

export default function MobilePlayerBar() {
  const player = usePlayer()
  const { open } = useNowPlaying()
  const [queueOpen, setQueueOpen] = useState(false)
  const track = player.currentTrack

  useEffect(() => {
    if (!queueOpen) return
    const onBack = (event: Event) => {
      event.preventDefault()
      setQueueOpen(false)
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [queueOpen])

  if (!track) return null

  return (
    <div className="mobile-player">
      <MobileProgress />
      <button type="button" className="mobile-player__main" onClick={open}>
        <span className="mobile-player__cover">
          <CoverArtwork src={track.coverUrl} alt={track.title} loading="eager" iconSize={18} />
        </span>
        <span className="mobile-player__meta">
          <strong><SlowMarquee text={track.title} /></strong>
          <span><SlowMarquee text={track.artist || '未知歌手'} /></span>
        </span>
      </button>
      <button
        type="button"
        className="mobile-player__control mobile-player__play"
        onClick={player.togglePlay}
        aria-label={player.loadingAudio ? '加载中' : player.isPlaying ? '暂停' : '播放'}
        aria-busy={player.loadingAudio || undefined}
      >
        {player.loadingAudio
          ? <Loader2 size={20} className="spin" />
          : player.isPlaying
            ? <Pause size={20} fill="currentColor" />
            : <Play size={20} fill="currentColor" />}
      </button>

      <div className="mobile-player__right">
        <button
          type="button"
          className="mobile-player__control mobile-player__next"
          onClick={player.next}
          aria-label="下一首"
        >
          <SkipForward size={20} />
        </button>
        <button
          type="button"
          className="mobile-player__control mobile-player__extra"
          onClick={() => { void player.downloadCurrentTrack() }}
          aria-label="下载当前歌曲"
        >
          <Download size={20} />
        </button>
        <button
          type="button"
          className={`mobile-player__control mobile-player__extra mobile-player__like ${track.isLiked ? 'is-liked' : ''}`}
          onClick={() => player.toggleLike(track.id)}
          aria-label={track.isLiked ? '取消喜欢' : '喜欢'}
        >
          <Heart size={20} fill={track.isLiked ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="mobile-player__control mobile-player__queue"
          onClick={() => setQueueOpen(true)}
          aria-label={`当前播放列表${player.queue.length ? `，${player.queue.length} 首` : ''}`}
        >
          <ListMusic size={20} />
          {player.queue.length > 0 && (
            <span className="mobile-player__queue-count">
              {player.queue.length > 99 ? '99+' : player.queue.length}
            </span>
          )}
        </button>
      </div>

      <PlayQueue
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        heading="当前播放列表"
        zIndex={260}
        placement="player-bar"
      />
    </div>
  )
}

// Isolated progress consumer: the bar's text and transport buttons no longer
// re-render four times per second while the track is playing.
function MobileProgress() {
  const player = usePlayer()
  const { progress, duration, setProgress } = usePlayerProgress()
  const seekRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const dragProgressRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  const track = player.currentTrack

  if (!track) return null
  const total = duration || track.duration || 0
  const shownProgress = dragging && dragProgress !== null ? dragProgress : progress
  const percent = total > 0 ? Math.min(100, Math.max(0, (shownProgress / total) * 100)) : 0

  const progressFromClientX = (clientX: number): number | null => {
    const rect = seekRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || total <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * total
  }

  const updateDrag = (clientX: number) => {
    const next = progressFromClientX(clientX)
    if (next !== null) {
      dragProgressRef.current = next
      setDragProgress(next)
    }
  }

  const finishDrag = (clientX?: number, commit = true) => {
    const next = clientX === undefined ? dragProgressRef.current : progressFromClientX(clientX)
    if (commit && next !== null) setProgress(next)
    draggingRef.current = false
    dragProgressRef.current = null
    setDragging(false)
    setDragProgress(null)
  }

  return (
    <div
      ref={seekRef}
      className={`mobile-player__seek ${dragging ? 'is-dragging' : ''}`}
      role="slider"
      tabIndex={total > 0 ? 0 : -1}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(total)}
      aria-valuenow={Math.round(shownProgress)}
      aria-disabled={total <= 0 || undefined}
      title="拖动调整播放进度"
      onPointerDown={(event) => {
        if (total <= 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        draggingRef.current = true
        setDragging(true)
        updateDrag(event.clientX)
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) updateDrag(event.clientX)
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        finishDrag(event.clientX)
      }}
      onPointerCancel={() => {
        if (draggingRef.current) finishDrag(undefined, false)
      }}
      onKeyDown={(event) => {
        if (total <= 0) return
        if (event.key === 'Home') {
          event.preventDefault()
          setProgress(0)
          return
        }
        if (event.key === 'End') {
          event.preventDefault()
          setProgress(total)
          return
        }
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
            ? -1
            : 0
        if (!direction) return
        event.preventDefault()
        setProgress(Math.min(total, Math.max(0, shownProgress + direction * 5)))
      }}
    >
      <div className="mobile-player__progress" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
        <i style={{ left: `${percent}%` }} />
      </div>
    </div>
  )
}
