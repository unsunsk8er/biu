import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, CheckSquare, Heart, ListChecks, ListMusic, Music, Play, Plus, Square, Trash2, X } from 'lucide-react'
import { usePlayer } from '@/contexts/PlayerContext'
import { CreatePlaylistDialog } from '@/components/layout/Sidebar'
import { isAndroidApp } from '@/utils/mobile'
import { FAVORITES_CHANGED_EVENT, loadFavoriteTracks, saveFavoriteTracks } from '@/utils/storage'
import { createPlaylist, savePlaylists } from '@/utils/storage'
import AddToPlaylistButton from '@/components/AddToPlaylistButton'
import CoverArtwork from '@/components/CoverArtwork'
import {
  EmptyLibrary,
  MusicHero,
  MusicPageShell,
  MusicSection,
  TrackList,
  TrackListRow,
} from '@/components/AppleMusicPage'
import {
  deletePlaylist,
  getPlaylist,
  loadPlaylists,
  PLAYLISTS_CHANGED_EVENT,
  removeTracksFromPlaylist,
} from '@/utils/storage'
import type { Playlist, Track } from '@/types'

const FAVORITES_PLAYLIST_ID = '__biu_favorites__'

function favoritesPlaylist(tracks: Track[]): Playlist {
  return {
    id: FAVORITES_PLAYLIST_ID,
    name: '我喜欢',
    description: '默认歌单',
    coverUrl: tracks[0]?.coverUrl || '',
    tracks,
    createdAt: '',
    updatedAt: '',
  }
}

export default function Playlists() {
  const { playlistId } = useParams()
  return playlistId ? <PlaylistDetail playlistId={playlistId} /> : <PlaylistOverview />
}

