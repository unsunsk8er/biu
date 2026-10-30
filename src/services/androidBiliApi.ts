/**
 * Android WebView bridge for the Bilibili favorite-folder sync.
 *
 * GET requests stay on the normal renderer fetch path and are proxied by
 * BiliProxy. Mutating requests need a request body, which WebView's
 * shouldInterceptRequest cannot expose, so they go through the native
 * BiuAndroid bridge with the app's CookieManager and csrf token.
 */
import type { BiliFavoriteFolder, BiliFavoriteResourcesPage } from '@/types/electron'
import { BiliApiError } from './errors'

const BILI_API = 'https://api.bilibili.com'
const POST_TIMEOUT_MS = 45000

interface AndroidBridge {
  biliPost: (requestId: string, path: string, body: string) => void
}

interface PendingPost {
  resolve: (raw: string) => void
  reject: (error: Error) => void
  timer: number
}

const pendingPosts = new Map<string, PendingPost>()
let postSeq = 0

declare global {
  interface Window {
    BiuAndroid?: AndroidBridge & {
      getVersion?: () => string
      setSystemTheme?: (mode: 'light' | 'dark') => void
      reloadForPlayback?: () => void
      logout?: () => void
      openExternal?: (url: string) => void
    }
    __biuBiliPostResult?: (requestId: string, raw: string) => void
    __biuBackPressed?: () => 'handled' | 'background' | 'fallback'
    __biuAppResumed?: () => void
  }
}

if (typeof window !== 'undefined') {
  window.__biuBiliPostResult = (requestId: string, raw: string) => {
    const pending = pendingPosts.get(requestId)
    if (!pending) return
    pendingPosts.delete(requestId)
    window.clearTimeout(pending.timer)
    pending.resolve(raw)
  }
}

async function biliGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BILI_API}${path}`, {
    credentials: 'include',
    headers: { Referer: 'https://www.bilibili.com' },
  })
  const data = await response.json()
  if (data.code !== 0) {
    throw new BiliApiError(Number(data.code) || -1, data.message || 'B 站接口错误')
  }
  return data.data as T
}

function nativePost(path: string, params: Record<string, string | number>): Promise<any> {
  const bridge = window.BiuAndroid
  if (!bridge?.biliPost) return Promise.reject(new Error('当前 Android 版本不支持 B 站写操作'))
  const requestId = `bili-${Date.now()}-${postSeq++}`
  const body = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString()

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingPosts.delete(requestId)
      reject(new Error('B 站请求超时，请检查网络后重试'))
    }, POST_TIMEOUT_MS)
    pendingPosts.set(requestId, { resolve, reject, timer })
    try {
      bridge.biliPost(requestId, path, body)
    } catch (error) {
      pendingPosts.delete(requestId)
      window.clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  }).then((raw) => {
    let data: any
    try {
      data = JSON.parse(String(raw))
    } catch {
      throw new Error('B 站返回了无法解析的数据')
    }
    if (data.code !== 0) {
      throw new BiliApiError(Number(data.code) || -1, data.message || 'B 站接口错误')
    }
    return data.data
  })
}

export function createAndroidBiliApi() {
  return {
    favoriteFolders: async (): Promise<{ count: number; list: BiliFavoriteFolder[] }> => {
      const nav = await biliGet<{ mid?: number }>('/x/web-interface/nav')
      const mid = Number(nav?.mid) || 0
      if (!mid) throw new Error('请先登录 B 站账号')
      return biliGet(`/x/v3/fav/folder/created/list-all?up_mid=${mid}`)
    },

    favoriteResources: (mediaId: number, pn = 1, ps = 20): Promise<BiliFavoriteResourcesPage> => {
      if (!mediaId || mediaId <= 0) return Promise.reject(new Error('无效的收藏夹 ID'))
      const page = Math.max(1, Math.floor(Number(pn) || 1))
      const size = Math.min(50, Math.max(1, Math.floor(Number(ps) || 20)))
      return biliGet(
        `/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=${size}&platform=web&order=mtime&type=0&tid=0`,
      )
    },

    favoriteCreate: async (title: string): Promise<{ id: number; title: string }> => {
      const name = String(title || '').trim().slice(0, 40)
      if (!name) throw new Error('收藏夹名称不能为空')
      return nativePost('/x/v3/fav/folder/add', {
        title: name,
        privacy: 0,
        platform: 'web',
      })
    },

    favoriteAdd: async (folderId: number, track: { aid?: string | number; bvid?: string }): Promise<unknown> => {
      const target = Math.floor(Number(folderId))
      if (!target || target <= 0) throw new Error('无效的收藏夹 ID')
      let aid = Math.floor(Number(track?.aid) || 0)
      if (!aid && track?.bvid) {
        const detail = await biliGet<{ aid?: number }>(
          `/x/web-interface/view?bvid=${encodeURIComponent(track.bvid)}`,
        )
        aid = Math.floor(Number(detail?.aid) || 0)
      }
      if (!aid) throw new Error('无法获取该歌曲的稿件 ID')
      return nativePost('/x/v3/fav/resource/deal', {
        rid: aid,
        type: 2,
        add_media_ids: target,
        del_media_ids: '',
        platform: 'web',
      })
    },
  }
}
