import type { AppSettings, Playlist, Track } from '@/types'
import { readStoredItem, writeStoredItem } from '@/utils/persistentStorage'

const RECENT_KEY = 'biu_recent'
const FAVORITES_KEY = 'biu_favorites'
const PLAYLISTS_KEY = 'biu_playlists'
const SETTINGS_KEY = 'biu_settings'
export const PLAYLISTS_CHANGED_EVENT = 'biu:playlists-changed'
export const FAVORITES_CHANGED_EVENT = 'biu:favorites-changed'
export const SETTINGS_CHANGED_EVENT = 'biu:settings-changed'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  sidebarState: 'auto',
  playQuality: '高品质',
  autoCache: false,
  showLyrics: true,
  autoMatchCover: true,
}

function notifySettingsChanged() {
  window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT))
}

export function loadRecentTracks(): Track[] {
  try {
    const raw = readStoredItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveRecentTracks(tracks: Track[]) {
  try {
    writeStoredItem(RECENT_KEY, JSON.stringify(tracks.slice(0, 50)))
  } catch { /* ignore */ }
}

export function addRecentTrack(track: Track) {
  const recent = loadRecentTracks().filter(t => t.id !== track.id)
  recent.unshift({ ...track, isLiked: track.isLiked })
  saveRecentTracks(recent)
}

export function loadFavoriteTracks(): Track[] {
  try {
    const raw = readStoredItem(FAVORITES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveFavoriteTracks(tracks: Track[]) {
  try {
    writeStoredItem(FAVORITES_KEY, JSON.stringify(tracks))
    window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT))
  } catch { /* ignore */ }
}

/**
 * Apply a metadata/cover refinement to every persisted copy of a track:
 * favorites, recent history and all playlists. Playlist covers derived from
 * the track are refreshed too, while custom playlist covers are preserved.
 */
export function updateTrackEverywhere(trackId: string, update: (track: Track) => Track): void {
  const favorites = loadFavoriteTracks()
  let favoritesChanged = false
  const nextFavorites = favorites.map((track) => {
    if (track.id !== trackId) return track
    const updated = update(track)
    if (updated !== track) favoritesChanged = true
    return updated
  })
  if (favoritesChanged) saveFavoriteTracks(nextFavorites)

  const playlists = loadPlaylists()
  let playlistsChanged = false
  const nextPlaylists = playlists.map((playlist) => {
    let playlistChanged = false
    let coverUrl = playlist.coverUrl
    const tracks = playlist.tracks.map((track) => {
      if (track.id !== trackId) return track
      const updated = update(track)
      if (updated === track) return track
      playlistChanged = true
      playlistsChanged = true
      if (!coverUrl || coverUrl === track.coverUrl) coverUrl = updated.coverUrl
      return updated
    })
    if (!playlistChanged) return playlist
    return {
      ...playlist,
      tracks,
      coverUrl,
      updatedAt: new Date().toISOString(),
    }
  })
  if (playlistsChanged) savePlaylists(nextPlaylists)

  const recent = loadRecentTracks()
  let recentChanged = false
  const nextRecent = recent.map((track) => {
    if (track.id !== trackId) return track
    const updated = update(track)
    if (updated !== track) recentChanged = true
    return updated
  })
  if (recentChanged) saveRecentTracks(nextRecent)
}

export function toggleFavoriteTrack(track: Track): Track[] {
  const favs = loadFavoriteTracks()
  const idx = favs.findIndex(t => t.id === track.id)
  if (idx >= 0) {
    favs.splice(idx, 1)
  } else {
    favs.unshift({ ...track, isLiked: true, likedAt: new Date().toISOString() })
  }
  saveFavoriteTracks(favs)
  return favs
}

// 从收藏移除（供收藏页删除使用）
export function removeFavoriteTrack(id: string): Track[] {
  const favs = loadFavoriteTracks().filter(t => t.id !== id)
  saveFavoriteTracks(favs)
  return favs
}

function notifyPlaylistsChanged() {
  window.dispatchEvent(new CustomEvent(PLAYLISTS_CHANGED_EVENT))
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = readStoredItem(PLAYLISTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePlaylists(playlists: Playlist[]) {
  try {
    writeStoredItem(PLAYLISTS_KEY, JSON.stringify(playlists))
    notifyPlaylistsChanged()
  } catch {
    // ignore
  }
}

export function createPlaylist(input: { name: string; description?: string; coverUrl?: string }): Playlist {
  const now = new Date().toISOString()
  const playlist: Playlist = {
    id: createId(),
    name: input.name.trim(),
    description: input.description?.trim() || '',
    coverUrl: input.coverUrl?.trim() || '',
    tracks: [],
    createdAt: now,
    updatedAt: now,
  }
  savePlaylists([playlist, ...loadPlaylists()])
  return playlist
}

export function getPlaylist(id: string): Playlist | null {
  return loadPlaylists().find(p => p.id === id) || null
}

export function updatePlaylist(updated: Playlist): void {
  const playlists = loadPlaylists()
  savePlaylists(playlists.map(p => p.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : p))
}

export function deletePlaylist(id: string): void {
  savePlaylists(loadPlaylists().filter(p => p.id !== id))
}

export function addTrackToPlaylist(playlistId: string, track: Track): Playlist | null {
  const playlists = loadPlaylists()
  let updatedPlaylist: Playlist | null = null
  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist
    const exists = playlist.tracks.some(t => t.id === track.id)
    updatedPlaylist = {
      ...playlist,
      coverUrl: playlist.coverUrl || track.coverUrl,
      tracks: exists ? playlist.tracks : [...playlist.tracks, track],
      updatedAt: new Date().toISOString(),
    }
    return updatedPlaylist
  })
  if (updatedPlaylist) savePlaylists(updated)
  return updatedPlaylist
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = readStoredItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_APP_SETTINGS
    // 旧版本可能残留已废弃的键（如下载目录/下载音质），展开后被忽略即可
    return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } as AppSettings
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function saveAppSettings(settings: AppSettings) {
  try {
    writeStoredItem(SETTINGS_KEY, JSON.stringify(settings))
    notifySettingsChanged()
  } catch {
    // ignore
  }
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadAppSettings(), ...patch }
  saveAppSettings(next)
  return next
}

export function createPlaylistsExport() {
  return {
    app: 'biu',
    type: 'playlists',
    version: 1,
    exportedAt: new Date().toISOString(),
    playlists: loadPlaylists(),
  }
}

function isPlainPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<Playlist>
  return typeof item.name === 'string' && Array.isArray(item.tracks)
}

export function importPlaylistsFromText(text: string): { imported: number; skipped: number } {
  const parsed = JSON.parse(text)
  const incoming = Array.isArray(parsed) ? parsed : parsed?.playlists
  if (!Array.isArray(incoming)) {
    throw new Error('文件中没有找到歌单列表')
  }

  const now = new Date().toISOString()
  const existing = loadPlaylists()
  const existingIds = new Set(existing.map(playlist => playlist.id))
  const existingNames = new Set(existing.map(playlist => playlist.name.trim()))
  const imported: Playlist[] = []
  let skipped = 0

  for (const item of incoming) {
    if (!isPlainPlaylist(item)) {
      skipped += 1
      continue
    }

    const name = item.name.trim()
    if (!name) {
      skipped += 1
      continue
    }

    const id = item.id && !existingIds.has(item.id) ? item.id : createId()
    existingIds.add(id)
    const finalName = existingNames.has(name) ? `${name} 导入` : name
    existingNames.add(finalName)

    imported.push({
      id,
      name: finalName,
      description: item.description || '',
      coverUrl: item.coverUrl || item.tracks[0]?.coverUrl || '',
      tracks: item.tracks,
      createdAt: item.createdAt || now,
      updatedAt: now,
      ...(typeof item.bilibiliFolderId === 'number' ? { bilibiliFolderId: item.bilibiliFolderId } : {}),
      ...(typeof item.bilibiliFolderTitle === 'string' ? { bilibiliFolderTitle: item.bilibiliFolderTitle } : {}),
      ...(typeof item.lastSyncedAt === 'string' ? { lastSyncedAt: item.lastSyncedAt } : {}),
    })
  }

  if (imported.length > 0) {
    savePlaylists([...imported, ...existing])
  }

  return { imported: imported.length, skipped }
}

export function removeTracksFromPlaylist(playlistId: string, trackIds: string[]): Playlist | null {
  const ids = new Set(trackIds)
  if (ids.size === 0) return getPlaylist(playlistId)
  const playlists = loadPlaylists()
  let updatedPlaylist: Playlist | null = null
  const updated = playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist
    updatedPlaylist = {
      ...playlist,
      tracks: playlist.tracks.filter(track => !ids.has(track.id)),
      updatedAt: new Date().toISOString(),
    }
    return updatedPlaylist
  })
  if (updatedPlaylist) savePlaylists(updated)
  return updatedPlaylist
}
