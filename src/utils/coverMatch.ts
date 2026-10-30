import type { CoverCandidate, CoverProvider } from '@/types/electron'
import type { Track } from '@/types'
import { isAndroidApp, isHarmonyApp } from '@/utils/mobile'
import { searchAndroidCovers } from '@/services/androidCoverSearch'
import { artistSimilarity, inferCoverQueries, normalizeCoverText, scoreCoverCandidate, type CoverQuery } from '@/utils/coverMatchQuery'

// 封面匹配：只改当前播放曲目的封面，不触碰 B 站视频原始数据。
// 结果按“歌名 + 歌手”缓存在 localStorage，同一首歌不会重复请求。

const CACHE_KEY = 'biu_cover_cache_v6'
const POSITIVE_TTL = 30 * 24 * 60 * 60 * 1000
const MIN_SCORE = 0.55
const MAX_ENTRIES = 300

interface CacheEntry {
  coverUrl: string
  provider: CoverProvider | ''
  score: number
  cachedAt: number
  title?: string
  artist?: string
  album?: string
}

export interface MatchedCover {
  coverUrl: string
  provider: CoverProvider | ''
  score: number
  title: string
  artist: string
  album: string
}

const pending = new Map<string, Promise<MatchedCover | null>>()

// One persisted attempt per track. A failed/offline attempt still counts as
// "determined"; only the explicit refresh button may retry it. This is kept
// separately from the positive cover cache so a no-match result is not retried
// automatically on every playback or app restart.
const ATTEMPT_KEY = 'biu_cover_match_attempted_v1'
const MAX_ATTEMPTS = 2000

function attemptKey(track: Pick<Track, 'id' | 'title' | 'artist'>): string {
  const id = String(track.id || '').trim()
  if (id) return id
  return `${normalizeCoverText(track.title)}|${normalizeCoverText(track.artist)}`
}

function readAttempts(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function coverMatchWasAttempted(track: Pick<Track, 'id' | 'title' | 'artist'>): boolean {
  const key = attemptKey(track)
  return Boolean(key && readAttempts()[key])
}

export function markCoverMatchAttempted(track: Pick<Track, 'id' | 'title' | 'artist'>): void {
  const key = attemptKey(track)
  if (!key) return
  try {
    const attempts = readAttempts()
    attempts[key] = Date.now()
    const trimmed = Object.entries(attempts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ATTEMPTS)
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(Object.fromEntries(trimmed)))
  } catch {
    // Attempt tracking must never block playback.
  }
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, MAX_ENTRIES)
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // 封面缓存失败不能影响播放
  }
}

function cacheKey(title: string, artist: string): string {
  return `${title.toLowerCase()}|${artist.toLowerCase()}`
}

const PROVIDER_PRIORITY: Record<string, number> = { qq: 0, kugou: 1, netease: 2, itunes: 3 }
interface ScoredMatch extends MatchedCover { relevance: number; agreement: number; rankScore: number }

function artistAppearsInTrack(candidateArtist: string, rawTitle: string, rawArtist: string): boolean {
  const artist = normalizeCoverText(candidateArtist)
  if (!artist) return false
  const evidence = normalizeCoverText(`${rawTitle} ${rawArtist}`)
  if (!evidence) return false
  if (/^[a-z0-9 ]+$/.test(artist)) {
    const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(evidence)) return true
  } else if (evidence.includes(artist)) {
    return true
  }
  return artistSimilarity(candidateArtist, rawArtist) >= 0.5
}

