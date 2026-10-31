import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EASE_OUT, MOTION_FAST, panelTransition } from '@/utils/motion'
import {
  CheckSquare,
  Download,
  HardDrive,
  Loader2,
  Music,
  RefreshCw,
  Square,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react'
import {
  EmptyLibrary,
  MusicHero,
  MusicPageShell,
  MusicSection,
  TrackList,
  TrackListRow,
} from '@/components/AppleMusicPage'
import { usePlayer } from '@/contexts/PlayerContext'
import { useAppSettings } from '@/hooks/useAppSettings'
import ToggleSwitch from '@/components/ToggleSwitch'
import { isMobileApp } from '@/utils/mobile'
import {
  AUDIO_CACHE_CHANGED_EVENT,
  deleteCachedAudio,
  deleteCachedAudios,
  formatAudioSize,
  listCachedAudio,
  type CachedAudioItem,
} from '@/services/audioCache'
import type { Track } from '@/types'

function cachedItemToTrack(item: CachedAudioItem): Track {
  const videoBvid = item.videoBvid || item.bvid
  const page = item.page
  return {
    id: page ? `${videoBvid}:p${page}` : videoBvid,
    title: item.title,
    artist: item.artist,
    coverUrl: item.coverUrl,
    duration: 0,
    videoUrl: page
      ? `https://www.bilibili.com/video/${videoBvid}?p=${page}`
      : `https://www.bilibili.com/video/${videoBvid}`,
    bvid: videoBvid,
    cid: item.cid,
    page,
    partTitle: item.partTitle,
    videoTitle: item.videoTitle,
    playCount: 0,
    isLiked: false,
  }
}

export default function Downloads() {
  const player = usePlayer()
  const { settings, setAppSettings } = useAppSettings()
  const mobile = isMobileApp()
  const [items, setItems] = useState<CachedAudioItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [managing, setManaging] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await listCachedAudio())
      setMessage('')
    } catch {
      setItems([])
      setMessage('无法读取离线下载列表')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const onChange = () => { void load() }
    window.addEventListener(AUDIO_CACHE_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(AUDIO_CACHE_CHANGED_EVENT, onChange)
  }, [load])

  useEffect(() => {
    setSelectedIds(prev => {
      if (prev.size === 0) return prev
      const remaining = new Set([...prev].filter(id => items.some(item => item.bvid === id)))
      return remaining.size === prev.size ? prev : remaining
    })
  }, [items])

  useEffect(() => {
    if (!confirmOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) setConfirmOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmOpen, deleting])

  useEffect(() => {
    const onBack = (event: Event) => {
      if (confirmOpen) {
        event.preventDefault()
        if (!deleting) setConfirmOpen(false)
        return
      }
      if (managing) {
        event.preventDefault()
        setManaging(false)
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('biu:back', onBack)
    return () => window.removeEventListener('biu:back', onBack)
  }, [confirmOpen, deleting, managing])

  const totalSize = items.reduce((sum, item) => sum + item.size, 0)
  const selectedItems = useMemo(
    () => items.filter(item => selectedIds.has(item.bvid)),
    [items, selectedIds],
  )
  const selectedSize = selectedItems.reduce((sum, item) => sum + item.size, 0)
  const allSelected = items.length > 0 && selectedIds.size === items.length

  const toggleManaging = () => {
    if (managing) setSelectedIds(new Set())
    setManaging(!managing)
  }

  const toggleSelected = (bvid: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(bvid)) next.delete(bvid)
      else next.add(bvid)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(items.map(item => item.bvid)))
  }

  const playItem = (item: CachedAudioItem) => {
    player.playNow(cachedItemToTrack(item))
  }

  const removeItem = async (item: CachedAudioItem) => {
    try {
      await deleteCachedAudio(item.bvid)
      await load()
      setMessage('已删除离线音频')
    } catch {
      setMessage('删除失败')
    }
  }

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0 || deleting) return
    setDeleting(true)
    try {
      await deleteCachedAudios(ids)
      await load()
      setSelectedIds(new Set())
      setManaging(false)
      setConfirmOpen(false)
      setMessage(`已删除 ${ids.length} 首离线音频`)
    } catch {
      setConfirmOpen(false)
      setMessage('批量删除失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <MusicPageShell>
      <MusicHero
        title="本地下载"
        subtitle="自动缓存播放歌曲，也可手动下载"
        tone="blue"
        className="downloads-hero"
      />

      <div className="download-dashboard" role="group" aria-label="下载统计">
        <DownloadMetric icon={<Download size={19} />} label="已下载" value={`${items.length} 首`} />
        <DownloadMetric icon={<HardDrive size={19} />} label="占用空间" value={formatAudioSize(totalSize)} />
        <DownloadMetric icon={<WifiOff size={19} />} label="离线可听" value={items.length > 0 ? `${items.length} 首` : '未开始'} />
      </div>

      <MusicSection title="下载列表" icon={<Music size={22} />}>
        <div className="download-list-toolbar">
          {mobile && (
            <label className="download-list-toolbar__cache">
              <span>自动缓存</span>
              <ToggleSwitch
                checked={settings.autoCache}
                onChange={() => setAppSettings({ autoCache: !settings.autoCache })}
                label="自动缓存播放歌曲"
              />
            </label>
          )}
          <button
            type="button"
            className="download-manage-button"
            onClick={toggleManaging}
            disabled={loading || items.length === 0}
          >
            {managing ? '完成' : '管理'}
          </button>
        </div>
        {loading ? (
          <div className="download-empty-shell">
            <div className="download-loading"><Loader2 size={26} className="spin" /> 正在读取离线音乐</div>
          </div>
        ) : items.length === 0 ? (
          <div className="download-empty-shell">
            <EmptyLibrary
              icon={<Download size={40} />}
              title="还没有本地音乐"
              subtitle={mobile ? '播放歌曲会自动缓存；也可以点击“下载当前歌曲”。' : '离线下载当前仅在 Android 端提供，桌面端播放依赖网络。'}
            />
          </div>
        ) : (
          <>
            {managing && (
              <div className="playlist-editbar download-editbar is-editing">
                <div>
                  <span>已选择 {selectedIds.size} 首</span>
                </div>
                <button type="button" onClick={toggleAll}>
                  {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  {allSelected ? '取消全选' : '全选'}
                </button>
                {selectedIds.size > 0 && (
                  <button type="button" className="playlist-editbar__danger" onClick={() => setConfirmOpen(true)}>
                    <Trash2 size={16} />
                    删除
                  </button>
                )}
              </div>
            )}
            <TrackList>
              {items.map((item) => {
                const track = cachedItemToTrack(item)
                const selected = selectedIds.has(item.bvid)
                return (
                  <TrackListRow
                    key={item.bvid}
                    track={track}
                    onPlay={() => managing ? toggleSelected(item.bvid) : playItem(item)}
                    isCurrent={player.currentTrack?.id === track.id}
                    isPlaying={player.isPlaying}
                    leading={managing ? (
                      <button
                        type="button"
                        className={`playlist-select-button ${selected ? 'is-selected' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleSelected(item.bvid)
                        }}
                        title={selected ? '取消选择' : '选择'}
                      >
                        {selected ? <CheckSquare size={17} /> : <Square size={17} />}
                      </button>
                    ) : undefined}
                    extra={managing ? (
                      <span className="download-row-placeholder" aria-hidden="true" />
                    ) : (
                      <button
                        type="button"
                        className="download-delete"
                        title="删除离线音频"
                        onClick={(event) => {
                          event.stopPropagation()
                          void removeItem(item)
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  />
                )
              })}
            </TrackList>
            <div className="download-list-foot">
              <span>{message || (managing ? '选择歌曲后可批量删除' : '离线音频保存在应用内部')}</span>
              <button type="button" onClick={() => { void load() }} title="刷新">
                <RefreshCw size={13} /> 刷新
              </button>
            </div>
          </>
        )}
        {message && items.length === 0 && <div className="download-status">{message}</div>}
      </MusicSection>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            className="playlist-dialog-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_FAST, ease: EASE_OUT }}
            onMouseDown={() => { if (!deleting) setConfirmOpen(false) }}
          >
            <motion.div
              className="playlist-dialog download-confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="download-confirm-title"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={panelTransition}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="playlist-dialog__head">
                <div>
                  <p>Remove downloads</p>
                  <h2 id="download-confirm-title">删除离线音频</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  disabled={deleting}
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="download-confirm__body">
                <span className="download-confirm__icon"><Trash2 size={20} /></span>
                <div>
                  <strong>删除选中的 {selectedIds.size} 首歌曲？</strong>
                  <p>将同时移除本地离线缓存，释放约 {formatAudioSize(selectedSize)}。此操作不可撤销。</p>
                </div>
              </div>
              <div className="playlist-dialog__actions">
                <button type="button" onClick={() => setConfirmOpen(false)} disabled={deleting}>取消</button>
                <button
                  type="button"
                  className="download-confirm__delete"
                  onClick={() => { void deleteSelected() }}
                  disabled={deleting || selectedIds.size === 0}
                >
                  {deleting ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                  {deleting ? '删除中…' : '删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MusicPageShell>
  )
}

function DownloadMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <article className="download-metric">
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  )
}
