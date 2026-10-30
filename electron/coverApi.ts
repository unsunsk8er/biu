import { ipcMain, net } from 'electron'
import { assertTrustedSender } from './security'

// 第三方歌曲元数据只用于补齐封面，不下载音频，也不影响 B 站播放链路。
// 优先中文曲库（网易云、QQ 音乐），iTunes 作为欧美曲目兜底。

interface CoverQuery {
  title: string
  artist: string
}

export interface CoverCandidate {
  provider: 'netease' | 'qq' | 'itunes' | 'kugou'
  title: string
  artist: string
  album: string
  coverUrl: string
  score: number
  /** 曲库原始排序位次；仅用于“只有标题命中”时的兜底排序。 */
  relevance?: number
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
const REQUEST_TIMEOUT = 5500

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u005B\]【】()（）《》「」“”"'’·•,，.。!！?？:：;；\-_/\\|]/g, ' ')
    .replace(/\b(4k|8k|1080p|720p|hdr|hi-?res|mv|official|video|audio|live|cover|remix|lyrics?|visualizer)\b/g, ' ')
    .replace(/(完整版|高音质|无损|纯享|现场版|现场|动态歌词|歌词版|中文字幕|中字|超清|高清|重制版|伴奏|翻唱)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(value: string): Set<string> {
  const set = new Set<string>()
  for (let i = 0; i < value.length - 1; i++) set.add(value.slice(i, i + 2))
  return set
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.92
  const sa = bigrams(a)
  const sb = bigrams(b)
  if (!sa.size || !sb.size) return 0
  let overlap = 0
  for (const token of sa) if (sb.has(token)) overlap += 1
  return (2 * overlap) / (sa.size + sb.size)
}

function scoreCandidate(query: CoverQuery, title: string, artist: string): number {
  const titleScore = similarity(normalize(query.title), normalize(title))
  const artistScore = similarity(normalize(query.artist), normalize(artist))
  return Math.round((titleScore * 0.72 + artistScore * 0.28) * 1000) / 1000
}

function normalizeCover(url: string): string {
  let cover = String(url || '').trim().replace(/^http:/, 'https:')
  if (cover.includes('music.126.net') && !cover.includes('?')) cover += '?param=600y600'
  return cover
}

async function fetchJson(url: string, referer: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await net.fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
        Referer: referer,
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function neteaseSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const text = `${query.title} ${query.artist}`.trim()
  const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(text)}&type=1&offset=0&total=true&limit=8`
  const data = await fetchJson(searchUrl, 'https://music.163.com/')
  const songs: any[] = data?.result?.songs || []
  const all = songs
    .map((song, relevance) => {
      const title = String(song?.name || '')
      const artist = (song?.artists || song?.ar || []).map((item: any) => String(item?.name || '')).filter(Boolean).join(' / ')
      const album = String(song?.album?.name || song?.al?.name || '')
      return {
        id: song?.id,
        title,
        artist,
        album,
        relevance,
        score: scoreCandidate(query, title, artist),
        directCover: song?.album?.picUrl || song?.al?.picUrl || '',
      }
    })
    .filter((song) => song.id)
  const ranked = all.slice(0, 8)

  const details = await Promise.all<CoverCandidate | null>(ranked.map(async (song): Promise<CoverCandidate | null> => {
    try {
      let cover = normalizeCover(song.directCover)
      if (!cover) {
        const detail = await fetchJson(`https://music.163.com/api/song/detail?ids=%5B${song.id}%5D`, 'https://music.163.com/')
        const item = detail?.songs?.[0]
        cover = normalizeCover(item?.al?.picUrl || item?.album?.picUrl || '')
      }
      if (!cover) return null
      const candidate: CoverCandidate = {
        provider: 'netease',
        title: song.title,
        artist: String(song.artist || ''),
        album: song.album,
        coverUrl: cover,
        score: song.score,
        relevance: song.relevance,
      }
      return candidate
    } catch {
      return null
    }
  }))
  return details.filter((item): item is CoverCandidate => Boolean(item))
}

