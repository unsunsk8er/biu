const pending = new Map<string, {
  resolve: (path: string) => void
  reject: (error: Error) => void
  timer: number
}>()
let seq = 0

if (typeof window !== 'undefined') {
  window.__biuAudioFile = (requestId: string, path: string) => {
    const entry = pending.get(requestId)
    if (!entry) return
    pending.delete(requestId)
    window.clearTimeout(entry.timer)
    if (path) entry.resolve(path)
    else entry.reject(new Error('audio cache failed'))
  }
}

/**
 * Ask the native bridge to download an audio URL with the required Referer and
 * return a local file:// URL. Used only after direct CDN and progressive
 * fallbacks fail.
 */
export function cacheHarmonyAudio(url: string, timeoutMs = 60000): Promise<string> {
  const bridge = window.BiuHarmony
  if (!bridge?.cacheAudioFile) return Promise.reject(new Error('native audio cache unavailable'))
  const requestId = `audio-${Date.now()}-${++seq}`
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('audio cache timeout'))
    }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    try {
      bridge.cacheAudioFile(requestId, url)
    } catch (error) {
      pending.delete(requestId)
      window.clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
