/**
 * Minimal HTMLAudioElement-compatible wrapper around the HarmonyOS native
 * AVPlayer bridge. PlayerContext can keep its existing event/state logic while
 * audio decoding and background playback happen natively.
 */

interface NativePayload {
  time?: number
  duration?: number
  message?: string
}

type NativeHandler = (type: string, payloadJson: string) => void

let activeElement: NativeAudioElement | null = null

class NativeAudioElement extends EventTarget {
  preload = 'auto'
  private _src = ''
  private _currentTime = 0
  private _duration = 0
  private _volume = 1
  private _muted = false
  private _paused = true
  private _readyState = 0
  private _error: { code: number; message: string } | null = null
  private requestSeq = 0
  private suppressControlUntil = 0

  constructor() {
    super()
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeElement = this
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __biuNativeAudio?: NativeHandler }).__biuNativeAudio = (type, payloadJson) => {
        if (activeElement !== this) return
        this.handle(type, payloadJson)
      }
    }
  }

  private command(action: string, value = ''): void {
    const bridge = window.BiuHarmony
    if (!bridge?.cacheAudioFile) return
    const id = `native-${Date.now()}-${++this.requestSeq}`
    bridge.cacheAudioFile(id, `native-audio://${action}?value=${encodeURIComponent(value)}`)
  }

  get src(): string { return this._src }
  set src(value: string) {
    const next = String(value || '')
    this._src = next
    this._currentTime = 0
    this._duration = 0
    this._error = null
    this._readyState = next ? 1 : 0
    if (!next) {
      this.command('stop')
      this._paused = true
      return
    }
    this._paused = false
    this.suppressControlUntil = Date.now() + 5000
    this.command('play', next)
  }

  get currentSrc(): string { return this._src }
  get currentTime(): number { return this._currentTime }
  set currentTime(value: number) {
    const next = Math.max(0, Number(value) || 0)
    this._currentTime = next
    this.command('seek', String(next))
  }
  get duration(): number { return this._duration }
  get paused(): boolean { return this._paused }
  get readyState(): number { return this._readyState }
  get error(): { code: number; message: string } | null { return this._error }
  get volume(): number { return this._volume }
  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, Number(value) || 0))
    this.command('volume', String(this._muted ? 0 : this._volume))
  }
  get muted(): boolean { return this._muted }
  set muted(value: boolean) {
    this._muted = Boolean(value)
    this.command('volume', String(this._muted ? 0 : this._volume))
  }
  playbackRate = 1

  play(): Promise<void> {
    this._paused = false
    this.command('resume')
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  }

  pause(): void {
    if (Date.now() < this.suppressControlUntil) return
    this._paused = true
    this.command('pause')
    this.dispatchEvent(new Event('pause'))
  }

  load(): void {
    // Native playback starts from the src setter; nothing to preload here.
  }

  removeAttribute(name: string): void {
    if (name.toLowerCase() !== 'src') return
    if (Date.now() < this.suppressControlUntil) return
    this._src = ''
    this._currentTime = 0
    this._duration = 0
    this._readyState = 0
    this.command('stop')
    this._paused = true
  }

  private handle(type: string, payloadJson: string): void {
    let payload: NativePayload = {}
    try {
      payload = JSON.parse(payloadJson || '{}') as NativePayload
    } catch {
      // Ignore malformed native events.
    }
    if (type === 'time') {
      this._currentTime = Number(payload.time) || 0
      if (payload.duration && payload.duration > 0) this._duration = payload.duration
      this.dispatchEvent(new Event('timeupdate'))
    } else if (type === 'duration') {
      this._duration = Number(payload.duration) || 0
      this._readyState = 2
      this.dispatchEvent(new Event('loadedmetadata'))
      this.dispatchEvent(new Event('durationchange'))
    } else if (type === 'playing') {
      this._paused = false
      this._readyState = 2
      this.dispatchEvent(new Event('play'))
    } else if (type === 'paused' || type === 'stopped') {
      this._paused = true
      this.dispatchEvent(new Event('pause'))
    } else if (type === 'ended') {
      this._paused = true
      this._currentTime = this._duration
      this.dispatchEvent(new Event('ended'))
    } else if (type === 'error') {
      this._error = { code: 4, message: String(payload.message || 'native playback error') }
      this._paused = true
      this._readyState = 0
      this.dispatchEvent(new Event('error'))
    }
  }
}

export function createNativeAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || !window.BiuHarmony?.cacheAudioFile) return null
  return new NativeAudioElement() as unknown as HTMLAudioElement
}