function pickCandidate(
  candidates: CoverCandidate[],
  query: CoverQuery,
  rawTitle: string,
  rawArtist: string,
): MatchedCover | null {
  const scored: ScoredMatch[] = []
  for (const candidate of candidates || []) {
    if (!candidate?.coverUrl) continue
    // Providers and desktop IPC may have been built with older scoring rules.
    // Rescore every candidate with the shared language-aware matcher so both
    // Android and desktop make the same decision.
    const score = scoreCoverCandidate(query, candidate.title, candidate.artist)
    if (!Number.isFinite(score) || score < MIN_SCORE) continue
    scored.push({
      coverUrl: candidate.coverUrl,
      provider: candidate.provider,
      score,
      title: String(candidate.title || '').trim(),
      artist: String(candidate.artist || '').trim(),
      album: String(candidate.album || '').trim(),
      relevance: Number.isFinite(candidate.relevance) ? Number(candidate.relevance) : 999,
      agreement: 1,
      rankScore: score,
    })
  }
  if (!scored.length) return null
  // Candidates confirmed by two or more independent catalogues are much less
  // likely to be a same-name cover or a bad translation. Agreement is a ranking
  // boost only; the displayed/stored score remains the language-aware score.
  const groups = new Map<string, Set<string>>()
  for (const item of scored) {
    const key = `${normalizeCoverText(item.artist)}|${normalizeCoverText(item.title)}`
    const providers = groups.get(key) || new Set<string>()
    if (item.provider) providers.add(item.provider)
    groups.set(key, providers)
  }
  for (const item of scored) {
    const key = `${normalizeCoverText(item.artist)}|${normalizeCoverText(item.title)}`
    item.agreement = Math.max(1, groups.get(key)?.size || 1)
    item.rankScore = item.score
      + (item.agreement >= 2 ? 0.06 : 0)
      + (item.agreement >= 3 ? 0.02 : 0)
  }
  scored.sort((a, b) =>
    b.rankScore - a.rankScore
    || b.score - a.score
    || (PROVIDER_PRIORITY[a.provider] ?? 9) - (PROVIDER_PRIORITY[b.provider] ?? 9),
  )

  if (query.artist) return scored[0]

  // Title-only is the final fallback. Prefer a candidate whose artist is
  // actually present in the Bilibili title/channel, then fall back to provider
  // relevance. A low-confidence title-only guess is rejected rather than
  // attaching a random cover to a common song name.
  const evidence = scored.filter((item) => artistAppearsInTrack(item.artist, rawTitle, rawArtist))
  if (evidence.length) return evidence[0].score >= 0.8 ? evidence[0] : null
  // A cross-catalogue agreement is stronger than any one provider's ordering.
  const consensus = scored
    .filter((item) => item.score >= 0.8 && item.agreement >= 2)
    .sort((a, b) => b.agreement - a.agreement || b.rankScore - a.rankScore)
  if (consensus.length) return consensus[0]
  // Without artist evidence, provider relevance is a better signal than our
  // title score alone (a popular original and a random cover both score 1.0).
  // QQ relevance is strongest for an unknown artist, but only trust it when
  // the title evidence is already strong; otherwise use the best-scored
  // candidate so a mediocre QQ hit cannot beat an exact iTunes/NetEase match.
  const qqTop = scored
    .filter((item) => item.provider === 'qq' && item.score >= 0.9)
    .sort((a, b) => a.relevance - b.relevance)[0]
  if (qqTop) return qqTop
  const providerRanked = scored
    .filter((item) => item.score >= 0.8)
    .sort((a, b) =>
      (PROVIDER_PRIORITY[a.provider] ?? 9) - (PROVIDER_PRIORITY[b.provider] ?? 9)
      || a.relevance - b.relevance,
    )
  return providerRanked[0] || null
}

export async function findMatchedCover(track: Track, force = false): Promise<MatchedCover | null> {
  const variants = inferCoverQueries(track.title, track.artist)
  const primary = variants[0] || {
    title: String(track.title || '').trim(),
    artist: '',
  }
  if (!primary.title) return null
  const { title, artist } = primary

  const key = cacheKey(normalizeCoverText(title), normalizeCoverText(artist))
  const cache = readCache()
  const hit = cache[key]
  if (!force && hit?.coverUrl && Date.now() - hit.cachedAt < POSITIVE_TTL) {
    return {
      coverUrl: hit.coverUrl,
      provider: hit.provider,
      score: hit.score,
      title: hit.title || '',
      artist: hit.artist || '',
      album: hit.album || '',
    }
  }

  if (pending.has(key)) return pending.get(key)!

  const task = (async (): Promise<MatchedCover | null> => {
    const api = window.electronAPI
    try {
      const search = (query: { title: string; artist: string }) =>
        api?.searchCovers
          ? api.searchCovers(query)
          : isAndroidApp() || isHarmonyApp()
            ? searchAndroidCovers(query)
            : Promise.resolve(null)

      // Try the trusted artist/title variant first, then multilingual title
      // splits. Keep a low-confidence artist-specific match while looking for a
      // better split, but never let a title-only guess replace an actual artist
      // match. Title-only is used only when every artist-aware variant failed.
      let artistMatch: MatchedCover | null = null
      let titleOnlyMatch: MatchedCover | null = null
      for (const variant of variants) {
        // Title-only is never allowed to override an artist-aware match, so do
        // not spend a slow provider round on it after one already succeeded.
        if (!variant.artist && artistMatch) continue
        const candidates = await search(variant)
        const found = pickCandidate(candidates || [], variant, track.title, track.artist)
        if (!found) continue
        if (variant.artist) {
          if (!artistMatch || found.score > artistMatch.score) artistMatch = found
          if (found.score >= 0.92) break
        } else if (!artistMatch && (!titleOnlyMatch || found.score > titleOnlyMatch.score)) {
          titleOnlyMatch = found
        }
      }

      const match = artistMatch || titleOnlyMatch
      if (!match) return null

      // Never persist a negative result: a temporary provider/DNS failure must
      // not hide a valid cover for the next 12 hours. Positive cache remains.
      const next = readCache()
      next[key] = {
        coverUrl: match.coverUrl,
        provider: match.provider,
        score: match.score,
        title: match.title,
        artist: match.artist,
        album: match.album,
        cachedAt: Date.now(),
      }
      writeCache(next)
      return match
    } catch {
      // 网络/第三方曲库错误：不写负缓存，下次仍可重试
      return null
    } finally {
      pending.delete(key)
    }
  })()

  pending.set(key, task)
  return task
}

export function clearCoverCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
