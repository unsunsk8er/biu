import { ipcMain, net, session } from 'electron'
import { assertTrustedSender } from './security'

const BILI_API = 'https://api.bilibili.com'
const BILI_PASSPORT = 'https://passport.bilibili.com'
const BILI_REFERER = 'https://www.bilibili.com'

interface BiliResponse<T> {
  code: number
  message?: string
  data?: T
}

interface FavoriteFolderList {
  count?: number
  list?: unknown[]
}

interface FavoriteResourcePage {
  info?: unknown
  medias?: unknown[] | null
  has_more?: boolean
}

interface QrGenerateData {
  url: string
  qrcode_key: string
}

interface QrPollData {
  code?: number
  message?: string
  url?: string
}

class BiliApiError extends Error {
  code: number

  constructor(code: number, message?: string) {
    super(message || `B 站接口错误（${code}）`)
    this.name = 'BiliApiError'
    this.code = code
  }
}

// ===== IPC Handlers =====
//
// 只保留渲染层仍在使用的通道：B 站搜索/详情/播放地址已改为渲染进程直连
// （主进程 net.fetch 无 WBI 签名，会被 -352 风控），这里不再维护第二套实现。

export function registerBiliApiHandlers() {
  // 当前登录用户的收藏夹列表（无需渲染进程传 mid）
  ipcMain.handle('bili:favoriteFolders', async (event) => {
    assertTrustedSender(event)
    const nav = await fetchBiliApi<{ mid?: number }>('/x/web-interface/nav')
    const mid = Number(nav?.mid) || 0
    if (!mid) throw new Error('请先登录 B 站账号')
    return fetchBiliApi<FavoriteFolderList>(`/x/v3/fav/folder/created/list-all?up_mid=${mid}`)
  })

  // 收藏夹内容
  ipcMain.handle('bili:favoriteResources', async (event, mediaId: number, pn = 1, ps = 20) => {
    assertTrustedSender(event)
    if (!mediaId || mediaId <= 0) throw new Error('无效的收藏夹 ID')
    const page = Math.max(1, Math.floor(Number(pn) || 1))
    const size = Math.min(50, Math.max(1, Math.floor(Number(ps) || 20)))
    return fetchBiliApi<FavoriteResourcePage>(
      `/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=${size}&platform=web&order=mtime&type=0&tid=0`,
    )
  })

  // 新建收藏夹
  ipcMain.handle('bili:favoriteCreate', async (event, title: string) => {
    assertTrustedSender(event)
    const name = String(title || '').trim().slice(0, 40)
    if (!name) throw new Error('收藏夹名称不能为空')
    return fetchBiliApiPost<{ id: number; title?: string }>('/x/v3/fav/folder/add', {
      title: name,
      privacy: 0,
      platform: 'web',
    })
  })

  // 将单个稿件加入收藏夹
  ipcMain.handle(
    'bili:favoriteAdd',
    async (event, folderId: number, track: { aid?: string | number; bvid?: string }) => {
      assertTrustedSender(event)
      const target = Math.floor(Number(folderId))
      if (!target || target <= 0) throw new Error('无效的收藏夹 ID')
      let aid = Math.floor(Number(track?.aid) || 0)
      if (!aid && track?.bvid) {
        const detail = await fetchBiliApi<{ aid?: number }>(
          `/x/web-interface/view?bvid=${encodeURIComponent(track.bvid)}`,
        )
        aid = Math.floor(Number(detail?.aid) || 0)
      }
      if (!aid) throw new Error('无法获取该歌曲的稿件 ID')
      return fetchBiliApiPost('/x/v3/fav/resource/deal', {
        rid: aid,
        type: 2,
        add_media_ids: target,
        del_media_ids: '',
        platform: 'web',
      })
    },
  )

  // ===== 扫码登录 =====

  // 生成二维码
  ipcMain.handle('bili:qrGenerate', async (event) => {
    assertTrustedSender(event)
    const response = await net.fetch(`${BILI_PASSPORT}/x/passport-login/web/qrcode/generate`, {
      headers: { Referer: `${BILI_PASSPORT}/login` },
    })
    const payload = (await response.json()) as BiliResponse<QrGenerateData>
    if (payload.code !== 0 || !payload.data) {
      throw new BiliApiError(payload.code, payload.message)
    }
    return {
      url: payload.data.url,
      qrcodeKey: payload.data.qrcode_key,
    }
  })

  // 轮询二维码状态
  ipcMain.handle('bili:qrPoll', async (event, qrcodeKey: string) => {
    assertTrustedSender(event)
    const response = await net.fetch(
      `${BILI_PASSPORT}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
      {
        headers: { Referer: `${BILI_PASSPORT}/login` },
        redirect: 'manual',
      },
    )

    const httpStatus = response.status
    const setCookieHeaders = response.headers.getSetCookie?.() || []
    const isRedirect = httpStatus === 302 || httpStatus === 301

    if (isRedirect && setCookieHeaders.length > 0) {
      for (const cookieStr of setCookieHeaders) {
        try {
          await session.defaultSession.cookies.set({
            url: BILI_API,
            name: parseCookieName(cookieStr),
            value: parseCookieValue(cookieStr),
            domain: '.bilibili.com',
            path: '/',
            secure: true,
            httpOnly: true,
          })
        } catch {
          // 单个 cookie 写入失败不应中断登录
        }
      }
      return {
        code: 0,
        status: 0,
        message: '登录成功',
        url: response.headers.get('Location') || '',
      }
    }

    const text = await response.text()
    let payload: BiliResponse<QrPollData>
    try {
      payload = JSON.parse(text) as BiliResponse<QrPollData>
    } catch {
      return { code: -1, status: -1, message: 'unknown', url: '' }
    }

    // B站 poll 响应：外层 code 表示 API 调用结果，
    // 内层 data.code 才是扫码状态（86101=未扫码, 86090=已扫码, 0=成功）
    return {
      code: payload.data?.code ?? payload.code,
      status: payload.data?.code ?? payload.code,
      message: payload.data?.message || payload.message,
      url: payload.data?.url || '',
    }
  })

  // 获取当前 Cookie 中的登录状态
  ipcMain.handle('bili:getCookies', async (event) => {
    assertTrustedSender(event)
    const cookies = await session.defaultSession.cookies.get({ domain: '.bilibili.com' })
    const loggedIn = ['SESSDATA', 'bili_jct', 'DedeUserID']
      .every((name) => cookies.some((cookie) => cookie.name === name))

    // 渲染层只需要“是否登录”。任何 Cookie 值（包括 csrf）都不回传，
    // 避免把 HttpOnly 凭据降级成页面脚本可读的字符串。
    return { isLoggedIn: loggedIn }
  })

  // 退出登录（清除 Cookie）
  ipcMain.handle('bili:logout', async (event) => {
    assertTrustedSender(event)
    await session.defaultSession.cookies.remove(BILI_API, 'SESSDATA')
    await session.defaultSession.cookies.remove(BILI_API, 'bili_jct')
    await session.defaultSession.cookies.remove(BILI_API, 'DedeUserID')
    await session.defaultSession.cookies.remove(BILI_API, 'DedeUserID__ckMd5')
    return { success: true }
  })
}

// ===== BiliBili API Fetch Helper =====

async function fetchBiliApi<T>(urlPath: string): Promise<T> {
  const url = `${BILI_API}${urlPath}`
  // 从 session 中获取 Cookie，确保 API 请求携带登录态
  const cookies = await session.defaultSession.cookies.get({ url: BILI_API })
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')

  const headers: Record<string, string> = {
    Referer: BILI_REFERER,
    Origin: 'https://www.bilibili.com',
  }
  if (cookieHeader) {
    headers['Cookie'] = cookieHeader
  }

  const response = await net.fetch(url, { headers })
  const payload = (await response.json()) as BiliResponse<T>
  if (payload.code !== 0) {
    throw new BiliApiError(payload.code, payload.message)
  }
  return payload.data as T
}

async function getBiliJct(): Promise<string> {
  const cookies = await session.defaultSession.cookies.get({ domain: '.bilibili.com' })
  const jct = cookies.find((cookie) => cookie.name === 'bili_jct')?.value || ''
  if (!jct) throw new Error('请先登录 B 站账号')
  return jct
}

async function fetchBiliApiPost<T = unknown>(
  urlPath: string,
  params: Record<string, string | number>,
): Promise<T> {
  const csrf = await getBiliJct()
  const cookies = await session.defaultSession.cookies.get({ domain: '.bilibili.com' })
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  const body = new URLSearchParams()
  Object.entries({ ...params, csrf }).forEach(([key, value]) => body.set(key, String(value)))

  const response = await net.fetch(`${BILI_API}${urlPath}`, {
    method: 'POST',
    headers: {
      Referer: BILI_REFERER,
      Origin: 'https://www.bilibili.com',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: body.toString(),
  })
  const payload = (await response.json()) as BiliResponse<T>
  if (payload.code !== 0) {
    throw new BiliApiError(payload.code, payload.message)
  }
  return payload.data as T
}

// ===== Cookie 解析辅助 =====

function parseCookieName(setCookie: string): string {
  const pair = setCookie.split(';')[0]
  return pair.split('=')[0].trim()
}

function parseCookieValue(setCookie: string): string {
  const pair = setCookie.split(';')[0]
  return pair.split('=').slice(1).join('=').trim()
}
