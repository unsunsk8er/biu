import { common } from '@kit.AbilityKit'
import { http } from '@kit.NetworkKit'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util } from '@kit.ArkTS'
import { preferences } from '@kit.ArkData'
import { webview } from '@kit.ArkWeb'

export interface NativeSearchItem {
  bvid: string
  aid: number
  title: string
  author: string
  pic: string
  duration: string
  play: number
}

export interface NativeSearchResult {
  items: NativeSearchItem[]
  total: number
  pages: number
}

interface BiliSearchItem {
  bvid?: string
  aid?: number
  title?: string
  author?: string
  pic?: string
  duration?: string
  play?: number
}

interface BiliSearchData {
  result?: BiliSearchItem[]
  numResults?: number
  numPages?: number
}

interface BiliSearchResponse {
  code?: number
  message?: string
  data?: BiliSearchData
}

interface BiliNavData {
  wbi_img?: BiliWbiImage
}

interface BiliWbiImage {
  img_url?: string
  sub_url?: string
}

interface BiliNavResponse {
  code?: number
  data?: BiliNavData
}

const BILI_API = 'https://api.bilibili.com'
const UA = 'Mozilla/5.0 (Linux; Android 15; BiuHarmony 2.0.0) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const MIXIN_KEY_ENC_TAB: number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

/**
 * Native Bilibili client. This is the first piece of the ArkTS data layer that
 * will replace the renderer-side API calls when the WebView is removed.
 */
export class NativeBiliApi {
  private context: common.UIAbilityContext
  private pref?: preferences.Preferences
  private imgKey: string = ''
  private subKey: string = ''
  private keyTs: number = 0

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  private getPref(): preferences.Preferences | undefined {
    if (this.pref) return this.pref
    try {
      this.pref = preferences.getPreferencesSync(this.context, { name: 'biu_native_auth' })
    } catch (error) {
      this.pref = undefined
    }
    return this.pref
  }

  private readCookie(): string {
    const pref = this.getPref()
    if (pref) {
      const stored = pref.getSync('cookies', '') as string
      if (stored) return stored
    }
    // Migration path: while the WebView still exists, reuse its cookie jar.
    try {
      const cookie = webview.WebCookieManager.fetchCookieSync(BILI_API)
      if (cookie) {
        pref?.putSync('cookies', cookie)
        pref?.flush()
        return cookie
      }
    } catch (error) {
      // No WebView/cookie jar available.
    }
    return ''
  }

  private header(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Referer': 'https://www.bilibili.com/',
      'Accept': 'application/json, text/plain, */*',
    }
    const cookie = this.readCookie()
    if (cookie) headers['Cookie'] = cookie
    return headers
  }

  private async get(url: string): Promise<string> {
    const request = http.createHttp()
    try {
      const response = await request.request(url, {
        method: http.RequestMethod.GET,
        header: this.header(),
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 10000,
        readTimeout: 10000,
      })
      if (response.responseCode !== 200) {
        throw new Error(`Bilibili HTTP ${response.responseCode}`)
      }
      return String(response.result || '')
    } finally {
      request.destroy()
    }
  }

  private async getWbiKeys(): Promise<void> {
    if (this.imgKey && this.subKey && Date.now() - this.keyTs < 6 * 3600 * 1000) return
    const text = await this.get(`${BILI_API}/x/web-interface/nav`)
    const json = JSON.parse(text) as BiliNavResponse
    const imgUrl = json.data?.wbi_img?.img_url || ''
    const subUrl = json.data?.wbi_img?.sub_url || ''
    if (!imgUrl || !subUrl) throw new Error('Bilibili nav did not return WBI keys')
    this.imgKey = imgUrl.slice(imgUrl.lastIndexOf('/') + 1).split('.')[0]
    this.subKey = subUrl.slice(subUrl.lastIndexOf('/') + 1).split('.')[0]
    this.keyTs = Date.now()
  }

  private md5(input: string): string {
    const encoder = new util.TextEncoder()
    const bytes = encoder.encodeInto(input)
    const md: cryptoFramework.Md = cryptoFramework.createMd('MD5')
    md.updateSync({ data: bytes })
    const digest: cryptoFramework.DataBlob = md.digestSync()
    let out = ''
    for (const byte of digest.data) {
      out += byte.toString(16).padStart(2, '0')
    }
    return out
  }

  private signWbi(params: Map<string, string>): string {
    const mixinKey = MIXIN_KEY_ENC_TAB.map((index: number) => (this.imgKey + this.subKey)[index]).join('').slice(0, 32)
    const withTs = new Map<string, string>(params)
    withTs.set('wts', String(Math.round(Date.now() / 1000)))
    const keys = Array.from(withTs.keys()).sort()
    const query = keys.map((key: string) => {
      const value = (withTs.get(key) || '').replace(/[!'()*]/g, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    }).join('&')
    return `${query}&w_rid=${this.md5(query + mixinKey)}`
  }

  async searchVideo(keyword: string, page: number = 1, pageSize: number = 20): Promise<NativeSearchResult> {
    await this.getWbiKeys()
    const params = new Map<string, string>()
    params.set('search_type', 'video')
    params.set('keyword', keyword)
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    const query = this.signWbi(params)
    const text = await this.get(`${BILI_API}/x/web-interface/wbi/search/type?${query}`)
    const json = JSON.parse(text) as BiliSearchResponse
    if (json.code !== 0) {
      throw new Error(json.message || `Bilibili search failed (${json.code})`)
    }
    const items: NativeSearchItem[] = (json.data?.result || []).map((item: BiliSearchItem): NativeSearchItem => {
      return {
        bvid: String(item.bvid || ''),
        aid: Number(item.aid || 0),
        title: String(item.title || '').replace(/<[^>]+>/g, ''),
        author: String(item.author || ''),
        pic: String(item.pic || '').replace(/^http:/, 'https:'),
        duration: String(item.duration || ''),
        play: Number(item.play || 0),
      }
    })
    const result: NativeSearchResult = {
      items,
      total: Number(json.data?.numResults || 0),
      pages: Number(json.data?.numPages || 0),
    }
    return result
  }
}
