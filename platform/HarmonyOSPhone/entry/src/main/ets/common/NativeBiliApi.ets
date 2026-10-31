import { common } from '@kit.AbilityKit'
import { http } from '@kit.NetworkKit'
import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util } from '@kit.ArkTS'
import { preferences } from '@kit.ArkData'

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

export interface NativeVideoPage {
  cid: number
  page: number
  part: string
  duration: number
}

export interface NativeVideoInfo {
  bvid: string
  aid: number
  title: string
  cover: string
  artist: string
  duration: number
  cid: number
  pages: NativeVideoPage[]
}

export interface NativeAudioSource {
  url: string
  backups: string[]
}

export interface NativeUser {
  isLogin: boolean
  mid: number
  uname: string
  face: string
}

interface BiliPage {
  cid?: number
  page?: number
  part?: string
  duration?: number
}

interface BiliViewData {
  bvid?: string
  aid?: number
  title?: string
  pic?: string
  duration?: number
  cid?: number
  owner?: BiliOwner
  pages?: BiliPage[]
}

interface BiliOwner {
  name?: string
}

interface BiliViewResponse {
  code?: number
  message?: string
  data?: BiliViewData
}

interface BiliDashAudio {
  baseUrl?: string
  base_url?: string
  backupUrl?: string[]
  backup_url?: string[]
  bandwidth?: number
}

interface BiliDash {
  audio?: BiliDashAudio[]
}

interface BiliDurl {
  url?: string
  backup_url?: string[]
}

interface BiliPlayUrlData {
  dash?: BiliDash
  durl?: BiliDurl[]
}

interface BiliPlayUrlResponse {
  code?: number
  message?: string
  data?: BiliPlayUrlData
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
  isLogin?: boolean
  mid?: number
  uname?: string
  face?: string
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
 * Native Bilibili client for the fully native ArkUI app.
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

  saveCookie(cookie: string): void {
    if (!cookie) return
    try {
      const pref = this.getPref()
      if (!pref) return
      pref.putSync('cookies', cookie)
      pref.flush()
    } catch (error) {
      // Login persistence failure is reported by the caller.
    }
  }

  clearCookie(): void {
    try {
      const pref = this.getPref()
      if (!pref) return
      pref.deleteSync('cookies')
      pref.flush()
    } catch (error) {
      // ignore
    }
  }

  async getNavInfo(): Promise<NativeUser> {
    try {
      const text = await this.get(`${BILI_API}/x/web-interface/nav`)
      const json = JSON.parse(text) as BiliNavResponse
      if (json.code !== 0 || !json.data) {
        return { isLogin: false, mid: 0, uname: '', face: '' }
      }
      return {
        isLogin: json.data.isLogin === true,
        mid: Number(json.data.mid || 0),
        uname: String(json.data.uname || ''),
        face: String(json.data.face || ''),
      }
    } catch (error) {
      return { isLogin: false, mid: 0, uname: '', face: '' }
    }
  }

  private readCookie(): string {
    const pref = this.getPref()
    if (pref) {
      return pref.getSync('cookies', '') as string
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

  private normalizePic(value: string): string {
    const pic = String(value || '').replace(/^http:/, 'https:')
    return pic.startsWith('//') ? `https:${pic}` : pic
  }

  async getVideoInfo(bvid: string): Promise<NativeVideoInfo> {
    const text = await this.get(`${BILI_API}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`)
    const json = JSON.parse(text) as BiliViewResponse
    if (json.code !== 0 || !json.data) {
      throw new Error(json.message || `Bilibili view failed (${json.code})`)
    }
    const data = json.data
    const pages: NativeVideoPage[] = (data.pages || []).map((item: BiliPage): NativeVideoPage => {
      return {
        cid: Number(item.cid || 0),
        page: Number(item.page || 0),
        part: String(item.part || ''),
        duration: Number(item.duration || 0),
      }
    })
    return {
      bvid: String(data.bvid || bvid),
      aid: Number(data.aid || 0),
      title: String(data.title || ''),
      cover: this.normalizePic(data.pic || ''),
      artist: String(data.owner?.name || ''),
      duration: Number(data.duration || 0),
      cid: Number(data.cid || pages[0]?.cid || 0),
      pages,
    }
  }

  async getPlayUrl(bvid: string, cid: number): Promise<NativeAudioSource> {
    const text = await this.get(
      `${BILI_API}/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&qn=80&fnval=16&fourk=1`
    )
    const json = JSON.parse(text) as BiliPlayUrlResponse
    if (json.code !== 0 || !json.data) {
      throw new Error(json.message || `Bilibili playurl failed (${json.code})`)
    }
    const audios = json.data.dash?.audio || []
    let best: BiliDashAudio | undefined
    for (const item of audios) {
      if (!best || Number(item.bandwidth || 0) > Number(best.bandwidth || 0)) best = item
    }
    const primary = best?.baseUrl || best?.base_url || json.data.durl?.[0]?.url || ''
    if (!primary) throw new Error('Bilibili playurl returned no audio stream')
    const backups = best?.backupUrl || best?.backup_url || json.data.durl?.[0]?.backup_url || []
    return {
      url: this.normalizePic(primary),
      backups: backups.map((item: string) => this.normalizePic(item)),
    }
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
        pic: this.normalizePic(item.pic || ''),
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
