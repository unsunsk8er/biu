import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react'
import type { Track, RepeatMode } from '@/types'
import { extractAudio } from '@/services/api'
import { addRecentTrack, toggleFavoriteTrack, loadFavoriteTracks, updateTrackEverywhere } from '@/utils/storage'
import { useAppSettings } from '@/hooks/useAppSettings'
import { readStoredItem, writeStoredItem } from '@/utils/persistentStorage'
import { coverMatchWasAttempted, findMatchedCover, markCoverMatchAttempted, type MatchedCover } from '@/utils/coverMatch'
import { inferCoverQuery, isUploaderLike } from '@/utils/coverMatchQuery'
import { isAndroidApp, isHarmonyApp } from '@/utils/mobile'
import {
  audioCacheKey,
  cacheAudioForTrack,
  getCachedAudioBlob,
  getCachedAudioItem,
} from '@/services/audioCache'
import type { TrackSource } from '@/services/bilibiliApi'
import { extractAudioProgressive } from '@/services/bilibiliApi'
import { buildAudioCandidateUrls } from '@/services/playbackFallback'
import { cacheHarmonyAudio } from '@/services/harmonyAudio'

// The ArkWeb native takeover is kept for future work, but AVPlayer currently
// rejects the transcoded local MP4 on this device. Disable it so Harmony falls
// back to the regular streaming path instead of getting stuck on a spinner.
const HARMONY_NATIVE_AUDIO_ENABLED = false
const HARMONY_NATIVE_CACHE_ENABLED = false

interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  volume: number
  isMuted: boolean
  repeatMode: RepeatMode
  isShuffled: boolean
  queue: Track[]
  loadingAudio: boolean
  matchingCover: boolean
}

interface PlayerActions {
  play: (track: Track) => void
  pause: () => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  setVolume: (v: number) => void
  setIsMuted: (m: boolean) => void
  setRepeatMode: (m: RepeatMode) => void
  setIsShuffled: (s: boolean) => void
  addToQueue: (track: Track) => void
  addTracksToQueue: (tracks: Track[]) => void
  removeFromQueue: (trackId: string) => void
  removeMultipleFromQueue: (trackIds: string[]) => void
  moveInQueue: (fromIndex: number, toIndex: number) => void
  playNow: (track: Track) => void
  playNext: (track: Track) => void
  clearQueue: () => void
  toggleLike: (trackId: string) => void
  playAll: (tracks: Track[], startIndex?: number) => void
  showToast: (message: string) => void
  playFromQueue: (index: number) => void
  refreshCover: () => Promise<void>
  downloadCurrentTrack: () => Promise<void>
}

interface PlayerProgress {
  progress: number
  duration: number
  setProgress: (p: number) => void
}

type PlayerContext = PlayerState & PlayerActions

interface PersistedPlayerState {
  currentTrack: Track | null
  queue: Track[]
  progress: number
  duration: number
  volume: number
  isMuted: boolean
  repeatMode: RepeatMode
  isShuffled: boolean
  wasPlaying: boolean
  currentIndex: number
}

const PlayerContext = createContext<PlayerContext | null>(null)
const PlayerProgressContext = createContext<PlayerProgress | null>(null)
const PLAYER_STATE_KEY = 'biu_player_state'

