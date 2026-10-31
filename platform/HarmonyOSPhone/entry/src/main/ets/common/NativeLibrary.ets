import { common } from '@kit.AbilityKit'
import { preferences } from '@kit.ArkData'
import { fileIo } from '@kit.CoreFileKit'

export interface NativeTrack {
  bvid: string
  title: string
  artist: string
  coverUrl: string
  duration: number
  localPath?: string
  cid?: number
  page?: number
  partTitle?: string
}

export interface NativePlaylist {
  id: string
  name: string
  description: string
  coverUrl: string
  tracks: NativeTrack[]
  createdAt: string
  updatedAt: string
}

export interface NativeDownload {
  bvid: string
  title: string
  artist: string
  coverUrl: string
  path: string
  cachedAt: number
  size: number
}

interface WebTrack {
  id?: string
  bvid?: string
  title?: string
  artist?: string
  coverUrl?: string
  duration?: number
}

interface WebPlaylist {
  id?: string
  name?: string
  description?: string
  coverUrl?: string
  tracks?: WebTrack[]
  createdAt?: string
  updatedAt?: string
}

interface WebLibraryPayload {
  playlists?: WebPlaylist[]
  favorites?: WebTrack[]
  recent?: WebTrack[]
}

const PREF_NAME = 'biu_native_library'
const KEY_PLAYLISTS = 'playlists'
const KEY_FAVORITES = 'favorites'
const KEY_RECENT = 'recent'
const KEY_DOWNLOADS = 'downloads'
const KEY_MIGRATED = 'migrated_v1'

export class NativeLibrary {
  private context: common.UIAbilityContext
  private pref?: preferences.Preferences

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  private getPref(): preferences.Preferences | undefined {
    if (this.pref) return this.pref
    try {
      this.pref = preferences.getPreferencesSync(this.context, { name: PREF_NAME })
    } catch (error) {
      this.pref = undefined
    }
    return this.pref
  }

  private read(key: string): string {
    try {
      const pref = this.getPref()
      return pref ? pref.getSync(key, '') as string : ''
    } catch (error) {
      return ''
    }
  }

  private write(key: string, value: string): void {
    try {
      const pref = this.getPref()
      if (!pref) return
      pref.putSync(key, value)
      pref.flush()
    } catch (error) {
      // Persistence failure must not break the UI.
    }
  }

  private normalizeTrack(track: WebTrack): NativeTrack | null {
    const bvid = String(track.bvid || track.id || '').trim()
    if (!bvid) return null
    return {
      bvid,
      title: String(track.title || '未命名'),
      artist: String(track.artist || ''),
      coverUrl: String(track.coverUrl || ''),
      duration: Number(track.duration || 0),
    }
  }

  private normalizeTracks(tracks?: WebTrack[]): NativeTrack[] {
    const out: NativeTrack[] = []
    const seen = new Set<string>()
    for (const item of tracks || []) {
      const track = this.normalizeTrack(item)
      if (track && !seen.has(track.bvid)) {
        seen.add(track.bvid)
        out.push(track)
      }
    }
    return out
  }

  getPlaylists(): NativePlaylist[] {
    try {
      const parsed = JSON.parse(this.read(KEY_PLAYLISTS) || '[]') as NativePlaylist[]
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  }

  getFavorites(): NativeTrack[] {
    try {
      const parsed = JSON.parse(this.read(KEY_FAVORITES) || '[]') as NativeTrack[]
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  }

  isFavorite(bvid: string): boolean {
    return this.getFavorites().some((item) => item.bvid === bvid)
  }

  toggleFavorite(track: NativeTrack): boolean {
    const favorites = this.getFavorites()
    const exists = favorites.some((item) => item.bvid === track.bvid)
    const next = exists
      ? favorites.filter((item) => item.bvid !== track.bvid)
      : [track, ...favorites.filter((item) => item.bvid !== track.bvid)]
    this.write(KEY_FAVORITES, JSON.stringify(next))
    return !exists
  }

  getRecent(): NativeTrack[] {
    try {
      const parsed = JSON.parse(this.read(KEY_RECENT) || '[]') as NativeTrack[]
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
  }

  addRecent(track: NativeTrack): void {
    if (!track.bvid && !track.localPath) return
    const next = [track, ...this.getRecent().filter((item) => item.bvid !== track.bvid && item.title !== track.title)]
    this.write(KEY_RECENT, JSON.stringify(next.slice(0, 50)))
  }

  createPlaylist(name: string): NativePlaylist {
    const now = new Date().toISOString()
    const playlist: NativePlaylist = {
      id: `native_playlist_${Date.now()}`,
      name: name.trim() || '新建歌单',
      description: '',
      coverUrl: '',
      tracks: [],
      createdAt: now,
      updatedAt: now,
    }
    this.write(KEY_PLAYLISTS, JSON.stringify([playlist, ...this.getPlaylists()]))
    return playlist
  }

  deletePlaylist(id: string): void {
    this.write(KEY_PLAYLISTS, JSON.stringify(this.getPlaylists().filter((item) => item.id !== id)))
  }

  getDownloads(): NativeDownload[] {
    try {
      const parsed = JSON.parse(this.read(KEY_DOWNLOADS) || '[]') as NativeDownload[]
      return Array.isArray(parsed) ? parsed.sort((a, b) => b.cachedAt - a.cachedAt) : []
    } catch (error) {
      return []
    }
  }

  addDownload(download: NativeDownload): void {
    if (!download.path || !download.bvid) return
    const next = this.getDownloads().filter((item) => item.bvid !== download.bvid && item.path !== download.path)
    next.unshift(download)
    this.write(KEY_DOWNLOADS, JSON.stringify(next.slice(0, 200)))
  }

  removeDownload(bvid: string): void {
    this.write(KEY_DOWNLOADS, JSON.stringify(this.getDownloads().filter((item) => item.bvid !== bvid)))
  }

  /**
   * Import cache files left behind by the old WebView/transcoder build. The
   * original titles are unknown, so bvid is used as a temporary label and the
   * file is immediately playable from the downloads page.
   */
  migrateCacheFiles(): number {
    try {
      const names = fileIo.listFileSync(this.context.cacheDir)
      const existing = this.getDownloads()
      const known = new Set<string>(existing.map((item) => item.bvid))
      const added: NativeDownload[] = []
      for (const name of names) {
        if (!name.startsWith('biu-audio-v3-')) continue
        if (!name.endsWith('.m4a') && !name.endsWith('.mp4')) continue
        const match = name.match(/biu-audio-v3-(BV[0-9A-Za-z]+)/)
        if (!match) continue
        const bvid = match[1]
        if (known.has(bvid)) continue
        known.add(bvid)
        added.push({
          bvid,
          title: bvid,
          artist: '本地缓存',
          coverUrl: '',
          path: `file://${this.context.cacheDir}/${name}`,
          cachedAt: Date.now() - added.length,
          size: 0,
        })
      }
      if (added.length) {
        this.write(KEY_DOWNLOADS, JSON.stringify([...added, ...existing].slice(0, 200)))
      }
      return added.length
    } catch (error) {
      return 0
    }
  }
}
