import type { Playlist, Track } from '@/types'
import type { BiliFavoriteFolder, BiliFavoriteMedia } from '@/types/electron'
import { toHttpsUrl } from './bilibiliApi'
import { isAndroidApp } from '@/utils/mobile'
import { createAndroidBiliApi } from './androidBiliApi'

export interface FavoriteCollection {
  folders: BiliFavoriteFolder[]
  count: number
}

function requireBiliApi() {
  const desktopApi = window.electronAPI?.biliApi
  if (desktopApi) return desktopApi
  if (isAndroidApp() && window.BiuAndroid?.biliPost) return createAndroidBiliApi()
  throw new Error('当前环境不支持 B 站歌单同步')
}

export function syncErrorMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '同步失败')
      : typeof error === 'string' ? error : '同步失败，请稍后重试'
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^BiliApiError:\s*/, '')
}

export async function loadFavoriteFolders(): Promise<FavoriteCollection> {
  const data = await requireBiliApi().favoriteFolders()
  return {
    folders: Array.isArray(data?.list) ? data.list : [],
    count: Number(data?.count) || 0,
  }
}

export async function loadAllFavoriteMedias(
  folderId: number,
  onProgress?: (loaded: number, page: number) => void,
): Promise<BiliFavoriteMedia[]> {
  const api = requireBiliApi()
  const collect: BiliFavoriteMedia[] = []
  let page = 1
  while (page <= 100) {
    const data = await api.favoriteResources(folderId, page, 20)
    const batch = Array.isArray(data?.medias) ? data.medias : []
    collect.push(...batch)
    onProgress?.(collect.length, page)
    if (!data?.has_more || batch.length === 0) break
    page += 1
    // 收藏夹较大时给 B 站读接口留出一点间隔，避免连续分页被风控。
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return collect
}

export function favoriteMediaToTrack(media: BiliFavoriteMedia): Track | null {
  const bvid = String(media.bvid || '').trim()
  if (!bvid) return null
  return {
    id: bvid,
    title: media.title || '未命名视频',
    artist: media.upper?.name || 'Bilibili 用户',
    coverUrl: toHttpsUrl(media.cover || ''),
    duration: Number(media.duration) || 0,
    videoUrl: `https://www.bilibili.com/video/${bvid}`,
    bvid,
    aid: media.id,
    playCount: 0,
    isLiked: false,
  }
}

export async function createFavoriteFolder(title: string): Promise<{ id: number; title: string }> {
  const data = await requireBiliApi().favoriteCreate(title.trim().slice(0, 40))
  const id = Number(data?.id)
  if (!id) throw new Error('B 站没有返回新收藏夹 ID')
  return { id, title: String(data.title || title).trim() }
}

export async function pushPlaylistToFavorite(
  folderId: number,
  playlist: Playlist,
  onProgress?: (done: number, total: number) => void,
): Promise<{ added: number; skipped: number }> {
  const api = requireBiliApi()
  let added = 0
  let skipped = 0
  const tracks = playlist.tracks
  for (let i = 0; i < tracks.length; i += 1) {
    const track = tracks[i]
    if (!track.bvid && !track.aid) {
      skipped += 1
    } else {
      try {
        await api.favoriteAdd(folderId, { bvid: track.bvid, aid: track.aid })
        added += 1
      } catch (error) {
        const message = syncErrorMessage(error)
        if (/登录|-101|-111|csrf|权限|风控/i.test(message)) throw error
        skipped += 1
      }
    }
    onProgress?.(i + 1, tracks.length)
    if (i + 1 < tracks.length) {
      await new Promise((resolve) => setTimeout(resolve, 160))
    }
  }
  return { added, skipped }
}
