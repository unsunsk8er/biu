export interface BiliFavoriteFolder {
  id: number
  title: string
  media_count: number
  attr?: number
}

export interface BiliFavoriteMedia {
  id: number
  bvid?: string
  title: string
  cover: string
  upper?: { name?: string; mid?: number }
  duration?: number
  ctime?: number
  attr?: number
}

export interface BiliFavoriteResourcesPage {
  info?: BiliFavoriteFolder
  medias?: BiliFavoriteMedia[] | null
  has_more?: boolean
}

interface BiliApi {
  favoriteFolders: () => Promise<{ count: number; list: BiliFavoriteFolder[] }>
  favoriteResources: (mediaId: number, pn?: number, ps?: number) => Promise<BiliFavoriteResourcesPage>
  favoriteCreate: (title: string) => Promise<{ id: number; title: string; [key: string]: unknown }>
  favoriteAdd: (folderId: number, track: { aid?: string | number; bvid?: string }) => Promise<unknown>
  qrGenerate: () => Promise<{
    url: string
    qrcodeKey: string
  }>
  qrPoll: (qrcodeKey: string) => Promise<{
    code: number
    status: number
    message: string
    url: string
  }>
  getCookies: () => Promise<{
    isLoggedIn: boolean
  }>
  logout: () => Promise<{ success: boolean }>
}

export interface OiapiSong {
  name: string
  singer: string[]
  album: string
  mid: string
  id: string | number
  album_mid: string
  duration: number
  image: string
}

export interface OiapiLyricData {
  content?: string
  conteng?: string
  base64?: string
  cache?: boolean
}

interface LyricsApi {
  search: (keyword: string, page?: number, limit?: number) => Promise<OiapiSong[]>
  get: (id: string | number, format?: 'lrc' | 'qrc' | 'ksc') => Promise<OiapiLyricData | null>
}

interface PersistentStorageApi {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface TrayPlayerState {
  hasTrack: boolean
  title: string
  artist: string
  coverUrl: string
  isPlaying: boolean
  queueLength: number
  theme: 'light' | 'dark'
}

export type TrayPlayerCommand = 'toggle-play' | 'next' | 'prev'

export type CoverProvider = 'netease' | 'qq' | 'itunes' | 'kugou'

export interface CoverSearchQuery {
  title: string
  artist: string
}

export interface CoverCandidate {
  provider: CoverProvider
  title: string
  artist: string
  album: string
  coverUrl: string
  score: number
  /** Original provider ranking; used only for title-only fallback. */
  relevance?: number
}

export interface BiuHarmonyBridge {
  getVersion: () => string
  getPlatform: () => string
  openExternal: (url: string) => void
  exitApp: () => void
  request: (
    requestId: string,
    url: string,
    method: string,
    headersJson: string,
    body: string,
  ) => void
  setMediaSession: (
    assetId: string,
    title: string,
    artist: string,
    album: string,
    coverUrl: string,
    lyric: string,
    duration: number,
  ) => void
  setMediaSessionLyric: (lyric: string, singleLine: string) => void
  setMediaSessionState: (isPlaying: boolean, positionSec: number, durationSec: number) => void
  clearMediaSession: () => void
  setBackMode: (allowSystemBack: boolean) => void
  cacheAudioFile: (requestId: string, url: string) => void
}

declare global {
  interface Window {
    BiuHarmony?: BiuHarmonyBridge
    __biuAvCommand?: (command: string, value?: number) => void
    __biuAudioFile?: (requestId: string, path: string) => void
    __biuHarmonyResolve?: (
      requestId: string,
      payload: { status: number; headers: string; body: string },
    ) => void
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      startResize?: (edge: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw', screenX: number, screenY: number) => void
      resizeMove?: (screenX: number, screenY: number) => void
      endResize?: () => void
      isMaximized?: () => Promise<boolean>
      toggleFullscreen?: () => void
      isFullscreen?: () => Promise<boolean>
      setWindowButtonVisibility?: (visible: boolean) => void
      onMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void
      onFullscreenChange?: (callback: (isFullscreen: boolean) => void) => () => void
      updateTrayPlayerState?: (state: TrayPlayerState) => void
      onTrayPlayerCommand?: (callback: (command: TrayPlayerCommand) => void) => () => void
      openExternal: (url: string) => Promise<void>
      getSystemAccent?: () => string
      searchCovers?: (query: CoverSearchQuery) => Promise<CoverCandidate[]>
      platform: string
      persistentStorage?: PersistentStorageApi
      biliApi: BiliApi
      lyricsApi: LyricsApi
    }
  }
}