function loadPersistedPlayerState(): PersistedPlayerState {
  const fallbackVolume = readStoredItem('biu_volume')
  const fallback: PersistedPlayerState = {
    currentTrack: null,
    queue: [],
    progress: 0,
    duration: 0,
    volume: fallbackVolume ? parseInt(fallbackVolume) : 80,
    isMuted: false,
    repeatMode: 'none',
    isShuffled: false,
    wasPlaying: false,
    currentIndex: -1,
  }

  try {
    const raw = readStoredItem(PLAYER_STATE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PersistedPlayerState>
    const currentTrack = parsed.currentTrack ? repairMatchedTrack(parsed.currentTrack) : null
    let queue = Array.isArray(parsed.queue) ? parsed.queue.map(repairMatchedTrack) : []
    // Older/corrupted state can contain a current track with an empty or
    // mismatched queue. Now Playing would show the song, but next/previous
    // returned immediately. Repair the queue before restoring playback.
    if (currentTrack) {
      const index = queue.findIndex(track => track.id === currentTrack.id)
      if (index >= 0) {
        queue = queue.map((track, i) => i === index ? { ...track, ...currentTrack } : track)
      } else {
        queue = [currentTrack, ...queue]
      }
    }
    const currentIndex = currentTrack
      ? Math.max(0, queue.findIndex(track => track.id === currentTrack.id))
      : -1
    return {
      ...fallback,
      ...parsed,
      currentTrack,
      queue,
      progress: Math.max(0, Number(parsed.progress || 0)),
      duration: Math.max(0, Number(parsed.duration || 0)),
      volume: Math.min(100, Math.max(0, Number(parsed.volume ?? fallback.volume))),
      currentIndex,
      repeatMode: parsed.repeatMode === 'one' || parsed.repeatMode === 'all' ? parsed.repeatMode : 'none',
    }
  } catch {
    return fallback
  }
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shouldIgnoreSpaceShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tagName = target.tagName.toLowerCase()
  if (['input', 'textarea', 'select', 'button'].includes(tagName)) return true
  const role = target.getAttribute('role')
  return Boolean(role && ['button', 'textbox', 'searchbox', 'slider', 'switch', 'combobox'].includes(role))
}

function getArtworkType(url: string): string | undefined {
  if (/\.webp($|\?)/i.test(url)) return 'image/webp'
  if (/\.png($|\?)/i.test(url)) return 'image/png'
  if (/\.(jpe?g)($|\?)/i.test(url)) return 'image/jpeg'
  return undefined
}

/**
 * Cover matching used to write a third-party title/artist back into the track.
 * That turned multi-part collection entries into misleading pairs such as
 * "杰伦 / 无损音乐合集". Rebuild identity from the Bilibili part title and stop
 * treating the matched metadata as authoritative.
 */
function repairMatchedTrack(track: Track): Track {
  const source = String(track.partTitle || track.videoTitle || '').trim()
  if (!source) return track
  const inferred = inferCoverQuery(source, track.artist)
  if (!inferred.title) return track
  return {
    ...track,
    title: inferred.title,
    artist: inferred.artist || track.artist,
    metadataMatched: false,
    coverMatched: false,
  }
}

function setMediaSessionAction(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch {
    // Some Chromium/Electron platform builds expose only part of the action set.
  }
}

function clearMediaSessionActions(actions: MediaSessionAction[]): void {
  actions.forEach(action => setMediaSessionAction(action, null))
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { settings } = useAppSettings()
  const autoCacheRef = useRef(settings.autoCache)
  // 音质只影响“下一次取源”，不必进入加载 effect 的依赖导致切歌重载。
  const playQualityRef = useRef(settings.playQuality)
  const restoredRef = useRef(loadPersistedPlayerState())
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => restoredRef.current.currentTrack)
  // A new Audio element cannot be playing before its source is loaded. The
  // persisted wasPlaying flag only drives shouldAutoplayRef; showing the pause
  // icon immediately made the first cold-start tap behave as "pause" and look
  // like the player did not respond.
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(() => restoredRef.current.progress)
  const [duration, setDuration] = useState(() => restoredRef.current.duration)
  const [volume, setVolumeState] = useState(() => restoredRef.current.volume)
  const [isMuted, setIsMuted] = useState(() => restoredRef.current.isMuted)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => restoredRef.current.repeatMode)
  const [isShuffled, setIsShuffled] = useState(() => restoredRef.current.isShuffled)
  const [queue, setQueue] = useState<Track[]>(() => restoredRef.current.queue)
  const [loadingAudio, setLoadingAudio] = useState(() => Boolean(restoredRef.current.currentTrack && restoredRef.current.wasPlaying))
  const [matchingCover, setMatchingCover] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pausedAtRef = useRef(0)
  const currentSourceUrlRef = useRef('')
  const shuffledQueueRef = useRef<Track[]>([])
  const currentIndexRef = useRef(restoredRef.current.currentIndex)
  const shouldAutoplayRef = useRef(Boolean(restoredRef.current.currentTrack && restoredRef.current.wasPlaying))
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const progressRef = useRef(progress)
  const durationRef = useRef(duration)
  const currentTrackRef = useRef<Track | null>(currentTrack)
  const loadingAudioRef = useRef(false)
  const loadGenerationRef = useRef(0)
  const abortCurrentLoadRef = useRef<(() => void) | null>(null)
  const loadWatchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const loadingStartedAtRef = useRef(0)
  const needsReloadRef = useRef(false)
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const errorRetryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const errorRetryCountRef = useRef(0)
  const startAtBeginningRef = useRef(false)
  const autoLoadRetryRef = useRef(0)
  const resumeAttemptRef = useRef(0)
  const resumeAttemptTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastHiddenAtRef = useRef(0)
  const backgroundRecoveryRef = useRef(false)
  const nativeReloadRef = useRef<() => boolean>(() => false)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2000)
  }, [])

  const cancelLoading = useCallback(() => {
    abortCurrentLoadRef.current?.()
    abortCurrentLoadRef.current = null
    loadingAudioRef.current = false
    loadingStartedAtRef.current = 0
    setLoadingAudio(false)
  }, [])

  // 初始化 audio 元素
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = volume / 100
    audioRef.current = audio

    const onTimeUpdate = () => {
      // A track switch pauses the old element, but its final timeupdate can
      // arrive after React already reset progress to 0. Never let it leak into
      // the new track's initial position.
      if (!loadingAudioRef.current) setProgress(audio.currentTime)
    }
    const onDuration = () => {
      if (!loadingAudioRef.current) setDuration(audio.duration || 0)
    }
    const onEnded = () => { /* handled in playTrack */ }
    const onError = () => {
      const mediaError = audio.error
      console.warn('[biu-audio] playback error', mediaError?.code, mediaError?.message, audio.currentSrc)
      // During the initial load the source fallback loop owns recovery.
      if (loadingAudioRef.current) return
      if (
        shouldAutoplayRef.current
        && currentTrackRef.current
        && audio.currentTime > 0.4
        && errorRetryCountRef.current < 2
      ) {
        errorRetryCountRef.current += 1
        if (errorRetryTimerRef.current) clearTimeout(errorRetryTimerRef.current)
        loadingAudioRef.current = true
        setLoadingAudio(true)
        setIsPlaying(true)
        errorRetryTimerRef.current = setTimeout(() => {
          errorRetryTimerRef.current = undefined
          setReloadToken(token => token + 1)
        }, 600)
        return
      }
      needsReloadRef.current = true
      setLoadingAudio(false)
      setIsPlaying(false)
    }
    const onAudioPause = () => {
      pausedAtRef.current = Date.now()
      // Some Android WebViews pause media when the activity is covered or
      // audio focus changes. If this was not a user pause, resume shortly.
      if (
        !shouldAutoplayRef.current
        || loadingAudioRef.current
        || audio.error
        || audio.ended
        || audio.currentTime < 0.2
      ) return
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current)
      autoResumeTimerRef.current = setTimeout(() => {
        autoResumeTimerRef.current = undefined
        if (
          shouldAutoplayRef.current
          && !loadingAudioRef.current
          && audio.paused
          && !audio.error
          && !audio.ended
        ) {
          void audio.play()
            .then(() => {
              needsReloadRef.current = false
              setIsPlaying(true)
            })
            .catch(() => {
              // Expired/blocked source: refresh a signed URL immediately,
              // even while the Activity is in the background. Waiting for the
              // next foreground visit was why long background playback stayed
              // paused with a stale source.
              needsReloadRef.current = true
              setIsPlaying(false)
              setReloadToken(token => token + 1)
            })
        }
      }, 600)
    }
    const onAudioPlay = () => {
      pausedAtRef.current = 0
      backgroundRecoveryRef.current = false
      if (resumeAttemptTimerRef.current) {
        clearTimeout(resumeAttemptTimerRef.current)
        resumeAttemptTimerRef.current = undefined
      }
      if (autoResumeTimerRef.current) {
        clearTimeout(autoResumeTimerRef.current)
        autoResumeTimerRef.current = undefined
      }
      // A direct resume (outside the source loader) can fire `play` before its
      // promise resolves. Clear the spinner from the actual media event.
      if (!loadingAudioRef.current) {
        setLoadingAudio(false)
        setIsPlaying(true)
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    audio.addEventListener('pause', onAudioPause)
    audio.addEventListener('play', onAudioPlay)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('pause', onAudioPause)
      audio.removeEventListener('play', onAudioPlay)
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current)
      if (errorRetryTimerRef.current) clearTimeout(errorRetryTimerRef.current)
      if (resumeAttemptTimerRef.current) clearTimeout(resumeAttemptTimerRef.current)
      audio.pause()
      audio.src = ''
    }
  }, [])

  // Android Activity/WV may throttle timers and pause media while the screen is
  // locked. On unlock/focus, refresh the visible time and resume only when the
  // user had not intentionally paused. This is debounced to avoid competing
  // with the first repaint after unlock.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const syncAfterResume = () => {
      if (document.visibilityState === 'hidden') return
      const audio = audioRef.current
      if (!audio || !currentTrackRef.current) return
      const hiddenFor = lastHiddenAtRef.current > 0 ? Date.now() - lastHiddenAtRef.current : 0
      lastHiddenAtRef.current = 0
      if (hiddenFor > 3_000) backgroundRecoveryRef.current = true
      if (loadingAudioRef.current) {
        // Never let a resumed Activity sit on an unbounded loading spinner.
        // After 12s, abandon the stale load and request a freshly signed source.
        if (Date.now() - loadingStartedAtRef.current > 12_000) {
          abortCurrentLoadRef.current?.()
          loadingAudioRef.current = false
          loadingStartedAtRef.current = 0
          setLoadingAudio(false)
          shouldAutoplayRef.current = true
          needsReloadRef.current = false
          setReloadToken(token => token + 1)
        }
        return
      }
      if (!audio.paused) {
        if (Number.isFinite(audio.currentTime) && Math.abs(audio.currentTime - progressRef.current) > 0.08) {
          setProgress(audio.currentTime)
        }
        if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
        return
      }
      if (!shouldAutoplayRef.current || audio.ended) {
        // User intentionally paused. After a real background visit, discard
        // the resumed media readiness so the next tap forces a fresh source
        // instead of calling play() on a silently suspended element.
        if (hiddenFor > 3_000 && audio.paused) needsReloadRef.current = true
        return
      }
      const pausedFor = pausedAtRef.current > 0 ? Date.now() - pausedAtRef.current : 0
      if (
        needsReloadRef.current
        || audio.error
        || audio.readyState < 2
        || hiddenFor > 3_000
        || pausedFor > 30_000
      ) {
        needsReloadRef.current = false
        setReloadToken(token => token + 1)
        return
      }
      if (audio.currentTime >= 0) {
        void audio.play()
          .then(() => {
            needsReloadRef.current = false
            setIsPlaying(true)
          })
          .catch(() => {
            // Signed streams often expire while the Activity is backgrounded.
            // Re-extract a fresh URL instead of leaving a stuck pause state.
            needsReloadRef.current = true
            setIsPlaying(false)
            setReloadToken(token => token + 1)
          })
      }
    }
    const schedule = () => {
      if (document.visibilityState === 'hidden') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(syncAfterResume, 140)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now()
        return
      }
      schedule()
    }
    window.__biuAppResumed = schedule
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', schedule)
    return () => {
      if (timer) clearTimeout(timer)
      if (window.__biuAppResumed === schedule) delete window.__biuAppResumed
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', schedule)
    }
  }, [])

  useEffect(() => {
    autoCacheRef.current = settings.autoCache
  }, [settings.autoCache])

  useEffect(() => {
    playQualityRef.current = settings.playQuality
  }, [settings.playQuality])

  // volume 同步到 audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100
      audioRef.current.muted = isMuted
    }
    writeStoredItem('biu_volume', String(volume))
  }, [volume, isMuted])

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  useEffect(() => {
    currentTrackRef.current = currentTrack
  }, [currentTrack])

  useEffect(() => {
    errorRetryCountRef.current = 0
    autoLoadRetryRef.current = 0
    backgroundRecoveryRef.current = false
    resumeAttemptRef.current += 1
    if (resumeAttemptTimerRef.current) {
      clearTimeout(resumeAttemptTimerRef.current)
      resumeAttemptTimerRef.current = undefined
    }
    if (errorRetryTimerRef.current) {
      clearTimeout(errorRetryTimerRef.current)
      errorRetryTimerRef.current = undefined
    }
  }, [currentTrack?.id])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  const handleTrackEnd = useCallback(() => {
    const displayQueue = isShuffled ? shuffledQueueRef.current : queue
    if (displayQueue.length === 0) {
      setIsPlaying(false)
      return
    }

    switch (repeatMode) {
      case 'one':
        if (audioRef.current) {
          audioRef.current.currentTime = 0
          shouldAutoplayRef.current = true
          audioRef.current.play().catch(() => {})
        }
        return
      case 'all': {
        const nextIdx = currentIndexRef.current + 1 >= displayQueue.length
          ? 0 : currentIndexRef.current + 1
        currentIndexRef.current = nextIdx
        shouldAutoplayRef.current = true
        startAtBeginningRef.current = true
        setCurrentTrack(displayQueue[nextIdx])
        setProgress(0)
        setIsPlaying(true)
        return
      }
      default: {
        const nextIdx = currentIndexRef.current + 1
        if (nextIdx >= displayQueue.length) {
          setIsPlaying(false)
          return
        }
        currentIndexRef.current = nextIdx
        shouldAutoplayRef.current = true
        startAtBeginningRef.current = true
        setCurrentTrack(displayQueue[nextIdx])
        setProgress(0)
        setIsPlaying(true)
      }
    }
  }, [isShuffled, queue, repeatMode])

  // 当 currentTrack 变化时加载并播放音频
  useEffect(() => {
    if (!currentTrack || !audioRef.current) return
    // A restored-but-paused track does not need to hit Bilibili/audio CDN at
    // startup. The source is fetched on the first play or track switch.
    if (!shouldAutoplayRef.current) {
      loadingAudioRef.current = false
      setLoadingAudio(false)
      return
    }

    const generation = ++loadGenerationRef.current
    needsReloadRef.current = false
    let cancelled = false
    let objectUrl = ''
    let cancelSourceLoad: (() => void) | null = null
    const audio = audioRef.current
    loadingStartedAtRef.current = Date.now()

    const abortLoad = () => {
      cancelled = true
      cancelSourceLoad?.()
      cancelSourceLoad = null
      try { audio.pause() } catch { /* audio may already be torn down */ }
      loadingAudioRef.current = false
      loadingStartedAtRef.current = 0
      setLoadingAudio(false)
      if (loadWatchdogRef.current) {
        clearTimeout(loadWatchdogRef.current)
        loadWatchdogRef.current = undefined
      }
    }
    abortCurrentLoadRef.current = abortLoad
    if (loadWatchdogRef.current) clearTimeout(loadWatchdogRef.current)
    loadWatchdogRef.current = setTimeout(() => {
      if (cancelled || loadGenerationRef.current !== generation) return
      const wantsPlayback = shouldAutoplayRef.current
      abortLoad()
      if (wantsPlayback && autoLoadRetryRef.current < 1) {
        autoLoadRetryRef.current += 1
        shouldAutoplayRef.current = true
        setIsPlaying(true)
        showToast('网络较慢，正在重新连接音频…')
        window.setTimeout(() => {
          setLoadingAudio(true)
          setReloadToken(token => token + 1)
        }, 600)
        return
      }
      if (backgroundRecoveryRef.current && nativeReloadRef.current()) {
        showToast('正在重启播放器以恢复音频…')
        return
      }
      shouldAutoplayRef.current = false
      needsReloadRef.current = true
      setIsPlaying(false)
      showToast('音频加载超时，点播放重试')
    }, 20_000)

    async function loadAndPlay() {
      loadingAudioRef.current = true
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current)
      if (startAtBeginningRef.current) {
        startAtBeginningRef.current = false
        progressRef.current = 0
        setProgress(0)
      }
      setLoadingAudio(true)
      try {
        try {
          audio.pause()
          // Fully detach the old media resource. On HarmonyOS/卓易通 the
          // decoder can remain suspended after background; simply assigning a
          // new src is not always enough, while load() after removing src
          // forces the WebView to rebuild its media pipeline.
          audio.removeAttribute('src')
          audio.load()
        } catch {
          // Continue with a fresh src below.
        }
        const fallback = currentTrack!.aid && currentTrack!.cid
          ? { aid: currentTrack!.aid, cid: currentTrack!.cid }
          : undefined
        const bvid = currentTrack!.bvid || currentTrack!.id
        const cacheKey = audioCacheKey(currentTrack!)
        const cachedBlob = isAndroidApp() ? await getCachedAudioBlob(cacheKey) : null
        if (cancelled) return
        let source: TrackSource
        if (cachedBlob) {
          objectUrl = URL.createObjectURL(cachedBlob)
          source = {
            bvid,
            aid: Number(currentTrack!.aid) || 0,
            cid: Number(currentTrack!.cid) || 0,
            title: currentTrack!.title,
            artist: currentTrack!.artist,
            coverUrl: currentTrack!.coverUrl,
            duration: currentTrack!.duration || 0,
            audioUrl: objectUrl,
            backupUrls: [],
            audioQuality: 0,
            audioMimeType: 'audio/mp4',
          }
        } else {
          source = await extractAudio(bvid, {
            cid: currentTrack!.cid,
            aid: currentTrack!.aid,
            title: currentTrack!.title,
            artist: currentTrack!.artist,
            coverUrl: currentTrack!.coverUrl,
            duration: currentTrack!.duration,
            fallback,
            quality: playQualityRef.current,
          })
        }
        if (cancelled) {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          return
        }
        currentSourceUrlRef.current = source.audioUrl
        const targetProgress = progressRef.current > 0 ? progressRef.current : 0

        // 等到 metadata 就绪再恢复进度；远程音频在 metadata 前写 currentTime 会被忽略/抛错。
        // First play starts the download immediately (targetProgress 0) instead
        // of waiting for loadedmetadata, then the timeout/fallback ladder only
        // waits a few seconds per candidate instead of 15s per URL.
        const loadSource = async (url: string, attempt: number) => {
          if (cancelled) throw new Error('已切换歌曲')
          const earlyPlay = shouldAutoplayRef.current && targetProgress <= 0
          await new Promise<void>((resolve, reject) => {
            let settled = false
            // cleanup 可能在异步分支赋值前执行，因此不能改成 const。
            // eslint-disable-next-line prefer-const
            let timer: ReturnType<typeof setTimeout> | undefined
            const cleanup = () => {
              audio.removeEventListener('loadedmetadata', onReady)
              audio.removeEventListener('error', onError)
              if (timer) clearTimeout(timer)
              if (cancelSourceLoad === abort) cancelSourceLoad = null
            }
            const finish = (action: () => void) => {
              if (settled) return
              settled = true
              cleanup()
              action()
            }
            const onReady = () => finish(resolve)
            const onError = () => finish(() => reject(new Error(audio.error?.message || '音频源加载失败')))
            const abort = () => finish(() => reject(new Error('已切换歌曲')))
            cancelSourceLoad = abort
            timer = setTimeout(() => {
              finish(() => {
                try {
                  audio.pause()
                  audio.removeAttribute('src')
                  audio.load()
                } catch {
                  // Ignore; the next candidate will replace the source.
                }
                reject(new Error('音频源加载超时'))
              })
            }, attempt === 0 ? 7000 : 4000)
            audio.addEventListener('loadedmetadata', onReady, { once: true })
            audio.addEventListener('error', onError, { once: true })
            if (cancelled) {
              abort()
              return
            }
            audio.src = url
            audio.load()
            if (earlyPlay) void audio.play().catch(() => {})
          })
          if (targetProgress > 0) {
            try {
              const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : targetProgress
              audio.currentTime = Math.min(targetProgress, max)
            } catch {
              // 个别 CDN 流不支持 seek，忽略即可
            }
          }
        }

        const candidateUrls = (target: typeof source) => buildAudioCandidateUrls(target)

        let loaded = false
        let lastError: unknown = null

        // HarmonyOS native AVPlayer handles a progressive MP4 network stream
        // reliably (with Referer via MediaSource); prefer it over a local
        // transcode when the native takeover is enabled.
        if (HARMONY_NATIVE_AUDIO_ENABLED && isHarmonyApp() && currentTrack?.cid) {
          try {
            const progressive = await extractAudioProgressive(
              currentTrack.bvid || currentTrack.id,
              Number(currentTrack.cid),
              {
                aid: currentTrack.aid,
                title: currentTrack.title,
                artist: currentTrack.artist,
                coverUrl: currentTrack.coverUrl,
                duration: currentTrack.duration,
              },
            )
            for (const [attempt, url] of candidateUrls(progressive).slice(0, 6).entries()) {
              if (cancelled) return
              try {
                await loadSource(url, attempt)
                if (cancelled) return
                loaded = true
                source = progressive
                break
              } catch (err) {
                lastError = err
              }
            }
          } catch (err) {
            lastError = err
          }
        }

        // HarmonyOS: ArkWeb pauses HTML <audio> when the ability goes to the
        // background. Download + transcode once, then let the native AVPlayer
        // take over the local M4A so playback survives Home.
        if (HARMONY_NATIVE_CACHE_ENABLED && isHarmonyApp() && source.audioUrl) {
          try {
            const fileUrl = await cacheHarmonyAudio([source.audioUrl, ...(source.backupUrls || [])], currentTrack!.id)
            await loadSource(fileUrl, 0)
            if (cancelled) return
            loaded = true
            source = { ...source, audioUrl: fileUrl, backupUrls: [] }
          } catch (err) {
            lastError = err
          }
        }

        if (!loaded && isHarmonyApp() && currentTrack?.cid) {
          try {
            const progressive = await extractAudioProgressive(
              currentTrack.bvid || currentTrack.id,
              Number(currentTrack.cid),
              {
                aid: currentTrack.aid,
                title: currentTrack.title,
                artist: currentTrack.artist,
                coverUrl: currentTrack.coverUrl,
                duration: currentTrack.duration,
              },
            )
            for (const [attempt, url] of candidateUrls(progressive).slice(0, 6).entries()) {
              if (cancelled) return
              try {
                await loadSource(url, attempt)
                if (cancelled) return
                loaded = true
                source = progressive
                break
              } catch (err) {
                lastError = err
              }
            }
          } catch (err) {
            lastError = err
          }
        }

        if (!loaded) {
          for (const [attempt, url] of candidateUrls(source).slice(0, 6).entries()) {
            if (cancelled) return
            try {
              await loadSource(url, attempt)
              if (cancelled) return
              loaded = true
              break
            } catch (err) {
              lastError = err
            }
          }
        }

        // 主 CDN 与备用 CDN 都失败时，重新提取一次签名地址再试（B站地址会短期失效）
        if (!loaded && !cancelled) {
          try {
            source = await extractAudio(currentTrack!.bvid || currentTrack!.id, {
              cid: currentTrack!.cid,
              aid: currentTrack!.aid,
              title: currentTrack!.title,
              artist: currentTrack!.artist,
              coverUrl: currentTrack!.coverUrl,
              duration: currentTrack!.duration,
              fallback,
              quality: playQualityRef.current,
            })
            if (cancelled) return
            for (const [attempt, url] of candidateUrls(source).slice(0, 6).entries()) {
              if (cancelled) return
              try {
                await loadSource(url, attempt)
                if (cancelled) return
                loaded = true
                break
              } catch (err) {
                lastError = err
              }
            }
          } catch (err) {
            lastError = err
          }
        }

        // Some videos expose DASH audio URLs whose CDN rejects the WebView
        // request. Retry with the progressive MP4 stream before giving up.
        if (!loaded && !cancelled && currentTrack?.cid) {
          try {
            const progressive = await extractAudioProgressive(
              currentTrack.bvid || currentTrack.id,
              Number(currentTrack.cid),
              {
                aid: currentTrack.aid,
                title: currentTrack.title,
                artist: currentTrack.artist,
                coverUrl: currentTrack.coverUrl,
                duration: currentTrack.duration,
              },
            )
            for (const [attempt, url] of candidateUrls(progressive).slice(0, 6).entries()) {
              if (cancelled) return
              try {
                await loadSource(url, attempt)
                if (cancelled) return
                loaded = true
                source = progressive
                break
              } catch (err) {
                lastError = err
              }
            }
          } catch (err) {
            lastError = err
          }
        }

        // Last resort on HarmonyOS: download with a native Referer into the app
        // cache and play the local file. Some CDNs reject the WebView request
        // even though the same URL is valid for this device.
        if (!loaded && !cancelled && HARMONY_NATIVE_CACHE_ENABLED && isHarmonyApp() && source.audioUrl) {
          try {
            const fileUrl = await cacheHarmonyAudio(source.audioUrl, currentTrack!.id)
            await loadSource(fileUrl, 0)
            if (cancelled) return
            loaded = true
            source = {
              ...source,
              audioUrl: fileUrl,
              backupUrls: [],
            }
          } catch (err) {
            lastError = err
          }
        }

        if (!loaded) throw lastError instanceof Error ? lastError : new Error('无法加载音频源')
        if (cancelled) return
        if (shouldAutoplayRef.current) {
          await audio.play()
          if (cancelled) {
            audio.pause()
            return
          }
          setIsPlaying(true)
        } else {
          audio.pause()
          setIsPlaying(false)
        }
        setDuration(source.duration || audio.duration || 0)

        // Play-through caching: store one extra copy for offline replay. The
        // cached Blob is reused automatically on the next playback.
        if (autoCacheRef.current && !cachedBlob && isAndroidApp() && /^https?:/i.test(source.audioUrl)) {
          const trackId = currentTrack!.id
          window.setTimeout(() => {
            if (
              currentTrackRef.current?.id === trackId
              && shouldAutoplayRef.current
              && !audio.error
            ) {
              void cacheAudioForTrack(currentTrack!, source.audioUrl).catch(() => {})
            }
          }, 5000)
        }

        // 更新封面（提取到的可能更高清），但不要覆盖已匹配的专辑封面
        if (source.coverUrl) {
          setCurrentTrack(prev => (
            prev && !prev.coverMatched ? { ...prev, coverUrl: source.coverUrl } : prev
          ))
        }
        // 记录最近播放
        addRecentTrack({ ...currentTrack!, coverUrl: source.coverUrl || currentTrack!.coverUrl })
      } catch {
        if (!cancelled) {
          if (shouldAutoplayRef.current && autoLoadRetryRef.current < 1) {
            autoLoadRetryRef.current += 1
            showToast('音频连接中断，正在自动重试…')
            window.setTimeout(() => {
              setLoadingAudio(true)
              setIsPlaying(true)
              setReloadToken(token => token + 1)
            }, 600)
          } else if (backgroundRecoveryRef.current && nativeReloadRef.current()) {
            showToast('正在重启播放器以恢复音频…')
          } else {
            // All CDNs failed; stop rather than leaving a permanent spinner.
            shouldAutoplayRef.current = false
            needsReloadRef.current = true
            setIsPlaying(false)
            showToast('音频加载失败，点播放重试')
          }
        }
      } finally {
        if (loadGenerationRef.current === generation) {
          loadingAudioRef.current = false
          loadingStartedAtRef.current = 0
          setLoadingAudio(false)
          if (loadWatchdogRef.current) {
            clearTimeout(loadWatchdogRef.current)
            loadWatchdogRef.current = undefined
          }
          if (abortCurrentLoadRef.current === abortLoad) abortCurrentLoadRef.current = null
        }
      }
    }

    loadAndPlay()
    return () => {
      cancelled = true
      cancelSourceLoad?.()
      cancelSourceLoad = null
      try { audio.pause() } catch { /* audio may already be torn down */ }
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (loadWatchdogRef.current) {
        clearTimeout(loadWatchdogRef.current)
        loadWatchdogRef.current = undefined
      }
      if (loadGenerationRef.current === generation) {
        loadingAudioRef.current = false
        loadingStartedAtRef.current = 0
        setLoadingAudio(false)
      }
      if (abortCurrentLoadRef.current === abortLoad) abortCurrentLoadRef.current = null
    }
  }, [currentTrack?.id, currentTrack?.bvid, reloadToken, showToast])

  // ended 事件
  useEffect(() => {
    if (!audioRef.current) return
    const handler = () => handleTrackEnd()
    audioRef.current.addEventListener('ended', handler)
    return () => audioRef.current?.removeEventListener('ended', handler)
  }, [handleTrackEnd])

  const reloadIfCurrentTrack = useCallback((track: Track) => {
    // Paused startup deliberately skips source loading. Re-selecting the
    // current track must still create a load; the track id alone would not
    // change, so the load effect would otherwise never run.
    if (currentTrackRef.current?.id === track.id) {
      setReloadToken(token => token + 1)
    }
  }, [])

  const play = useCallback((track: Track) => {
    shouldAutoplayRef.current = true
    reloadIfCurrentTrack(track)
    startAtBeginningRef.current = true
    setCurrentTrack(track)
    setProgress(0)
    setIsPlaying(true)
    const displayQueue = isShuffled ? shuffledQueueRef.current : queue
    const idx = displayQueue.findIndex(t => t.id === track.id)
    currentIndexRef.current = idx >= 0 ? idx : 0
    // A track launched from a detached/empty queue must become playable so
    // next/previous still have a queue to walk.
    if (idx < 0) {
      setQueue(prev => prev.some(t => t.id === track.id) ? prev : [track, ...prev])
    }
  }, [isShuffled, queue, reloadIfCurrentTrack])

  const pause = useCallback(() => {
    shouldAutoplayRef.current = false
    pausedAtRef.current = Date.now()
    if (loadingAudioRef.current) cancelLoading()
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [cancelLoading])

  const togglePlay = useCallback(() => {
    if (!currentTrack) return

    // The spinner is also a stop/retry affordance. Without this, a stalled
    // loader left the play/pause button unresponsive.
    if (loadingAudioRef.current || loadingAudio) {
      shouldAutoplayRef.current = false
      cancelLoading()
      pausedAtRef.current = Date.now()
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }

    if (isPlaying) {
      shouldAutoplayRef.current = false
      pausedAtRef.current = Date.now()
      audioRef.current?.pause()
      setIsPlaying(false)
      return
    }

    shouldAutoplayRef.current = true
    // A fresh user-initiated play gets its own one-shot recovery budget.
    autoLoadRetryRef.current = 0
    const audio = audioRef.current
    const pausedFor = pausedAtRef.current > 0 ? Date.now() - pausedAtRef.current : 0
    // Signed Bilibili audio URLs expire. Reloading after a long pause or a
    // background visit is more reliable than resuming an already suspended
    // <audio> source; the load effect seeks back to saved progress.
    if (
      !audio
      || pausedFor > 30_000
      || needsReloadRef.current
      || audio.error
      || audio.readyState === 0
    ) {
      if (pausedFor > 30_000 || needsReloadRef.current) backgroundRecoveryRef.current = true
      needsReloadRef.current = false
      setLoadingAudio(true)
      setReloadToken(token => token + 1)
      return
    }

    const attempt = ++resumeAttemptRef.current
    const resumeAt = audio.currentTime
    if (resumeAttemptTimerRef.current) clearTimeout(resumeAttemptTimerRef.current)
    resumeAttemptTimerRef.current = setTimeout(() => {
      resumeAttemptTimerRef.current = undefined
      if (attempt !== resumeAttemptRef.current) return
      const current = audioRef.current
      if (current && !current.paused && current.currentTime > resumeAt + 0.08) {
        setLoadingAudio(false)
        return
      }
      // Android WebView can leave play() pending forever after a long
      // background suspension. Treat that as a stale source and reload.
      backgroundRecoveryRef.current = true
      resumeAttemptRef.current += 1
      needsReloadRef.current = false
      setLoadingAudio(true)
      setReloadToken(token => token + 1)
    }, 5_000)

    setLoadingAudio(true)
    void audio.play()
      .then(() => {
        if (attempt !== resumeAttemptRef.current) return
        if (resumeAttemptTimerRef.current) {
          clearTimeout(resumeAttemptTimerRef.current)
          resumeAttemptTimerRef.current = undefined
        }
        pausedAtRef.current = 0
        setIsPlaying(true)
        setLoadingAudio(false)
      })
      .catch(() => {
        if (attempt !== resumeAttemptRef.current) return
        if (resumeAttemptTimerRef.current) {
          clearTimeout(resumeAttemptTimerRef.current)
          resumeAttemptTimerRef.current = undefined
        }
        // The stream may have gone stale while paused; force a fresh source.
        needsReloadRef.current = false
        setLoadingAudio(true)
        setReloadToken(token => token + 1)
      })
  }, [currentTrack, isPlaying, loadingAudio, cancelLoading])

  const next = useCallback(() => {
    startAtBeginningRef.current = true
    const displayQueue = isShuffled ? shuffledQueueRef.current : queue
    if (displayQueue.length === 0) {
      if (!currentTrack) return
      // Recover a detached current track instead of silently doing nothing.
      setQueue([currentTrack])
      currentIndexRef.current = 0
      setProgress(0)
      setIsPlaying(true)
      setReloadToken(token => token + 1)
      return
    }
    if (displayQueue.length === 1) {
      currentIndexRef.current = 0
      shouldAutoplayRef.current = true
      setProgress(0)
      setIsPlaying(true)
      setReloadToken(token => token + 1)
      return
    }
    const current = currentIndexRef.current
    const nextIdx = current < 0 || current >= displayQueue.length
      ? 0 : (current + 1) % displayQueue.length
    currentIndexRef.current = nextIdx
    shouldAutoplayRef.current = true
    setCurrentTrack(displayQueue[nextIdx])
    setProgress(0)
    setIsPlaying(true)
  }, [isShuffled, queue, currentTrack])

  const prev = useCallback(() => {
    startAtBeginningRef.current = true
    const displayQueue = isShuffled ? shuffledQueueRef.current : queue
    if (displayQueue.length === 0) {
      if (!currentTrack) return
      setQueue([currentTrack])
      currentIndexRef.current = 0
      setProgress(0)
      setIsPlaying(true)
      setReloadToken(token => token + 1)
      return
    }
    if (displayQueue.length === 1) {
      currentIndexRef.current = 0
      shouldAutoplayRef.current = true
      setProgress(0)
      setIsPlaying(true)
      setReloadToken(token => token + 1)
      return
    }
    const current = currentIndexRef.current
    const prevIdx = current <= 0 || current >= displayQueue.length
      ? displayQueue.length - 1 : current - 1
    currentIndexRef.current = prevIdx
    shouldAutoplayRef.current = true
    setCurrentTrack(displayQueue[prevIdx])
    setProgress(0)
    setIsPlaying(true)
  }, [isShuffled, queue, currentTrack])

  const handleSetProgress = useCallback((p: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = p
    }
    setProgress(p)
  }, [])

  const handleSetVolume = useCallback((v: number) => {
    setVolumeState(v)
  }, [])

  const addToQueue = useCallback((track: Track) => {
    const exists = queue.some(t => t.id === track.id)
    setQueue(prev => {
      if (prev.some(t => t.id === track.id)) return prev
      const newQueue = [...prev, track]
      if (!currentTrack) {
        shouldAutoplayRef.current = true
        startAtBeginningRef.current = true
        setCurrentTrack(track)
        currentIndexRef.current = 0
      }
      return newQueue
    })
    showToast(exists ? '已在播放列表中' : '已加入播放列表')
  }, [queue, currentTrack, showToast])

  const addTracksToQueue = useCallback((tracks: Track[]) => {
    setQueue(prev => {
      const existingIds = new Set(prev.map(t => t.id))
      const newTracks = tracks.filter(t => !existingIds.has(t.id))
      const newQueue = [...prev, ...newTracks]
      if (!currentTrack && newQueue.length > 0) {
        shouldAutoplayRef.current = true
        startAtBeginningRef.current = true
        setCurrentTrack(newQueue[0])
        currentIndexRef.current = 0
      }
      return newQueue
    })
  }, [currentTrack])

  // 队列变更后把 currentIndexRef 重新对齐到当前曲目（避免 next/prev 错位）
  const resyncIndex = useCallback((nextQueue: Track[]) => {
    const curId = currentTrack?.id
    if (curId) currentIndexRef.current = nextQueue.findIndex(t => t.id === curId)
  }, [currentTrack])

  const removeFromQueue = useCallback((trackId: string) => {
    setQueue(prev => {
      const next = prev.filter(t => t.id !== trackId)
      resyncIndex(next)
      return next
    })
  }, [resyncIndex])

  const removeMultipleFromQueue = useCallback((trackIds: string[]) => {
    const idSet = new Set(trackIds)
    setQueue(prev => {
      const next = prev.filter(t => !idSet.has(t.id))
      resyncIndex(next)
      return next
    })
  }, [resyncIndex])

  // 调整顺序：把 fromIndex 的曲目移动到 toIndex
  const moveInQueue = useCallback((fromIndex: number, toIndex: number) => {
    setQueue(prev => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 || fromIndex >= prev.length ||
        toIndex < 0 || toIndex >= prev.length
      ) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      resyncIndex(next)
      return next
    })
  }, [resyncIndex])

  // 立即播放：把曲目置于队列首位并播放（点击歌曲的默认行为）
  const playNow = useCallback((track: Track) => {
    shouldAutoplayRef.current = true
    startAtBeginningRef.current = true
    reloadIfCurrentTrack(track)
    setQueue(prev => [track, ...prev.filter(t => t.id !== track.id)])
    setCurrentTrack(track)
    setProgress(0)
    currentIndexRef.current = 0
    setIsPlaying(true)
  }, [reloadIfCurrentTrack])

  // 下一首播放：把曲目插入到当前曲目之后（不在队列则新增；无播放则等同立即播放）
  const playNext = useCallback((track: Track) => {
    if (!currentTrack) { playNow(track); return }
    setQueue(prev => {
      const without = prev.filter(t => t.id !== track.id)
      const curIdx = without.findIndex(t => t.id === currentTrack.id)
      const insertAt = curIdx >= 0 ? curIdx + 1 : without.length
      const next = [...without.slice(0, insertAt), track, ...without.slice(insertAt)]
      resyncIndex(next)
      return next
    })
    showToast('已设为下一首播放')
  }, [currentTrack, resyncIndex, showToast, playNow])

  const clearQueue = useCallback(() => {
    shouldAutoplayRef.current = false
    setQueue([])
    setCurrentTrack(null)
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
  }, [])

  const toggleLike = useCallback((trackId: string) => {
    const track = queue.find(t => t.id === trackId) || currentTrack
    if (track) {
      toggleFavoriteTrack(track)
    }
    setCurrentTrack(prev => prev && prev.id === trackId ? { ...prev, isLiked: !prev.isLiked } : prev)
    setQueue(prev => prev.map(t => t.id === trackId ? { ...t, isLiked: !t.isLiked } : t))
  }, [queue, currentTrack])

  const applyMatchedInfo = useCallback((trackId: string, match: MatchedCover) => {
    const updateTrack = (track: Track): Track => {
      if (track.id !== trackId) return track
      // A cover lookup must never rewrite Bilibili's song identity. Provider
      // catalogue entries can disagree on title/artist (especially for a
      // multi-part collection), and that used to make the player show a valid
      // cover next to the wrong song name.
      //
      // The one safe repair is the artist: compilations expose the uploader
      // (e.g. "典藏音乐") where the track has no artist. Only replace that
      // uploader-style value, and only with a provider artist that itself looks
      // like a real artist. A meaningful existing artist is never touched.
      const providerArtist = String(match.artist || '').trim()
      const repairArtist = isUploaderLike(track.artist)
        && providerArtist.length > 0
        && !isUploaderLike(providerArtist)
      const coverUrl = match.coverUrl || track.coverUrl
      if (
        coverUrl === track.coverUrl
        && (!repairArtist || providerArtist === track.artist)
        && track.coverMatched
      ) return track
      return {
        ...track,
        artist: repairArtist ? providerArtist : track.artist,
        coverUrl,
        coverMatched: Boolean(match.coverUrl) || track.coverMatched,
        metadataMatched: true,
      }
    }
    setCurrentTrack(prev => prev ? updateTrack(prev) : prev)
    setQueue(prev => {
      let changed = false
      const next = prev.map(track => {
        const updated = updateTrack(track)
        if (updated !== track) changed = true
        return updated
      })
      return changed ? next : prev
    })
    if (shuffledQueueRef.current.some(track => track.id === trackId)) {
      shuffledQueueRef.current = shuffledQueueRef.current.map(updateTrack)
    }
    // Matching must also refresh every saved copy (favorites, recent history
    // and tracks already inside user playlists), not just the live queue.
    updateTrackEverywhere(trackId, updateTrack)
  }, [])

  // First-play matching only. Once a track has either matched metadata or a
  // persisted attempt (including a failed/offline one), it is settled until the
  // user explicitly presses the refresh button on the Now Playing screen.
  useEffect(() => {
    if (!settings.autoMatchCover || !currentTrack) return
    // Audio has priority. Do not compete with source loading/playurl requests;
    // only start cover/metadata matching after playback is actually running.
    if (!isPlaying || loadingAudioRef.current || audioRef.current?.paused) return
    if (currentTrack.metadataMatched) return
    if (coverMatchWasAttempted(currentTrack)) return
    let cancelled = false
    const trackId = currentTrack.id
    // Let the audio buffer settle before issuing third-party metadata/cover
    // searches. A pause or track switch cancels this timer with the effect.
    const timer = window.setTimeout(() => {
      void findMatchedCover(currentTrack).then((match) => {
        if (cancelled) return
        if (match) applyMatchedInfo(trackId, match)
        markCoverMatchAttempted(currentTrack)
      }).catch(() => {
        // Deterministic attempt: a provider failure is not retried automatically.
        if (!cancelled) markCoverMatchAttempted(currentTrack)
      })
    }, 800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [currentTrack?.id, settings.autoMatchCover, isPlaying, loadingAudio, applyMatchedInfo])

  const refreshCover = useCallback(async () => {
    if (!currentTrack || matchingCover) return
    // The refresh button is the only path that may re-run matching.
    markCoverMatchAttempted(currentTrack)
    setMatchingCover(true)
    try {
      const match = await findMatchedCover(currentTrack, true)
      if (match) {
        applyMatchedInfo(currentTrack.id, match)
        showToast('已更新歌曲信息和封面')
      } else {
        showToast('未找到匹配的歌曲信息')
      }
    } catch {
      showToast('歌曲信息匹配失败，请稍后再试')
    } finally {
      setMatchingCover(false)
    }
  }, [currentTrack, matchingCover, applyMatchedInfo, showToast])

  const downloadCurrentTrack = useCallback(async () => {
    if (!currentTrack) {
      showToast('没有正在播放的歌曲')
      return
    }
    if (!isAndroidApp()) {
      showToast('下载功能目前仅支持 Android')
      return
    }
    const bvid = String(currentTrack.bvid || currentTrack.id || '').trim()
    if (!bvid) {
      showToast('这首歌曲缺少下载标识')
      return
    }
    try {
      if (await getCachedAudioItem(audioCacheKey(currentTrack))) {
        showToast('已保存在离线歌单')
        return
      }
      const sourceUrl = currentSourceUrlRef.current
      if (!sourceUrl || sourceUrl.startsWith('blob:')) {
        showToast('音频正在加载，请稍后再试')
        return
      }
      showToast('正在下载…')
      await cacheAudioForTrack(currentTrack, sourceUrl)
      showToast('已下载到离线歌单')
    } catch {
      showToast('下载失败，请检查网络')
    }
  }, [currentTrack, showToast])

  // Keep Android's MediaSession / notification in sync with the WebView player.
  useEffect(() => {
    const bridge = (window as any).BiuAndroid
    if (!bridge?.updateMediaSession) return
    if (!currentTrack) {
      bridge.updateMediaSession(JSON.stringify({ hasTrack: false }))
      return
    }
    bridge.updateMediaSession(JSON.stringify({
      hasTrack: true,
      title: currentTrack.title || '未命名歌曲',
      artist: currentTrack.artist || 'biu',
      coverUrl: currentTrack.coverUrl || '',
      isPlaying,
      loading: loadingAudio,
      position: progressRef.current || 0,
      duration: durationRef.current || currentTrack.duration || 0,
    }))
  }, [
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.coverUrl,
    isPlaying,
    loadingAudio,
    duration,
  ])

  useEffect(() => {
    const target = window as any
    const handler = (command: string) => {
      if (command === 'play') {
        if (!isPlaying) togglePlay()
      } else if (command === 'pause') {
        if (isPlaying) togglePlay()
      } else if (command === 'play-pause') {
        togglePlay()
      } else if (command === 'next') {
        next()
      } else if (command === 'prev') {
        prev()
      }
    }
    target.__biuMediaCommand = handler
    return () => {
      if (target.__biuMediaCommand === handler) delete target.__biuMediaCommand
    }
  }, [isPlaying, currentTrack, togglePlay, next, prev])

  const playAll = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return
    startAtBeginningRef.current = true
    const favs = loadFavoriteTracks()
    const favIds = new Set(favs.map(t => t.id))
    const synced = tracks.map(t => ({ ...t, isLiked: favIds.has(t.id) }))
    const index = Math.max(0, Math.min(startIndex, synced.length - 1))
    setQueue(synced)
    shouldAutoplayRef.current = true
    reloadIfCurrentTrack(synced[index])
    setCurrentTrack(synced[index])
    currentIndexRef.current = index
    setProgress(0)
    setIsPlaying(true)
  }, [reloadIfCurrentTrack])

  const playFromQueue = useCallback((index: number) => {
    startAtBeginningRef.current = true
    const displayQueue = isShuffled ? shuffledQueueRef.current : queue
    if (index < 0 || index >= displayQueue.length) return
    currentIndexRef.current = index
    shouldAutoplayRef.current = true
    reloadIfCurrentTrack(displayQueue[index])
    setCurrentTrack(displayQueue[index])
    setProgress(0)
    setIsPlaying(true)
  }, [isShuffled, queue, reloadIfCurrentTrack])

  // 更新 shuffledQueueRef
  useEffect(() => {
    shuffledQueueRef.current = isShuffled ? shuffleArray(queue) : queue
  }, [queue, isShuffled])

  useEffect(() => {
    if (!currentTrack) {
      currentIndexRef.current = -1
      return
    }
    const displayQueue = isShuffled ? shuffledQueueRef.current : queue
    const index = displayQueue.findIndex(track => track.id === currentTrack.id)
    currentIndexRef.current = index >= 0 ? index : 0
  }, [currentTrack?.id, isShuffled, queue])

  // Progress changes ~4 times per second. Serialising the whole queue on every
  // tick was a major source of UI jank and extra GC pressure. Persist only on
  // meaningful state changes, periodically while playing, and when the app is
  // hidden/closed; refs supply the freshest progress without widening deps.
  const persistPlayerState = useCallback(() => {
    try {
      const state: PersistedPlayerState = {
        currentTrack,
        queue,
        progress: progressRef.current,
        duration: durationRef.current,
        volume,
        isMuted,
        repeatMode,
        isShuffled,
        wasPlaying: isPlaying,
        currentIndex: currentIndexRef.current,
      }
      writeStoredItem(PLAYER_STATE_KEY, JSON.stringify(state))
    } catch {
      // ignore persistence failures
    }
  }, [currentTrack, queue, volume, isMuted, repeatMode, isShuffled, isPlaying])

  useEffect(() => {
    nativeReloadRef.current = () => {
      if (!isAndroidApp() || !window.BiuAndroid?.reloadForPlayback) return false
      const key = 'biu_player_reload_at'
      const now = Date.now()
      const last = Number(readStoredItem(key) || 0)
      if (Number.isFinite(last) && now - last < 60_000) return false
      try {
        writeStoredItem(key, String(now))
        persistPlayerState()
        const raw = readStoredItem(PLAYER_STATE_KEY)
        const state = raw ? JSON.parse(raw) : {}
        state.wasPlaying = true
        state.progress = progressRef.current
        state.currentTrack = currentTrack
        state.queue = queue
        writeStoredItem(PLAYER_STATE_KEY, JSON.stringify(state))
      } catch {
        // If state cannot be persisted, do not risk losing the queue on reload.
        return false
      }
      try {
        window.BiuAndroid.reloadForPlayback()
        return true
      } catch {
        try { localStorage.removeItem(key) } catch { /* ignore */ }
        return false
      }
    }
  }, [currentTrack, queue, volume, isMuted, repeatMode, isShuffled, persistPlayerState])

  useEffect(() => {
    const timer = setTimeout(persistPlayerState, 300)
    return () => clearTimeout(timer)
  }, [persistPlayerState])

  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(persistPlayerState, 5000)
    return () => clearInterval(timer)
  }, [isPlaying, persistPlayerState])

  useEffect(() => {
    const onPageHide = () => persistPlayerState()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistPlayerState()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [persistPlayerState])

  useEffect(() => {
    const pushTrayState = () => {
      const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
      // Keep the Android/HarmonyOS status and navigation bars the same color
      // as the current UI instead of the old fixed dark bars.
      window.BiuAndroid?.setSystemTheme?.(theme)
      window.electronAPI?.updateTrayPlayerState?.({
        hasTrack: Boolean(currentTrack),
        title: currentTrack?.title || '未在播放',
        artist: currentTrack?.artist || '搜索并播放音乐',
        coverUrl: currentTrack?.coverUrl || '',
        isPlaying,
        queueLength: queue.length,
        theme,
      })
    }
    pushTrayState()
    // 主题切换时重新推送，使托盘面板跟随浅色/深色
    const observer = new MutationObserver(pushTrayState)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [currentTrack?.artist, currentTrack?.coverUrl, currentTrack?.id, currentTrack?.title, isPlaying, queue.length])

  useEffect(() => {
    return window.electronAPI?.onTrayPlayerCommand?.((command) => {
      if (command === 'toggle-play') togglePlay()
      if (command === 'next') next()
      if (command === 'prev') prev()
    })
  }, [next, prev, togglePlay])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.code !== 'Space' || shouldIgnoreSpaceShortcut(event.target)) return
      event.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    setMediaSessionAction('play', () => {
      if (!isPlaying) togglePlay()
    })
    setMediaSessionAction('pause', () => {
      if (isPlaying) togglePlay()
    })
    setMediaSessionAction('stop', pause)
    setMediaSessionAction('nexttrack', next)
    setMediaSessionAction('previoustrack', prev)
    setMediaSessionAction('seekbackward', (details) => {
      const step = details.seekOffset || 10
      handleSetProgress(Math.max(0, progressRef.current - step))
    })
    setMediaSessionAction('seekforward', (details) => {
      const step = details.seekOffset || 10
      const nextProgress = durationRef.current > 0
        ? Math.min(durationRef.current, progressRef.current + step)
        : progressRef.current + step
      handleSetProgress(nextProgress)
    })
    setMediaSessionAction('seekto', (details) => {
      if (typeof details.seekTime === 'number') handleSetProgress(Math.max(0, details.seekTime))
    })

    return () => clearMediaSessionActions([
      'play',
      'pause',
      'stop',
      'nexttrack',
      'previoustrack',
      'seekbackward',
      'seekforward',
      'seekto',
    ])
  }, [handleSetProgress, isPlaying, next, pause, prev, togglePlay])

  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
      return
    }

    const artwork = currentTrack.coverUrl
      ? [{ src: currentTrack.coverUrl, sizes: '512x512', type: getArtworkType(currentTrack.coverUrl) }]
      : undefined

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || '未命名歌曲',
      artist: currentTrack.artist || 'biu',
      album: 'biu',
      artwork,
    })
  }, [currentTrack?.artist, currentTrack?.coverUrl, currentTrack?.id, currentTrack?.title])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = currentTrack ? (isPlaying ? 'playing' : 'paused') : 'none'
  }, [currentTrack, isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack || duration <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(progress, 0), duration),
      })
    } catch {
      // Invalid transient durations/progress values should not affect playback.
    }
  }, [currentTrack, duration, progress])

  // 稳定的播放器值：进度（高频）不在其中，故进度跳动不会改变此引用，
  // usePlayer() 的消费者（列表行等）不会因每秒 4 次的进度更新而重渲染。
  const value = useMemo<PlayerContext>(() => ({
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    isShuffled,
    queue,
    loadingAudio,
    matchingCover,
    play,
    pause,
    togglePlay,
    next,
    prev,
    setVolume: handleSetVolume,
    setIsMuted,
    setRepeatMode,
    setIsShuffled,
    addToQueue,
    addTracksToQueue,
    removeFromQueue,
    removeMultipleFromQueue,
    moveInQueue,
    playNow,
    playNext,
    clearQueue,
    toggleLike,
    playAll,
    playFromQueue,
    refreshCover,
    downloadCurrentTrack,
    showToast,
  }), [
    currentTrack, isPlaying, volume, isMuted, repeatMode, isShuffled, queue, loadingAudio, matchingCover,
    play, pause, togglePlay, next, prev, handleSetVolume, setIsMuted, setRepeatMode, setIsShuffled,
    addToQueue, addTracksToQueue, removeFromQueue, removeMultipleFromQueue, moveInQueue,
    playNow, playNext, clearQueue, toggleLike, playAll, playFromQueue, refreshCover, downloadCurrentTrack, showToast,
  ])

  // 进度高频更新（timeupdate ~4Hz）独立成 context，仅 PlayerBar/NowPlaying 订阅
  const progressValue = useMemo<PlayerProgress>(() => ({
    progress,
    duration,
    setProgress: handleSetProgress,
  }), [progress, duration, handleSetProgress])

  return (
    <PlayerContext.Provider value={value}>
      <PlayerProgressContext.Provider value={progressValue}>
      {children}
      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 96,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '8px 18px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--glass-bg-heavy)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--shadow-lg)',
            color: 'var(--color-foreground)',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          } as React.CSSProperties}
        >
          {toast}
        </div>
      )}
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  )
}

export function usePlayer(): PlayerContext {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}

export function usePlayerProgress(): PlayerProgress {
  const ctx = useContext(PlayerProgressContext)
  if (!ctx) throw new Error('usePlayerProgress must be used within PlayerProvider')
  return ctx
}
