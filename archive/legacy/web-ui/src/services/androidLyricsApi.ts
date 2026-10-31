/**
 * Android WebView lyrics transport.
 *
 * OIAPI is cross-origin, so requests are intercepted by BiliProxy which
 * supplies CORS headers and a desktop referer. The renderer still owns
 * title cleanup, candidate scoring, LRC parsing and caching.
 */
const OIAPI_QQ_LYRIC = 'https://www.oiapi.net/api/QQMusicLyric'
const REQUEST_TIMEOUT = 9000

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json,text/plain,*/*' },
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

export const androidLyricsApi = {
  async search(keyword: string, page = 1, limit = 10): Promise<any[]> {
    const q = String(keyword || '').trim()
    if (!q) return []
    const url = new URL(OIAPI_QQ_LYRIC)
    url.searchParams.set('keyword', q)
    url.searchParams.set('page', String(page))
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('type', 'json')
    const json = await fetchJson(url.toString())
    return Array.isArray(json?.data) ? json.data : []
  },

  async get(id: string | number, format = 'lrc'): Promise<any | null> {
    const songId = String(id || '').trim()
    if (!songId) return null
    const url = new URL(OIAPI_QQ_LYRIC)
    url.searchParams.set('id', songId)
    url.searchParams.set('format', format)
    url.searchParams.set('type', 'json')
    const json = await fetchJson(url.toString())
    if (!json || json.code !== 1) return null
    if (typeof json.data === 'string') return { content: json.data }
    if (json.data && typeof json.data === 'object') return json.data
    if (typeof json.message === 'string' && json.message.includes('[')) return { content: json.message }
    return null
  },
}
