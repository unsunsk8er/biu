import { useCallback, useEffect, useState } from 'react'
import {
  CloudDownload,
  CloudUpload,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import AppSelect from '@/components/AppSelect'
import {
  FAVORITES_CHANGED_EVENT,
  createPlaylist,
  getPlaylist,
  loadFavoriteTracks,
  loadPlaylists,
  PLAYLISTS_CHANGED_EVENT,
  savePlaylists,
  updatePlaylist,
} from '@/utils/storage'
import {
  createFavoriteFolder,
  favoriteMediaToTrack,
  loadAllFavoriteMedias,
  loadFavoriteFolders,
  pushPlaylistToFavorite,
  syncErrorMessage,
} from '@/services/playlistSync'
import type { BiliFavoriteFolder } from '@/types/electron'
import type { Playlist } from '@/types'

const MAX_FOLDER_TRACKS = 1000
const FAVORITES_PLAYLIST_ID = '__biu_favorites__'
const IMPORT_FOLDER_KEY = 'biu_sync_import_folder'
const TARGET_FOLDER_KEY = 'biu_sync_target_folder'

function readStoredFolder(key: string): string {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}

// Keep every sync selector on the same visual grammar:
// name + full-width parentheses + count/status.
function folderOptionLabel(folder: BiliFavoriteFolder): string {
  return `${folder.title}（${folder.media_count || 0} 个视频）`
}

function playlistOptionLabel(playlist: Playlist): string {
  return `${playlist.name}（${playlist.tracks.length} 首）`
}

export default function PlaylistSyncPanel() {
  const { isLoggedIn, username, avatar, logout, setShowLogin } = useAuth()
  const [folders, setFolders] = useState<BiliFavoriteFolder[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)
  const [foldersError, setFoldersError] = useState('')

  const [importFolderId, setImportFolderId] = useState(() => readStoredFolder(IMPORT_FOLDER_KEY))
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')

  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadPlaylists())
  const [favoriteTracks, setFavoriteTracks] = useState(() => loadFavoriteTracks())
  const [pushPlaylistId, setPushPlaylistId] = useState('')
  const [targetFolderId, setTargetFolderId] = useState(() => readStoredFolder(TARGET_FOLDER_KEY) || 'new')
  const [newFolderName, setNewFolderName] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushStatus, setPushStatus] = useState('')

  const selectImportFolder = useCallback((id: string) => {
    setImportFolderId(id)
    try { localStorage.setItem(IMPORT_FOLDER_KEY, id) } catch { /* ignore quota */ }
  }, [])

  const selectTargetFolder = useCallback((id: string) => {
    setTargetFolderId(id)
    try { localStorage.setItem(TARGET_FOLDER_KEY, id) } catch { /* ignore quota */ }
  }, [])

  const refreshFolders = useCallback(async () => {
    if (!isLoggedIn) return
    setFoldersLoading(true)
    setFoldersError('')
    try {
      const data = await loadFavoriteFolders()
      setFolders(data.folders)
    } catch (error) {
      setFolders([])
      setFoldersError(syncErrorMessage(error))
    } finally {
      setFoldersLoading(false)
    }
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) {
      setFolders([])
      setFoldersError('')
      return
    }
    void refreshFolders()
  }, [isLoggedIn, refreshFolders])

  // Restore the last chosen import folder once the folder list is available;
  // if it disappeared, fall back to the first folder.
  useEffect(() => {
    if (!isLoggedIn || foldersLoading || folders.length === 0) return
    if (folders.some(folder => String(folder.id) === importFolderId)) return
    selectImportFolder(String(folders[0].id))
  }, [folders, foldersLoading, importFolderId, isLoggedIn, selectImportFolder])

  // Keep the last target folder across login/reload; only reset to "new" when
  // that folder no longer exists.
  useEffect(() => {
    if (!isLoggedIn || foldersLoading || folders.length === 0) return
    if (targetFolderId === 'new') return
    if (!folders.some(folder => String(folder.id) === targetFolderId)) {
      selectTargetFolder('new')
    }
  }, [folders, foldersLoading, isLoggedIn, selectTargetFolder, targetFolderId])

  useEffect(() => {
    const sync = () => setPlaylists(loadPlaylists())
    const syncFavorites = () => setFavoriteTracks(loadFavoriteTracks())
    window.addEventListener(PLAYLISTS_CHANGED_EVENT, sync)
    window.addEventListener(FAVORITES_CHANGED_EVENT, syncFavorites)
    window.addEventListener('storage', sync)
    window.addEventListener('storage', syncFavorites)
    return () => {
      window.removeEventListener(PLAYLISTS_CHANGED_EVENT, sync)
      window.removeEventListener(FAVORITES_CHANGED_EVENT, syncFavorites)
      window.removeEventListener('storage', sync)
      window.removeEventListener('storage', syncFavorites)
    }
  }, [])

  // 把「我喜欢」作为虚拟歌单，参与同一套 B 站收藏夹推送流程。
  const favoritesPlaylist: Playlist = {
    id: FAVORITES_PLAYLIST_ID,
    name: '我喜欢',
    description: '收藏的歌曲',
    coverUrl: favoriteTracks[0]?.coverUrl || '',
    tracks: favoriteTracks,
    createdAt: '',
    updatedAt: '',
  }
  const syncSources = favoriteTracks.length > 0 ? [favoritesPlaylist, ...playlists] : playlists

  useEffect(() => {
    if (pushPlaylistId && syncSources.some(playlist => playlist.id === pushPlaylistId)) return
    const first = syncSources.find(playlist => playlist.tracks.length > 0) || syncSources[0]
    setPushPlaylistId(first?.id || '')
    if (first) setNewFolderName(first.name)
  }, [playlists, favoriteTracks, pushPlaylistId])

  const selectedPlaylist = syncSources.find(playlist => playlist.id === pushPlaylistId) || null
  const selectedImportFolder = folders.find(folder => String(folder.id) === importFolderId) || null

  const choosePushPlaylist = (id: string) => {
    setPushPlaylistId(id)
    const next = syncSources.find(playlist => playlist.id === id)
    if (next) setNewFolderName(next.name)
  }

  const importFavoriteFolder = async () => {
    if (!selectedImportFolder || importing) return
    setImporting(true)
    setImportStatus('正在读取 B 站收藏夹…')
    try {
      const medias = await loadAllFavoriteMedias(selectedImportFolder.id, (loaded, page) => {
        setImportStatus(`正在读取第 ${page} 页，已获取 ${loaded} 个视频…`)
      })
      const tracks = medias.map(favoriteMediaToTrack).filter((track): track is NonNullable<typeof track> => Boolean(track))
      const skipped = medias.length - tracks.length
      if (tracks.length === 0) {
        setImportStatus('这个收藏夹没有可导入的视频')
        return
      }

      const now = new Date().toISOString()
      const current = loadPlaylists()
      const existing = current.find(playlist => playlist.bilibiliFolderId === selectedImportFolder.id)
      let targetId = ''
      if (existing) {
        targetId = existing.id
        savePlaylists(current.map(playlist => playlist.id === existing.id
          ? {
              ...playlist,
              tracks,
              coverUrl: playlist.coverUrl || tracks[0]?.coverUrl || '',
              bilibiliFolderTitle: selectedImportFolder.title,
              lastSyncedAt: now,
              updatedAt: now,
            }
          : playlist))
        setImportStatus(`已更新「${existing.name}」：导入 ${tracks.length} 首${skipped ? `，跳过 ${skipped} 个无 bvid 视频` : ''}`)
      } else {
        const names = new Set(current.map(playlist => playlist.name.trim()))
        const name = names.has(selectedImportFolder.title.trim())
          ? `${selectedImportFolder.title}（B站）`
          : selectedImportFolder.title
        const created = createPlaylist({
          name,
          description: `来自 B 站收藏夹「${selectedImportFolder.title}」`,
          coverUrl: tracks[0]?.coverUrl || '',
        })
        targetId = created.id
        savePlaylists(loadPlaylists().map(playlist => playlist.id === created.id
          ? {
              ...playlist,
              tracks,
              bilibiliFolderId: selectedImportFolder.id,
              bilibiliFolderTitle: selectedImportFolder.title,
              lastSyncedAt: now,
              updatedAt: now,
            }
          : playlist))
        setImportStatus(`已导入「${name}」：${tracks.length} 首${skipped ? `，跳过 ${skipped} 个无 bvid 视频` : ''}`)
      }
      setPushPlaylistId(targetId)
      selectTargetFolder(String(selectedImportFolder.id))
    } catch (error) {
      setImportStatus(`导入失败：${syncErrorMessage(error)}`)
    } finally {
      setImporting(false)
    }
  }

  const pushToFavorite = async () => {
    if (!selectedPlaylist || pushing) return
    if (selectedPlaylist.tracks.length === 0) {
      setPushStatus('这个歌单还没有歌曲')
      return
    }
    if (selectedPlaylist.tracks.length > MAX_FOLDER_TRACKS) {
      setPushStatus(`B 站单个收藏夹最多支持 ${MAX_FOLDER_TRACKS} 个稿件，请先精简歌单`)
      return
    }

    setPushing(true)
    setPushStatus('正在准备 B 站收藏夹…')
    try {
      let folderId = Number(targetFolderId)
      let folderTitle = folders.find(folder => folder.id === folderId)?.title || ''
      if (targetFolderId === 'new') {
        const title = (newFolderName.trim() || selectedPlaylist.name).slice(0, 40)
        const created = await createFavoriteFolder(title)
        folderId = created.id
        folderTitle = created.title
        setPushStatus(`已创建收藏夹「${folderTitle}」，开始推送…`)
        void refreshFolders()
      }
      if (!folderId || folderId <= 0) throw new Error('请选择或创建一个 B 站收藏夹')

      const result = await pushPlaylistToFavorite(folderId, selectedPlaylist, (done, total) => {
        setPushStatus(`正在推送 ${done}/${total} 首…`)
      })
      if (selectedPlaylist.id !== FAVORITES_PLAYLIST_ID) {
        const current = getPlaylist(selectedPlaylist.id)
        if (current) {
          updatePlaylist({
            ...current,
            bilibiliFolderId: folderId,
            bilibiliFolderTitle: folderTitle,
            lastSyncedAt: new Date().toISOString(),
          })
        }
      }
      setPushStatus(`推送完成：新增 ${result.added} 首${result.skipped ? `，跳过 ${result.skipped} 首` : ''}`)
      void refreshFolders()
    } catch (error) {
      setPushStatus(`推送失败：${syncErrorMessage(error)}`)
    } finally {
      setPushing(false)
    }
  }

  const accountRow = (
    <div className="playlist-sync__login">
      <div className="playlist-sync__login-avatar">
        {avatar && isLoggedIn ? <img src={avatar} alt="" loading="lazy" decoding="async" /> : <UserRound size={18} />}
      </div>
      <div className="playlist-sync__login-identity">
        <strong>{isLoggedIn ? username : '未登录'}</strong>
        <p>{isLoggedIn ? '已登录 B 站' : '登录后可同步 B 站收藏夹'}</p>
      </div>
      <button
        type="button"
        className={isLoggedIn ? 'is-secondary' : ''}
        onClick={() => { if (isLoggedIn) void logout(); else setShowLogin(true) }}
      >
        {isLoggedIn ? <LogOut size={14} /> : <LogIn size={14} />}
        {isLoggedIn ? '退出' : '扫码登录'}
      </button>
    </div>
  )

  if (!isLoggedIn) {
    return (
      <div className="playlist-sync">
        {accountRow}
      </div>
    )
  }

  return (
    <div className="playlist-sync is-signed-in">
      {accountRow}
      <section className="playlist-sync__block playlist-sync__block--import">
        <div className="playlist-sync__head">
          <div>
            <div className="playlist-sync__head-title">
              <strong><CloudDownload size={15} /> 从 B 站收藏夹导入</strong>
              <button
                type="button"
                className="playlist-sync__ghost"
                onClick={() => void refreshFolders()}
                disabled={foldersLoading}
                title="刷新收藏夹"
              >
                <RefreshCw size={14} className={foldersLoading ? 'spin' : ''} />
              </button>
            </div>
            <p>再次导入同一收藏夹会更新对应歌单，不会重复创建。</p>
          </div>
        </div>
        <div className="playlist-sync__row">
          <span className="playlist-sync__field-label">收藏夹</span>
          <AppSelect
            value={importFolderId}
            onChange={selectImportFolder}
            options={folders.map(folder => ({
              value: String(folder.id),
              label: folderOptionLabel(folder),
            }))}
            placeholder="暂无收藏夹（0 个视频）"
            disabled={foldersLoading || folders.length === 0}
            ariaLabel="选择收藏夹"
          />
          <button
            type="button"
            className="playlist-sync__button playlist-sync__button--primary"
            onClick={() => void importFavoriteFolder()}
            disabled={importing || !selectedImportFolder}
          >
            {importing ? <Loader2 size={14} className="spin" /> : <CloudDownload size={14} />}
            {importing ? '导入中…' : '导入'}
          </button>
        </div>
        {foldersError && <div className="playlist-sync__status is-error">{foldersError}</div>}
        {importStatus && <div className="playlist-sync__status">{importStatus}</div>}
      </section>

      <div className="playlist-sync__divider" />

      <section className="playlist-sync__block playlist-sync__block--push">
        <div className="playlist-sync__head">
          <div>
            <div className="playlist-sync__head-title">
              <strong><CloudUpload size={15} /> 把本地歌单推送到 B 站</strong>
            </div>
            <p>只新增收藏，不会删除 B 站收藏夹里已有的内容。</p>
          </div>
        </div>
        <div className="playlist-sync__row">
          <span className="playlist-sync__field-label">歌单</span>
          <AppSelect
            value={pushPlaylistId}
            onChange={choosePushPlaylist}
            options={syncSources.map(playlist => ({
              value: playlist.id,
              label: playlistOptionLabel(playlist),
            }))}
            placeholder="暂无本地歌单（0 首）"
            disabled={pushing || syncSources.length === 0}
            ariaLabel="选择本地歌单"
          />
        </div>
        <div className="playlist-sync__row">
          <span className="playlist-sync__field-label">目标</span>
          <AppSelect
            value={targetFolderId}
            onChange={selectTargetFolder}
            options={[
              { value: 'new', label: '新建 B 站收藏夹（未创建）' },
              ...folders.map(folder => ({
                value: String(folder.id),
                label: folderOptionLabel(folder),
              })),
            ]}
            disabled={pushing}
            ariaLabel="选择目标收藏夹"
          />
          <button
            type="button"
            className="playlist-sync__button playlist-sync__button--primary"
            onClick={() => void pushToFavorite()}
            disabled={pushing || !selectedPlaylist}
          >
            {pushing ? <Loader2 size={14} className="spin" /> : <CloudUpload size={14} />}
            {pushing ? '推送中…' : '推送'}
          </button>
        </div>
        {targetFolderId === 'new' && (
          <div className="playlist-sync__row playlist-sync__row--name">
            <span className="playlist-sync__field-label">名称</span>
            <input
              className="playlist-sync__input"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="新收藏夹名称（最多 40 字）"
              maxLength={40}
              disabled={pushing}
            />
          </div>
        )}
        {pushStatus && <div className="playlist-sync__status">{pushStatus}</div>}
      </section>
    </div>
  )
}
