import { common } from '@kit.AbilityKit'
import { preferences } from '@kit.ArkData'
import { webview } from '@kit.ArkWeb'

export interface NativeTrack {
  bvid: string
  title: string
  artist: string
  coverUrl: string
  duration: number
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

  async migrateFromWeb(controller: webview.WebviewController): Promise<void> {
    if (this.read(KEY_MIGRATED) === '1') return
    const script =
      `(function(){try{return JSON.stringify({` +
      `playlists:JSON.parse(localStorage.getItem('biu_playlists')||'[]'),` +
      `favorites:JSON.parse(localStorage.getItem('biu_favorites')||'[]'),` +
      `recent:JSON.parse(localStorage.getItem('biu_recent')||'[]')` +
      `});}catch(e){return '{}';}})()`
    try {
      const raw = await controller.runJavaScript(script)
      const payload = JSON.parse(raw) as WebLibraryPayload
      const playlists: NativePlaylist[] = []
      for (const item of payload.playlists || []) {
        const tracks = this.normalizeTracks(item.tracks)
        if (!item.id && !tracks.length) continue
        playlists.push({
          id: String(item.id || `playlist_${Date.now()}`),
          name: String(item.name || '歌单'),
          description: String(item.description || ''),
          coverUrl: String(item.coverUrl || tracks[0]?.coverUrl || ''),
          tracks,
          createdAt: String(item.createdAt || ''),
          updatedAt: String(item.updatedAt || ''),
        })
      }
      if (playlists.length) this.write(KEY_PLAYLISTS, JSON.stringify(playlists))
      if (payload.favorites?.length) {
        this.write(KEY_FAVORITES, JSON.stringify(this.normalizeTracks(payload.favorites)))
      }
      if (payload.recent?.length) {
        this.write(KEY_RECENT, JSON.stringify(this.normalizeTracks(payload.recent)))
      }
      this.write(KEY_MIGRATED, '1')
    } catch (error) {
      // Web page not ready; retry on the next open.
    }
  }

  getPlaylists(): NativePlaylist[] {
    try {
      const parsed = JSON.parse(this.read(KEY_PLAYLISTS) || '[]') as NativePlaylist[]
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      return []
    }
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
}
