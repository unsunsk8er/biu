export interface Track {
  id: string
  title: string
  artist: string
  coverUrl: string
  // 已通过第三方曲库匹配到专辑封面；后续音频源不再用视频截图覆盖
  coverMatched?: boolean
  // 已通过第三方曲库匹配到歌名/歌手；自动匹配只执行一次
  metadataMatched?: boolean
  duration: number
  videoUrl: string
  bvid: string
  // 音乐中心曲目的顶层 avid+cid：当 bvid 稿件不存在（-404）时回退直取音乐流
  aid?: string | number
  cid?: string | number
  // 多P视频的分P信息；单P视频保持 undefined，兼容旧缓存/队列。
  page?: number
  partTitle?: string
  videoTitle?: string
  playCount: number
  isLiked: boolean
  likedAt?: string // 收藏时间
}

export interface Playlist {
  id: string
  name: string
  description?: string
  coverUrl: string
  tracks: Track[]
  createdAt: string
  updatedAt: string
  // 来自 / 已推送到 B 站收藏夹时记录来源，重复导入会更新同一歌单。
  bilibiliFolderId?: number
  bilibiliFolderTitle?: string
  lastSyncedAt?: string
}

export type ThemeMode = 'light' | 'dark'
export type RepeatMode = 'none' | 'one' | 'all'
export type SidebarState = 'expanded' | 'collapsed' | 'auto'

export interface AppSettings {
  sidebarState: SidebarState
  playQuality: '标准' | '高品质' | '无损'
  autoCache: boolean
  showLyrics: boolean
  autoMatchCover: boolean
}

export type NavItem = {
  icon: string
  label: string
  path: string
}

export interface UserInfo {
  isLogin: boolean
  mid: number
  uname: string
  face: string
  vipType: number
  vipStatus: number
}
