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

function cacheOne(url: string, timeoutMs: number): Promise<string> {
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

/**
 * Ask the native bridge to download an audio URL with the required Referer and
 * return a local file:// URL. CDN hosts are not interchangeable: a host that
 * times out for native HTTP while another backup host is reachable is common,
 * so try every candidate URL before falling back to the WebView stream.
 */
export async function cacheHarmonyAudio(
  urlOrUrls: string | string[],
  timeoutMs = 20_000,
): Promise<string> {
  const urls = (Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls])
    .map(url => String(url || '').trim())
    .filter(Boolean)
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 6)
  const bridge = window.BiuHarmony
  if (!bridge?.cacheAudioFile) throw new Error('native audio cache unavailable')
  let lastError: unknown = new Error('no audio cache candidate')
  for (const url of urls) {
    try {
      return await cacheOne(url, timeoutMs)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
