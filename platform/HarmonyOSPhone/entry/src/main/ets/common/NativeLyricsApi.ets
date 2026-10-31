import { http } from '@kit.NetworkKit'

export interface LyricLine {
  time: number
  text: string
}

export interface LyricResult {
  lines: LyricLine[]
  synced: boolean
  trackName: string
  artistName: string
}

interface OiSong {
  id?: string | number
  name?: string
  singer?: string[]
  album?: string
  duration?: number
  mid?: string
  image?: string
}

interface OiSearchResponse {
  data?: OiSong[]
}

interface OiLyricResponse {
  code?: number
  data?: string | OiLyricData
  message?: string
}

interface OiLyricData {
  content?: string
  conteng?: string
}

const OIAPI = 'https://www.oiapi.net/api/QQMusicLyric'
const UA = 'Mozilla/5.0 (Linux; Android 15; BiuHarmony 2.0.0) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

export class NativeLyricsApi {
  private async getJson(url: string): Promise<string> {
    const request = http.createHttp()
    try {
      const response = await request.request(url, {
        method: http.RequestMethod.GET,
        header: {
          'User-Agent': UA,
          'Accept': 'application/json,text/plain,*/*',
        },
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 8000,
        readTimeout: 10000,
      })
      if (response.responseCode !== 200) throw new Error(`lyrics HTTP ${response.responseCode}`)
      return String(response.result || '')
    } finally {
      request.destroy()
    }
  }

  private cleanTitle(raw: string): string {
    const quoted = raw.match(/《([^》]{1,60})》/)
    let text = quoted ? quoted[1] : raw
    text = text
      .replace(/[【\[（(][^】\]）)]{0,80}[】\]）)]/g, ' ')
      .replace(/\b(official|lyrics?|audio|video|mv|hd|4k|8k|live|cover|remix|hi-?res)\b/gi, ' ')
      .replace(/[|｜/\\]+/g, ' ')
      .replace(/\s*[-—–]\s*周杰伦.*$/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text || raw.trim().slice(0, 40)
  }

  private cleanArtist(raw: string): string {
    return raw
      .replace(/[【\[（(][^】\]）)]{0,60}[】\]）)]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private norm(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
  }

  private score(song: OiSong, title: string, artist: string, duration: number): number {
    const songTitle = this.norm(String(song.name || ''))
    const wantTitle = this.norm(title)
    const songArtist = this.norm(String((song.singer || []).join(' ')))
    const wantArtist = this.norm(artist)
    let score = 0
    if (songTitle === wantTitle) score += 300
    else if (songTitle.includes(wantTitle) || wantTitle.includes(songTitle)) score += 200
    if (wantArtist && songArtist && (songArtist.includes(wantArtist) || wantArtist.includes(songArtist))) score += 220
    const songDuration = Number(song.duration || 0)
    if (duration > 0 && songDuration > 0) {
      const diff = Math.abs(duration - songDuration)
      if (diff <= 5) score += 150
      else if (diff <= 15) score += 80
      else if (diff > 60) score -= 80
    }
    return score
  }

  private async search(keyword: string): Promise<OiSong[]> {
    const url = `${OIAPI}?keyword=${encodeURIComponent(keyword)}&page=1&limit=10&type=json`
    const text = await this.getJson(url)
    const json = JSON.parse(text) as OiSearchResponse
    return Array.isArray(json.data) ? json.data : []
  }

  private async getLyric(id: string): Promise<string> {
    const url = `${OIAPI}?id=${encodeURIComponent(id)}&format=lrc&type=json`
    const text = await this.getJson(url)
    const json = JSON.parse(text) as OiLyricResponse
    if (json.code !== 1) return ''
    if (typeof json.data === 'string') return json.data
    if (json.data && typeof json.data === 'object') {
      return json.data.content || json.data.conteng || ''
    }
    if (typeof json.message === 'string' && json.message.includes('[')) return json.message
    return ''
  }

  private parseLrc(lrc: string): LyricLine[] {
    const lines: LyricLine[] = []
    const tag = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g
    for (const raw of lrc.split('\n')) {
      tag.lastIndex = 0
      const times: number[] = []
      let match = tag.exec(raw)
      while (match) {
        const min = Number(match[1] || 0)
        const sec = Number(match[2] || 0)
        const frac = match[3] ? Number(match[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0
        times.push(min * 60 + sec + frac)
        match = tag.exec(raw)
      }
      if (!times.length) continue
      const text = raw.replace(tag, '').trim()
      if (!text || /^(ti|ar|al|by|offset|kana|tool|length):/i.test(text)) continue
      for (const time of times) lines.push({ time, text })
    }
    return lines.sort((a, b) => a.time - b.time)
  }

  async find(rawTitle: string, rawArtist: string, duration: number): Promise<LyricResult | null> {
    const title = this.cleanTitle(rawTitle)
    const artist = this.cleanArtist(rawArtist)
    const queries = [`${title} ${artist}`.trim(), title]
    const seen = new Map<string, OiSong>()
    for (const query of queries) {
      const rows = await this.search(query)
      for (const row of rows) {
        const id = String(row.id || '')
        if (id && !seen.has(id)) seen.set(id, row)
      }
      if (seen.size >= 12) break
    }
    let best: OiSong | undefined
    let bestScore = 0
    for (const song of seen.values()) {
      const score = this.score(song, title, artist, duration)
      if (score > bestScore) {
        bestScore = score
        best = song
      }
    }
    if (!best || bestScore < 200) return null
    const lrc = await this.getLyric(String(best.id))
    if (!lrc) return null
    const lines = this.parseLrc(lrc)
    if (!lines.length) return null
    return {
      lines,
      synced: true,
      trackName: String(best.name || ''),
      artistName: (best.singer || []).join(' / '),
    }
  }
}
