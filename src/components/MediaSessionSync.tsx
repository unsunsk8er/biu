import { useEffect, useMemo } from 'react'
import { usePlayer, usePlayerProgress } from '@/contexts/PlayerContext'
import { useLyrics } from '@/hooks/useLyrics'
import { useAppSettings } from '@/hooks/useAppSettings'
import type { LyricLine } from '@/services/lyrics'

function pad(value: number): string {
  return String(Math.floor(value)).padStart(2, '0')
}

function toLrc(lines: LyricLine[]): string {
  return lines
    .map((line) => {
      const minutes = Math.floor(line.time / 60)
      const seconds = line.time % 60
      return `[${pad(minutes)}:${seconds.toFixed(2).padStart(5, '0')}]${line.text}`
    })
    .join('\n')
}

function activeLyric(lines: LyricLine[], progress: number): string {
  let current = ''
  for (const line of lines) {
    if (line.time <= progress) current = line.text
    else break
  }
  return current
}

/**
 * Mirrors the Web player into HarmonyOS AVSession so the control center and
 * notification get artwork/title/artist/album/lyric and can drive playback.
 */
export default function MediaSessionSync() {
  const player = usePlayer()
  const { progress, duration, setProgress } = usePlayerProgress()
  const { settings } = useAppSettings()
  const track = player.currentTrack
  const lyrics = useLyrics(track, Boolean(track) && settings.showLyrics)

  const lrc = useMemo(() => toLrc(lyrics.result?.lines || []), [lyrics.result])
  const currentLyric = useMemo(
    () => activeLyric(lyrics.result?.lines || [], progress),
    [lyrics.result, progress],
  )
  const title = track?.title || ''
  const artist = track?.artist || ''
  const album = track?.album || track?.videoTitle || ''
  const coverUrl = track?.coverUrl || ''
  const total = duration || track?.duration || 0

  useEffect(() => {
    const bridge = window.BiuHarmony
    if (!bridge || !track) return
    bridge.setMediaSession(
      track.id,
      title,
      artist,
      album,
      coverUrl,
      lrc,
      total,
    )
  }, [album, artist, coverUrl, lrc, title, total, track?.id])

  useEffect(() => {
    const bridge = window.BiuHarmony
    if (!bridge || !track) return
    bridge.setMediaSessionLyric(lrc, currentLyric)
  }, [currentLyric, lrc, track?.id])

  useEffect(() => {
    const bridge = window.BiuHarmony
    if (!bridge) return
    if (!track) {
      bridge.clearMediaSession()
      return
    }
    bridge.setMediaSessionState(player.isPlaying, progress, total)
  }, [player.isPlaying, progress, total, track?.id])

  useEffect(() => {
    window.__biuAvCommand = (command: string, value?: number) => {
      switch (command) {
        case 'play':
          if (!player.isPlaying) player.togglePlay()
          break
        case 'pause':
          if (player.isPlaying) player.togglePlay()
          break
        case 'toggle':
          player.togglePlay()
          break
        case 'stop':
          player.pause()
          break
        case 'next':
          player.next()
          break
        case 'previous':
          player.prev()
          break
        case 'seek':
          if (typeof value === 'number' && Number.isFinite(value)) {
            const seconds = Math.max(0, total > 0 ? Math.min(total, value / 1000) : value / 1000)
            setProgress(seconds)
          }
          break
        default:
          break
      }
    }
    return () => {
      delete window.__biuAvCommand
    }
  }, [player, setProgress, total])

  return null
}
