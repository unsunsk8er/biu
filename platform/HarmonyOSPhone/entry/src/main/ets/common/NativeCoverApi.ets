import { http } from '@kit.NetworkKit'

interface ItunesResponse {
  results?: ItunesItem[]
}

interface ItunesItem {
  trackName?: string
  artistName?: string
  artworkUrl100?: string
  collectionName?: string
}

const UA = 'Mozilla/5.0 (Linux; Android 15; BiuHarmony 2.0.0) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

export class NativeCoverApi {
  private clean(raw: string): string {
    const quoted = raw.match(/《([^》]{1,60})》/)
    let text = quoted ? quoted[1] : raw
    text = text
      .replace(/[【\[（(][^】\]）)]{0,80}[】\]）)]/g, ' ')
      .replace(/\b(official|lyrics?|audio|video|mv|hd|4k|8k|live|cover|remix|hi-?res)\b/gi, ' ')
      .replace(/[|｜/\\]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text || raw.trim().slice(0, 60)
  }

  private norm(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
  }

  async find(rawTitle: string, rawArtist: string): Promise<string> {
    const title = this.clean(rawTitle)
    const artist = rawArtist.replace(/[【\[（(][^】\]）)]{0,40}[】\]）)]/g, ' ').trim()
    const term = `${title} ${artist}`.trim()
    if (!term) return ''
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=8&country=TW&lang=zh_tw`
    const request = http.createHttp()
    try {
      const response = await request.request(url, {
        method: http.RequestMethod.GET,
        header: { 'User-Agent': UA, 'Accept': 'application/json' },
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 8000,
        readTimeout: 10000,
      })
      if (response.responseCode !== 200) return ''
      const json = JSON.parse(String(response.result || '')) as ItunesResponse
      const wantTitle = this.norm(title)
      const wantArtist = this.norm(artist)
      for (const item of json.results || []) {
        const songTitle = this.norm(String(item.trackName || ''))
        const songArtist = this.norm(String(item.artistName || ''))
        const titleOk = songTitle === wantTitle || songTitle.includes(wantTitle) || wantTitle.includes(songTitle)
        const artistOk = !wantArtist || songArtist.includes(wantArtist) || wantArtist.includes(songArtist)
        if (titleOk && artistOk && item.artworkUrl100) {
          return String(item.artworkUrl100).replace(/\/\d+x\d+bb\./, '/1000x1000bb.')
        }
      }
    } catch (error) {
      return ''
    } finally {
      request.destroy()
    }
    return ''
  }
}
