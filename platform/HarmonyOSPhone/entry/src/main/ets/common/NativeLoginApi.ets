import { http } from '@kit.NetworkKit'

interface QrGenerateData {
  url?: string
  qrcode_key?: string
}

interface QrGenerateResponse {
  code?: number
  message?: string
  data?: QrGenerateData
}

interface QrPollData {
  url?: string
  code?: number
  message?: string
}

interface QrPollResponse {
  code?: number
  message?: string
  data?: QrPollData
}

export interface QrLoginStart {
  url: string
  key: string
}

export interface QrPollResult {
  state: 'waiting' | 'scanned' | 'expired' | 'success' | 'error'
  cookie: string
  message: string
}

const UA = 'Mozilla/5.0 (Linux; Android 15; BiuHarmony 2.0.0) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

export class NativeLoginApi {
  private async getJson(url: string): Promise<string> {
    const request = http.createHttp()
    try {
      const response = await request.request(url, {
        method: http.RequestMethod.GET,
        header: {
          'User-Agent': UA,
          'Referer': 'https://www.bilibili.com/',
          'Accept': 'application/json, text/plain, */*',
        },
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 8000,
        readTimeout: 10000,
      })
      if (response.responseCode !== 200) throw new Error(`HTTP ${response.responseCode}`)
      return String(response.result || '')
    } finally {
      request.destroy()
    }
  }

  async generate(): Promise<QrLoginStart> {
    const text = await this.getJson('https://passport.bilibili.com/x/passport-login/web/qrcode/generate')
    const json = JSON.parse(text) as QrGenerateResponse
    const url = json.data?.url || ''
    const key = json.data?.qrcode_key || ''
    if (json.code !== 0 || !url || !key) throw new Error(json.message || '二维码生成失败')
    return { url, key }
  }

  async poll(key: string): Promise<QrPollResult> {
    const text = await this.getJson(
      `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(key)}`
    )
    const json = JSON.parse(text) as QrPollResponse
    if (json.code !== 0) {
      return { state: 'error', cookie: '', message: json.message || '登录失败' }
    }
    const code = Number(json.data?.code || 0)
    if (code === 0) {
      return {
        state: 'success',
        cookie: this.cookieFromUrl(String(json.data?.url || '')),
        message: '登录成功',
      }
    }
    if (code === 86101) return { state: 'waiting', cookie: '', message: '等待扫码' }
    if (code === 86090) return { state: 'scanned', cookie: '', message: '已扫码，请在手机上确认' }
    if (code === 86038) return { state: 'expired', cookie: '', message: '二维码已过期' }
    return { state: 'waiting', cookie: '', message: String(json.data?.message || '等待扫码') }
  }

  private cookieFromUrl(url: string): string {
    const index = url.indexOf('?')
    if (index < 0) return ''
    const query = url.slice(index + 1)
    const allowed = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'sid']
    const parts: string[] = []
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      const key = pair.slice(0, eq)
      if (!allowed.includes(key)) continue
      parts.push(`${key}=${pair.slice(eq + 1)}`)
    }
    return parts.join('; ')
  }
}