function PlaylistOverview() {
  const [playlists, setPlaylists] = useState<Playlist[]>(() => loadPlaylists())
  const [favorites, setFavorites] = useState<Track[]>(() => loadFavoriteTracks())
  const [creating, setCreating] = useState(false)
  const [managing, setManaging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const navigate = useNavigate()
  const mobile = isAndroidApp()

  useEffect(() => {
    const sync = () => setPlaylists(loadPlaylists())
    const syncFavorites = () => setFavorites(loadFavoriteTracks())
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

  useEffect(() => {
    if (!creating) return
    const onBack = (event: Event) => {
      event.preventDefault()
      setCreating(false)
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [creating])

  useEffect(() => {
    if (!managing && !deleteOpen) return
    const onBack = (event: Event) => {
      event.preventDefault()
      if (deleteOpen) {
        setDeleteOpen(false)
        return
      }
      setManaging(false)
      setSelectedIds(new Set())
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [managing, deleteOpen])

  const defaultFavorites = mobile ? favoritesPlaylist(favorites) : null
  const allPlaylists = defaultFavorites ? [defaultFavorites, ...playlists] : playlists
  const heroImage = allPlaylists.find(p => p.coverUrl)?.coverUrl
  const selectedCount = playlists.reduce((count, playlist) => count + (selectedIds.has(playlist.id) ? 1 : 0), 0)
  const allSelected = playlists.length > 0 && selectedCount === playlists.length
  const selectedIndices = playlists
    .map((playlist, index) => selectedIds.has(playlist.id) ? index : -1)
    .filter(index => index >= 0)
  const canMoveUp = selectedIndices.some(index => index > 0 && !selectedIds.has(playlists[index - 1].id))
  const canMoveDown = selectedIndices.some(index => index < playlists.length - 1 && !selectedIds.has(playlists[index + 1].id))

  const exitManaging = () => {
    setManaging(false)
    setSelectedIds(new Set())
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(playlists.map(playlist => playlist.id)))
  }

  const moveSelected = (direction: -1 | 1) => {
    if (selectedIndices.length === 0) return
    const next = [...playlists]
    if (direction < 0) {
      for (let i = 1; i < next.length; i += 1) {
        if (selectedIds.has(next[i].id) && !selectedIds.has(next[i - 1].id)) {
          [next[i - 1], next[i]] = [next[i], next[i - 1]]
        }
      }
    } else {
      for (let i = next.length - 2; i >= 0; i -= 1) {
        if (selectedIds.has(next[i].id) && !selectedIds.has(next[i + 1].id)) {
          [next[i], next[i + 1]] = [next[i + 1], next[i]]
        }
      }
    }
    if (next.some((playlist, index) => playlist.id !== playlists[index]?.id)) {
      savePlaylists(next)
      setPlaylists(next)
      window.dispatchEvent(new CustomEvent(PLAYLISTS_CHANGED_EVENT))
    }
  }

  const confirmDelete = () => {
    const next = playlists.filter(playlist => !selectedIds.has(playlist.id))
    savePlaylists(next)
    setPlaylists(next)
    setDeleteOpen(false)
    exitManaging()
  }

  return (
    <MusicPageShell>
      <MusicHero
        title="所有歌单"
        subtitle={allPlaylists.length
          ? `共 ${allPlaylists.length} 个歌单 · 默认歌单自动更新`
          : '创建你的第一个歌单'}
        image={heroImage}
        tone="purple"
        className="playlists-overview-hero"
      />

      <MusicSection title="我的歌单" icon={<ListMusic size={22} />}>
        <div className={`playlist-managebar ${managing ? 'is-managing' : ''}`}>
          {managing ? (
            <>
              <span className="playlist-managebar__status">已选择 {selectedCount} 个</span>
              <button type="button" className="playlist-managebar__ghost" onClick={toggleAll}>
                {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                {allSelected ? '取消全选' : '全选'}
              </button>
              <button
                type="button"
                className="playlist-managebar__ghost playlist-managebar__icon"
                onClick={() => moveSelected(-1)}
                disabled={!canMoveUp}
                title="上移"
                aria-label="上移歌单"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="playlist-managebar__ghost playlist-managebar__icon"
                onClick={() => moveSelected(1)}
                disabled={!canMoveDown}
                title="下移"
                aria-label="下移歌单"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                className="playlist-managebar__danger playlist-managebar__icon"
                onClick={() => setDeleteOpen(true)}
                disabled={selectedCount === 0}
                title="删除"
                aria-label="删除歌单"
              >
                <Trash2 size={16} />
              </button>
              <button type="button" className="playlist-managebar__primary" onClick={exitManaging}>
                完成
              </button>
            </>
          ) : (
            <>
              <button type="button" className="playlist-managebar__primary" onClick={() => setCreating(true)}>
                <Plus size={16} />
                新建歌单
              </button>
              <button
                type="button"
                className="playlist-managebar__ghost"
                onClick={() => setManaging(true)}
                disabled={playlists.length === 0}
              >
                <ListChecks size={16} />
                管理
              </button>
            </>
          )}
        </div>

        {allPlaylists.length === 0 ? (
          <EmptyLibrary icon={<ListMusic size={40} />} title="还没有歌单" subtitle="新建歌单后，会立即显示在这里和侧边栏中。" />
        ) : (
          <div className="playlist-grid">
            {allPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                isDefault={playlist.id === FAVORITES_PLAYLIST_ID}
                managing={managing}
                selected={selectedIds.has(playlist.id)}
                onToggle={() => toggleSelected(playlist.id)}
              />
            ))}
          </div>
        )}
      </MusicSection>

      {creating && (
        <CreatePlaylistDialog
          onClose={() => setCreating(false)}
          onCreate={(input) => {
            const playlist = createPlaylist(input)
            setCreating(false)
            navigate(`/playlists/${playlist.id}`)
          }}
        />
      )}

      {deleteOpen && (
        <div className="playlist-dialog-backdrop" onMouseDown={() => setDeleteOpen(false)}>
          <div
            className="playlist-dialog playlist-manage-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="playlist-delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="playlist-dialog__head">
              <div>
                <h3 id="playlist-delete-title">删除歌单</h3>
                <p>确定删除已选择的 {selectedCount} 个歌单吗？此操作不可撤销。</p>
              </div>
              <button type="button" className="playlist-dialog__close" onClick={() => setDeleteOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="playlist-dialog__actions">
              <button type="button" onClick={() => setDeleteOpen(false)}>取消</button>
              <button type="button" className="playlist-managebar__danger" onClick={confirmDelete}>
                <Trash2 size={15} />
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </MusicPageShell>
  )
}

function PlaylistCard({
  playlist,
  isDefault = false,
  managing = false,
  selected = false,
  onToggle,
}: {
  playlist: Playlist
  isDefault?: boolean
  managing?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const cover = playlist.coverUrl || playlist.tracks[0]?.coverUrl
  return (
    <Link
      to={`/playlists/${playlist.id}`}
      className={`playlist-card ${isDefault ? 'is-default' : ''} ${managing ? 'is-managing' : ''} ${selected ? 'is-selected' : ''}`}
      onClick={(event) => {
        if (!managing) return
        event.preventDefault()
        if (!isDefault) onToggle?.()
      }}
    >
      <div className="playlist-card__cover">
        <CoverArtwork src={cover} alt={playlist.name} iconSize={34} fallback={isDefault ? <Heart size={34} /> : <Music size={34} />} />
        {isDefault && <em className="playlist-card__badge">默认</em>}
        {managing && !isDefault && (
          <span className="playlist-card__check" aria-hidden="true">
            {selected ? <CheckSquare size={18} /> : <Square size={18} />}
          </span>
        )}
      </div>
      <div className="playlist-card__body">
        <h3>{playlist.name}</h3>
        <p>{playlist.tracks.length} 首歌曲</p>
        {playlist.description && <span>{playlist.description}</span>}
      </div>
    </Link>
  )
}

function PlaylistDetail({ playlistId }: { playlistId: string }) {
  const isFavorites = isAndroidApp() && playlistId === FAVORITES_PLAYLIST_ID
  const readPlaylist = () => isFavorites ? favoritesPlaylist(loadFavoriteTracks()) : getPlaylist(playlistId)
  const [playlist, setPlaylist] = useState<Playlist | null>(readPlaylist)
  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const player = usePlayer()
  const navigate = useNavigate()

  useEffect(() => {
    const sync = () => setPlaylist(readPlaylist())
    sync()
    window.addEventListener(PLAYLISTS_CHANGED_EVENT, sync)
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PLAYLISTS_CHANGED_EVENT, sync)
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [playlistId, isFavorites])

  useEffect(() => {
    const onBack = (event: Event) => {
      if (editing) {
        event.preventDefault()
        setEditing(false)
        setSelectedIds(new Set())
        return
      }
      if (selectedIds.size > 0) {
        event.preventDefault()
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [editing, selectedIds.size])

  const tracks = playlist?.tracks || []
  const heroImage = playlist?.coverUrl || tracks[0]?.coverUrl
  const updatedText = useMemo(() => {
    if (!playlist?.updatedAt) return ''
    return new Date(playlist.updatedAt).toLocaleDateString()
  }, [playlist?.updatedAt])

  if (!playlist) {
    return (
      <MusicPageShell>
        <EmptyLibrary icon={<ListMusic size={40} />} title="歌单不存在" subtitle="这个歌单可能已经被删除。" />
      </MusicPageShell>
    )
  }

  const handleDelete = () => {
    if (isFavorites) return
    deletePlaylist(playlist.id)
    navigate('/playlists')
  }

  const removeTracks = (trackIds: string[]) => {
    if (isFavorites) {
      const remove = new Set(trackIds)
      saveFavoriteTracks(loadFavoriteTracks().filter(track => !remove.has(track.id)))
      setPlaylist(favoritesPlaylist(loadFavoriteTracks()))
      return
    }
    const updated = removeTracksFromPlaylist(playlist.id, trackIds)
    setPlaylist(updated)
  }

  const removeSelected = () => {
    if (selectedIds.size === 0) return
    removeTracks([...selectedIds])
    setSelectedIds(new Set())
    setEditing(false)
  }

  const removeOne = (trackId: string) => {
    removeTracks([trackId])
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(trackId)
      return next
    })
  }

  const toggleSelected = (trackId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(trackId)) next.delete(trackId)
      else next.add(trackId)
      return next
    })
  }

  const allSelected = tracks.length > 0 && selectedIds.size === tracks.length
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(tracks.map(track => track.id)))
  }

  const toggleEditing = () => {
    setEditing(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  return (
    <MusicPageShell>
      <MusicHero
        title={playlist.name}
        subtitle={playlist.description || `${tracks.length} 首歌曲${updatedText ? ` · 更新于 ${updatedText}` : ''}`}
        image={heroImage}
        tone="purple"
        action={(
          <>
            {tracks.length > 0 && (
              <button className="am-action am-action--primary" onClick={() => player.playAll(tracks)}>
                <Play size={17} fill="currentColor" />
                播放全部
              </button>
            )}
            {!isFavorites && (
              <button className="am-action am-action--subtle" onClick={handleDelete}>
                <Trash2 size={16} />
                删除歌单
              </button>
            )}
          </>
        )}
      />

      {tracks.length === 0 ? (
        <EmptyLibrary icon={isFavorites ? <Heart size={40} /> : <Music size={40} />} title={isFavorites ? '还没有喜欢的歌曲' : '歌单是空的'} subtitle={isFavorites ? '在歌曲上点心形，歌曲会自动出现在这个默认歌单里。' : '歌单已经创建并持久化保存，后续可以把歌曲加入到这里。'} />
      ) : (
        <MusicSection title="歌曲" icon={<Music size={22} />}>
          <div className={`playlist-editbar ${editing ? 'is-editing' : ''}`}>
            <div>
              <span>{editing ? `已选择 ${selectedIds.size} 首` : `${tracks.length} 首歌曲`}</span>
            </div>
            {editing && (
              <button type="button" onClick={toggleAll}>
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                {allSelected ? '取消全选' : '全选'}
              </button>
            )}
            {editing && selectedIds.size > 0 && (
              <button type="button" className="playlist-editbar__danger" onClick={removeSelected}>
                <Trash2 size={16} />
                移出歌单
              </button>
            )}
            <button type="button" className="playlist-editbar__primary" onClick={toggleEditing}>
              {editing ? '完成' : '选择'}
            </button>
          </div>
          <TrackList>
            {tracks.map((track, index) => (
              <TrackListRow
                key={track.id + String(index)}
                track={track}
                index={index + 1}
                isCurrent={player.currentTrack?.id === track.id}
                isPlaying={player.isPlaying}
                onPlay={() => editing ? toggleSelected(track.id) : player.playNow(track)}
                leading={editing ? (
                  <button
                    type="button"
                    className={`playlist-select-button ${selectedIds.has(track.id) ? 'is-selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleSelected(track.id) }}
                    title={selectedIds.has(track.id) ? '取消选择' : '选择'}
                  >
                    {selectedIds.has(track.id) ? <CheckSquare size={17} /> : <Square size={17} />}
                  </button>
                ) : undefined}
                extra={(
                  <div className="am-extra-actions">
                    <AddToPlaylistButton track={track} size={15} />
                    {!editing && (
                      <button className="am-icon-danger" onClick={(e) => { e.stopPropagation(); removeOne(track.id) }} title="移出歌单">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              />
            ))}
          </TrackList>
        </MusicSection>
      )}
    </MusicPageShell>
  )
}
