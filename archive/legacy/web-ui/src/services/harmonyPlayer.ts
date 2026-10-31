/**
 * HarmonyOS native playback state machine.
 *
 * This bypasses HTMLAudioElement/loadSource entirely: the renderer sends
 * commands through the existing BiuHarmony bridge and receives native AVPlayer
 * events. Backgrounding must not cause the renderer to pause the player.
 */

export type HarmonyPlayerEvent =
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'time'; time: number; duration: number }
  | { type: 'duration'; duration: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }

type EventHandler = (event: HarmonyPlayerEvent) => void

let handler: EventHandler | null = null
let seq = 0

function installListener(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __biuNativeAudio?: (type: string, payload: string) => void }).__biuNativeAudio =
    (type: string, payload: string) => {
      if (!handler) return
      try {
        const data = JSON.parse(payload || '{}') as { time?: number; duration?: number; message?: string }
        if (type === 'playing') handler({ type: 'playing' })
        else if (type === 'paused' || type === 'stopped') handler({ type: 'paused' })
        else if (type === 'time') {
          handler({ type: 'time', time: Number(data.time) || 0, duration: Number(data.duration) || 0 })
        } else if (type === 'duration') {
          handler({ type: 'duration', duration: Number(data.duration) || 0 })
        } else if (type === 'ended') handler({ type: 'ended' })
        else if (type === 'error') handler({ type: 'error', message: String(data.message || 'native error') })
      } catch {
        // Ignore malformed native events.
      }
    }
}

function command(action: string, value = ''): void {
  const bridge = window.BiuHarmony
  if (!bridge?.cacheAudioFile) return
  bridge.cacheAudioFile(
    `harmony-player-${Date.now()}-${++seq}`,
    `native-audio://${action}?value=${encodeURIComponent(value)}`,
  )
}

export function setHarmonyPlayerHandler(next: EventHandler | null): void {
  installListener()
  handler = next
}

export function harmonyPlayerAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.BiuHarmony?.cacheAudioFile)
}

export function harmonyPlay(source: string, startAt = 0): void {
  installListener()
  command('play', source)
  if (startAt > 0.5) {
    window.setTimeout(() => command('seek', String(startAt)), 900)
  }
}

export function harmonyPause(): void {
  command('pause')
}

export function harmonyResume(): void {
  command('resume')
}

export function harmonySeek(positionSec: number): void {
  command('seek', String(Math.max(0, positionSec)))
}

export function harmonySetVolume(volume: number): void {
  command('volume', String(Math.max(0, Math.min(1, volume))))
}

export function harmonyStop(): void {
  command('stop')
}