async function qqSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const text = `${query.title} ${query.artist}`.trim()
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=10&new_json=1&w=${encodeURIComponent(text)}`
  const data = await fetchJson(url, 'https://y.qq.com/')
  const songs: any[] = data?.data?.song?.list || []
  return songs
    .map((song, relevance) => {
      const title = String(song?.title || song?.name || '')
      const artist = (song?.singer || []).map((item: any) => item?.name).filter(Boolean).join(' / ')
      const album = String(song?.album?.name || '')
      const mid = String(song?.album?.mid || '')
      const coverUrl = mid ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${mid}.jpg` : ''
      return {
        provider: 'qq' as const,
        title,
        artist,
        album,
        coverUrl,
        score: scoreCandidate(query, title, artist),
        relevance,
      }
    })
    .filter((song) => song.coverUrl)
    .slice(0, 8)
}

async function kugouSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const text = `${query.title} ${query.artist}`.trim()
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(text)}&page=1&pagesize=20&platform=WebFilter`
  const data = await fetchJson(url, 'https://www.kugou.com/')
  const songs: any[] = data?.data?.lists || []
  return songs
    .map((song, relevance) => {
      const title = String(song?.SongName || song?.OriSongName || '')
      const artist = String(song?.SingerName || (song?.Singers || []).map((item: any) => item?.name).filter(Boolean).join(' / '))
      const album = String(song?.AlbumName || '')
      const rawCover = String(song?.Image || song?.trans_param?.union_cover || '')
      const coverUrl = rawCover
        .replace(/^http:/, 'https:')
        .replace(/\{size\}/g, '1000')
      return {
        provider: 'kugou' as const,
        title,
        artist,
        album,
        coverUrl,
        score: scoreCandidate(query, title, artist),
        relevance,
      }
    })
    .filter((song) => song.coverUrl)
    .slice(0, 8)
}

function itunesStores(title: string, artist: string): Array<{ country: string; lang: string }> {
  const text = `${title} ${artist}`
  if (/[\uac00-\ud7af]/.test(text)) return [{ country: 'KR', lang: 'ko_kr' }, { country: 'US', lang: 'en_us' }]
  if (/[\u3040-\u30ff]/.test(text)) return [{ country: 'JP', lang: 'ja_jp' }, { country: 'US', lang: 'en_us' }]
  if (/[\u3400-\u9fff]/.test(text)) return [{ country: 'TW', lang: 'zh_tw' }, { country: 'US', lang: 'en_us' }]
  return [{ country: 'US', lang: 'en_us' }]
}

async function itunesSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const term = `${query.title} ${query.artist}`.trim()
  const pages = await Promise.allSettled(itunesStores(query.title, query.artist).map(async ({ country, lang }) => {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=${country}&lang=${lang}`
    const data = await fetchJson(url, 'https://www.apple.com/')
    return (data?.results || []) as any[]
  }))
  const songs = pages.flatMap((page) => page.status === 'fulfilled' ? page.value : [])
  const seen = new Set<string>()
  return songs
    .map((song, relevance) => {
      const title = String(song?.trackName || '')
      const artist = String(song?.artistName || '')
      const album = String(song?.collectionName || '')
      const coverUrl = String(song?.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.')
      return {
        provider: 'itunes' as const,
        title,
        artist,
        album,
        coverUrl,
        score: scoreCandidate(query, title, artist),
        relevance,
      }
    })
    .filter((song) => {
      if (!song.coverUrl || seen.has(song.coverUrl)) return false
      seen.add(song.coverUrl)
      return true
    })
    .slice(0, 8)
}

async function searchCovers(rawQuery: CoverQuery): Promise<CoverCandidate[]> {
  const title = String(rawQuery?.title || '').trim().slice(0, 120)
  const artist = String(rawQuery?.artist || '').trim().slice(0, 80)
  if (!title) return []
  const query = { title, artist }
  const results = await Promise.allSettled([
    neteaseSearch(query),
    qqSearch(query),
    kugouSearch(query),
    itunesSearch(query),
  ])
  const candidates = results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  const seen = new Set<string>()
  return candidates
    .filter((candidate) => {
      if (!candidate.coverUrl || seen.has(candidate.coverUrl)) return false
      seen.add(candidate.coverUrl)
      return true
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
}

export function registerCoverApiHandlers(): void {
  ipcMain.handle('cover:search', (event, query: CoverQuery) => {
    assertTrustedSender(event)
    return searchCovers(query)
  })
}
