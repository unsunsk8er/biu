/**
 * Renderer-side cover search for Android WebView.
 * Requests are proxied/CORS-enabled by BiliProxy; scoring matches the desktop
 * coverApi implementation so both platforms produce the same metadata.
 */
import type { CoverCandidate, CoverProvider } from '@/types/electron'
import { canonicalArtistName, scoreCoverCandidate } from '@/utils/coverMatchQuery'

interface CoverQuery {
  title: string
  artist: string
}

const REQUEST_TIMEOUT = 3000
const SEARCH_DEADLINE = 3200

function normalizeCover(url: string): string {
  let cover = String(url || '').trim().replace(/^http:/, 'https:')
  if (cover.includes('music.126.net') && !cover.includes('?')) cover += '?param=1000y1000'
  return cover
}

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json,text/plain,*/*' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timer)
  }
}

async function neteaseSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const text = `${query.title} ${query.artist}`.trim()
  const searchUrl = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(text)}&type=1&offset=0&total=true&limit=20`
  const data = await fetchJson(searchUrl)
  const songs: any[] = data?.result?.songs || []
  const all = songs
    .map((song, relevance) => {
      const title = String(song?.name || '')
      const artist = canonicalArtistName((song?.artists || song?.ar || []).map((item: any) => String(item?.name || '')).filter(Boolean).join(' / '))
      const album = String(song?.album?.name || song?.al?.name || '')
      return {
        id: song?.id,
        title,
        artist,
        album,
        relevance,
        score: scoreCoverCandidate(query, title, artist),
        directCover: song?.album?.picUrl || song?.al?.picUrl || '',
      }
    })
    .filter((song) => song.id)
  const topRelevant = all[0]
  const limit = query.artist ? 4 : 10
  const ranked = all
    .filter((song) => song.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  if (topRelevant && !ranked.some((song) => song.id === topRelevant.id)) ranked.push(topRelevant)

  const details = await Promise.all(ranked.map(async (song): Promise<CoverCandidate | null> => {
    try {
      let cover = normalizeCover(song.directCover)
      if (!cover) {
        const detail = await fetchJson(`https://music.163.com/api/song/detail?ids=%5B${song.id}%5D`)
        const item = detail?.songs?.[0]
        cover = normalizeCover(item?.al?.picUrl || item?.album?.picUrl || '')
      }
      if (!cover) return null
      return {
        provider: 'netease' as CoverProvider,
        title: song.title,
        artist: canonicalArtistName(song.artist),
        album: song.album,
        coverUrl: cover,
        score: song.score,
        relevance: song.relevance,
      }
    } catch {
      return null
    }
  }))
  return details.filter((item): item is CoverCandidate => Boolean(item))
}

async function qqSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const text = `${query.title} ${query.artist}`.trim()
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=20&new_json=1&w=${encodeURIComponent(text)}`
  const data = await fetchJson(url)
  const songs: any[] = data?.data?.song?.list || []
  const all = songs
    .map((song, relevance) => {
      const title = String(song?.title || song?.name || '')
      const artist = canonicalArtistName((song?.singer || []).map((item: any) => item?.name).filter(Boolean).join(' / '))
      const album = String(song?.album?.name || '')
      const mid = String(song?.album?.mid || '')
      const coverUrl = mid ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${mid}.jpg` : ''
      return {
        provider: 'qq' as CoverProvider,
        title,
        artist,
        album,
        coverUrl,
        score: scoreCoverCandidate(query, title, artist),
        relevance,
      }
    })
    .filter((song) => song.coverUrl)
  const topRelevant = all[0]
  const limit = query.artist ? 4 : 10
  const ranked = all
    .filter((song) => song.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  if (topRelevant && !ranked.some((song) => song.coverUrl === topRelevant.coverUrl)) ranked.push(topRelevant)
  return ranked
}

async function kugouSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const text = `${query.title} ${query.artist}`.trim()
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(text)}&page=1&pagesize=20&platform=WebFilter`
  const data = await fetchJson(url)
  const songs: any[] = data?.data?.lists || []
  const all = songs
    .map((song, relevance) => {
      const title = String(song?.SongName || song?.OriSongName || '')
      const rawArtist = String(song?.SingerName || (song?.Singers || []).map((item: any) => item?.name).filter(Boolean).join(' / '))
      const artist = canonicalArtistName(rawArtist)
      const album = String(song?.AlbumName || '')
      const rawCover = String(song?.Image || song?.trans_param?.union_cover || '')
      const coverUrl = rawCover
        .replace(/^http:/, 'https:')
        .replace(/\{size\}/g, '1000')
      return {
        provider: 'kugou' as CoverProvider,
        title,
        artist,
        album,
        coverUrl,
        score: scoreCoverCandidate(query, title, artist),
        relevance,
      }
    })
    .filter((song) => song.coverUrl)
  const topRelevant = all[0]
  const limit = query.artist ? 4 : 10
  const ranked = all
    .filter((song) => song.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  if (topRelevant && !ranked.some((song) => song.coverUrl === topRelevant.coverUrl)) ranked.push(topRelevant)
  return ranked
}

function itunesStores(title: string, artist: string): Array<{ country: string; lang: string }> {
  const text = `${title} ${artist}`
  // Query the storefront that actually carries the script; a US-only or CN-only
  // lookup misses most Japanese, Korean and non-Chinese international releases.
  if (/[\uac00-\ud7af]/.test(text)) return [{ country: 'KR', lang: 'ko_kr' }, { country: 'US', lang: 'en_us' }]
  if (/[\u3040-\u30ff]/.test(text)) return [{ country: 'JP', lang: 'ja_jp' }, { country: 'US', lang: 'en_us' }]
  if (/[\u3400-\u9fff]/.test(text)) return [{ country: 'TW', lang: 'zh_tw' }, { country: 'US', lang: 'en_us' }]
  return [{ country: 'US', lang: 'en_us' }]
}

async function itunesSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const term = `${query.title} ${query.artist}`.trim()
  const stores = itunesStores(query.title, query.artist)
  const pages = await Promise.allSettled(stores.map(async ({ country, lang }) => {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=10&country=${country}&lang=${lang}`
    const data = await fetchJson(url)
    return (data?.results || []) as any[]
  }))
  const songs = pages.flatMap((page) => page.status === 'fulfilled' ? page.value : [])
  const seen = new Set<string>()
  const all = songs
    .map((song, relevance) => {
      const title = String(song?.trackName || '')
      const artist = canonicalArtistName(String(song?.artistName || ''))
      const album = String(song?.collectionName || '')
      const coverUrl = String(song?.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/1000x1000bb.')
      return {
        provider: 'itunes' as CoverProvider,
        title,
        artist,
        album,
        coverUrl,
        score: scoreCoverCandidate(query, title, artist),
        relevance,
      }
    })
    .filter((song) => {
      if (!song.coverUrl || seen.has(song.coverUrl)) return false
      seen.add(song.coverUrl)
      return true
    })
  const topRelevant = all[0]
  const limit = query.artist ? 4 : 8
  const ranked = all
    .filter((song) => song.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  if (topRelevant && !ranked.some((song) => song.coverUrl === topRelevant.coverUrl)) ranked.push(topRelevant)
  return ranked
}

function rankCandidates(candidates: CoverCandidate[], limit = 6): CoverCandidate[] {
  const seen = new Set<string>()
  return candidates
    .filter((candidate) => {
      if (!candidate.coverUrl || seen.has(candidate.coverUrl)) return false
      seen.add(candidate.coverUrl)
      return true
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function searchAndroidCovers(rawQuery: CoverQuery): Promise<CoverCandidate[]> {
  const title = String(rawQuery?.title || '').trim().slice(0, 120)
  const artist = String(rawQuery?.artist || '').trim().slice(0, 80)
  if (!title) return []
  const query = { title, artist }
  const titleOnly = !artist

  // All three catalogues run in parallel. Return as soon as one provider has a
  // high-confidence match instead of waiting for the slowest provider; the
  // hard deadline also keeps a stalled request from blocking playback UI.
  return new Promise<CoverCandidate[]>((resolve) => {
    const candidates: CoverCandidate[] = []
    let settled = 0
    let finished = false
    const tasks = [neteaseSearch(query), qqSearch(query), kugouSearch(query), itunesSearch(query)]

    const finish = () => {
      if (finished) return
      finished = true
      window.clearTimeout(deadline)
      resolve(rankCandidates(candidates, titleOnly ? 40 : 6))
    }
    const deadline = window.setTimeout(finish, SEARCH_DEADLINE)

    tasks.forEach((task) => {
      task.then((items) => {
        candidates.push(...items)
        settled += 1
        if (settled === tasks.length) {
          finish()
        }
      }).catch(() => {
        settled += 1
        if (settled === tasks.length) finish()
      })
    })
  })
}
