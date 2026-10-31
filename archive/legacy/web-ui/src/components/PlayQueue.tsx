import { useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  X,
  Trash2,
  GripVertical,
  Music,
  Play,
  ListStart,
  ListChecks,
  ListPlus,
  Check,
} from 'lucide-react'
import { usePlayer } from '@/contexts/PlayerContext'
import CoverArtwork from '@/components/CoverArtwork'
import { useAddToPlaylist } from '@/contexts/AddToPlaylistContext'
import type { Track } from '@/types'
import { MOTION_FAST, panelTransition, springPanel } from '@/utils/motion'

export default function PlayQueue({
  open,
  onClose,
  heading = '播放队列',
  zIndex = 60,
  placement = 'player-bar',
}: {
  open: boolean
  onClose: () => void
  heading?: string
  zIndex?: number
  placement?: 'player-bar' | 'now-playing'
}) {
  const player = usePlayer()
  const { openAddToPlaylist } = useAddToPlaylist()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const queue = player.queue
  const currentId = player.currentTrack?.id
  const selectableIds = queue.filter(t => t.id !== currentId).map(t => t.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const toggleSelectMode = () => {
    if (selecting) exitSelect()
    else setSelecting(true)
  }

  const toggleSelect = (id: string) => {
    if (id === currentId) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(selectableIds))
  }

  const removeSelected = () => {
    if (selected.size === 0) return
    player.removeMultipleFromQueue([...selected])
    exitSelect()
  }

  const onDrop = (toIndex: number) => {
    if (dragIndex !== null && dragIndex !== toIndex) {
      player.moveInQueue(dragIndex, toIndex)
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_FAST }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex,
              background: 'transparent',
            }}
          />

          <motion.div
            className={`am-queue-panel is-${placement}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={panelTransition}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              right: 16,
              bottom: 82,
              width: 380,
              maxHeight: '65vh',
              zIndex: zIndex + 1,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 6,
              background: 'var(--queue-bg)',
              border: '1px solid var(--queue-border)',
              boxShadow: 'var(--queue-shadow)',
              overflow: 'hidden',
              color: 'var(--queue-text)',
              fontFamily: 'var(--font-body)',
            } as CSSProperties}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 12px',
                borderBottom: '1px solid var(--queue-divider)',
                background: 'var(--queue-header-bg)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--queue-text)' }}>
                  {heading}
                </span>
                <span
                  style={{
                    color: 'var(--queue-text-3)',
                    fontSize: 10,
                    fontWeight: 400,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {queue.length} 首歌曲
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <IconButton
                  title={selecting ? '退出多选' : '多选'}
                  active={selecting}
                  disabled={queue.length === 0}
                  onClick={toggleSelectMode}
                >
                  <ListChecks size={17} />
                </IconButton>
                <IconButton
                  title="清空队列"
                  disabled={queue.length === 0}
                  danger
                  onClick={() => {
                    player.clearQueue()
                    exitSelect()
                  }}
                >
                  <Trash2 size={17} />
                </IconButton>
                <div style={{ width: 1, height: 16, background: 'var(--queue-divider)', margin: '0 3px' }} />
                <IconButton title="关闭" onClick={onClose}>
                  <X size={19} />
                </IconButton>
              </div>
            </div>

            <div
              className="sidebar-scroll"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 8,
              }}
            >
              {queue.length === 0 ? (
                <EmptyQueue />
              ) : (
                <AnimatePresence initial={false}>
                  {queue.map((track, index) => (
                    <motion.div
                      key={track.id}
                      layout="position"
                      initial={{ opacity: 0, height: 0, y: 4 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={{ opacity: 0, height: 0, y: -3 }}
                      transition={{
                        opacity: { duration: MOTION_FAST },
                        height: { duration: MOTION_FAST },
                        layout: springPanel,
                      }}
                    >
                      <QueueRow
                        track={track}
                        isCurrent={track.id === currentId}
                        isPlaying={track.id === currentId && player.isPlaying}
                        selecting={selecting}
                        selected={selected.has(track.id)}
                        isDragOver={overIndex === index && dragIndex !== null && dragIndex !== index}
                        onPlay={() => player.play(track)}
                        onSelect={() => toggleSelect(track.id)}
                        onPlayNext={() => player.playNext(track)}
                        onAddToPlaylist={() => openAddToPlaylist(track)}
                        onRemove={() => player.removeFromQueue(track.id)}
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={() => setOverIndex(index)}
                        onDrop={() => onDrop(index)}
                        onDragEnd={() => {
                          setDragIndex(null)
                          setOverIndex(null)
                        }}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            <AnimatePresence>
              {selecting && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: MOTION_FAST }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '11px 18px',
                    borderTop: '1px solid var(--queue-divider)',
                    background: 'var(--queue-footer-bg)',
                    overflow: 'hidden',
                  }}
                >
                  <TextButton onClick={toggleSelectAll} disabled={selectableIds.length === 0}>
                    {allSelected ? '取消全选' : '全选'}
                  </TextButton>
                  <span
                    style={{
                      color: 'var(--queue-text-3)',
                      fontSize: 12,
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    已选 {selected.size} 项
                  </span>
                  <motion.button
                    type="button"
                    onClick={removeSelected}
                    disabled={selected.size === 0}
                    whileTap={selected.size === 0 ? undefined : { scale: 0.95 }}
                    style={{
                      height: 30,
                      padding: '0 14px',
                      border: 'none',
                      borderRadius: 999,
                      background: selected.size === 0 ? 'var(--queue-row-active)' : 'var(--plasma-accent)',
                      color: selected.size === 0 ? 'var(--queue-text-4)' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: 'none',
                    }}
                  >
                    <Trash2 size={15} /> 移除
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function QueueRow({
  track,
  isCurrent,
  isPlaying,
  selecting,
  selected,
  isDragOver,
  onPlay,
  onSelect,
  onPlayNext,
  onAddToPlaylist,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  track: Track
  isCurrent: boolean
  isPlaying: boolean
  selecting: boolean
  selected: boolean
  isDragOver: boolean
  onPlay: () => void
  onSelect: () => void
  onPlayNext: () => void
  onAddToPlaylist: () => void
  onRemove: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <motion.div
      draggable={!selecting}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDragEnd={onDragEnd}
      onClick={selecting ? onSelect : onPlay}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      whileHover={{ backgroundColor: selected || isCurrent ? 'var(--queue-row-hover-strong)' : 'var(--queue-row-hover)' }}
      whileTap={{ scale: 0.992 }}
      transition={{ duration: MOTION_FAST }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
        padding: '6px 7px',
        borderRadius: 4,
        background: selected || isCurrent ? 'var(--queue-row-active)' : 'transparent',
        borderTop: isDragOver ? '2px solid var(--plasma-accent)' : '2px solid transparent',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {selecting ? (
          <SelectionBox selected={selected} disabled={isCurrent} />
        ) : isCurrent ? (
          <Equalizer active={isPlaying} />
        ) : (
          <motion.span
            animate={{ opacity: hover ? 1 : 0, x: hover ? 0 : -2 }}
            transition={{ duration: MOTION_FAST }}
            style={{ color: 'var(--queue-text-3)', display: 'flex', cursor: 'grab' }}
            title="拖拽调整顺序"
          >
            <GripVertical size={16} />
          </motion.span>
        )}
      </div>

      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 3,
          background: 'var(--queue-cover-bg)',
          border: '1px solid var(--queue-cover-border)',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          boxShadow: 'none',
        }}
      >
        <CoverArtwork
          src={track.coverUrl}
          alt={track.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          iconSize={16}
        />
        <motion.div
          animate={{ opacity: hover ? 1 : 0 }}
          transition={{ duration: MOTION_FAST }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!isCurrent && <Play size={16} fill="currentColor" style={{ color: '#fff', marginLeft: 1 }} />}
        </motion.div>
      </div>

      <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
        <div
          style={{
            color: isCurrent ? '#ff4f7a' : 'var(--queue-text)',
            fontSize: 13,
            fontWeight: isCurrent ? 700 : 600,
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'color 160ms ease',
          }}
        >
          {track.title}
        </div>
        <div
          style={{
            marginTop: 4,
            color: hover ? 'var(--queue-text-2)' : 'var(--queue-text-3)',
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            transition: 'color 160ms ease',
          }}
        >
          {track.artist}
        </div>
      </div>

      <AnimatePresence>
        {!selecting && hover && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: MOTION_FAST }}
            style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}
          >
            <IconButton
              title="添加至歌单"
              onClick={(e) => {
                e.stopPropagation()
                onAddToPlaylist()
              }}
            >
              <ListPlus size={16} />
            </IconButton>
            {!isCurrent && (
              <IconButton
                title="下一首播放"
                onClick={(e) => {
                  e.stopPropagation()
                  onPlayNext()
                }}
              >
                <ListStart size={16} />
              </IconButton>
            )}
            <IconButton
              title="从队列移除"
              danger
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 size={16} />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Equalizer({ active }: { active: boolean }) {
  const bars = [
    { duration: 0.78, values: ['4px', '13px', '5px'] },
    { duration: 0.92, values: ['11px', '4px', '12px'] },
    { duration: 0.68, values: ['6px', '14px', '6px'] },
  ]

  return (
    <div style={{ height: 16, display: 'flex', alignItems: 'end', gap: 2 }}>
      {bars.map((bar, index) => (
        <motion.span
          key={index}
          animate={active ? { height: bar.values } : { height: '5px' }}
          transition={{ repeat: active ? Infinity : 0, duration: bar.duration, ease: 'easeInOut' }}
          style={{
            width: 3,
            borderRadius: 2,
            background: 'var(--plasma-accent)',
            boxShadow: 'none',
          }}
        />
      ))}
    </div>
  )
}

function SelectionBox({ selected, disabled }: { selected: boolean; disabled: boolean }) {
  return (
    <motion.span
      animate={{
        backgroundColor: selected ? 'var(--plasma-accent)' : 'var(--queue-selbox-bg)',
        borderColor: selected ? 'var(--plasma-accent)' : 'var(--queue-selbox-border)',
      }}
      style={{
        width: 16,
        height: 16,
        borderRadius: 3,
        border: '1px solid var(--queue-selbox-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {selected && <Check size={12} strokeWidth={3} style={{ color: '#fff' }} />}
    </motion.span>
  )
}

function EmptyQueue() {
  return (
    <div
      style={{
        minHeight: 190,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        color: 'var(--queue-text-3)',
      }}
    >
      <Music size={38} strokeWidth={1.2} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>队列为空</span>
    </div>
  )
}

function IconButton({
  children,
  title,
  active = false,
  disabled = false,
  danger = false,
  onClick,
}: {
  children: ReactNode
  title: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const activeColor = danger ? 'var(--color-destructive)' : 'var(--plasma-accent)'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      whileHover={disabled ? undefined : {
        backgroundColor: danger ? 'rgba(218, 68, 83, 0.13)' : 'var(--queue-row-hover-strong)',
        color: danger ? 'var(--color-destructive)' : 'var(--queue-text)',
      }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={{ duration: MOTION_FAST }}
      style={{
        width: 26,
        height: 26,
        padding: 0,
        borderRadius: 4,
        border: 'none',
        background: active ? 'var(--color-primary-light)' : 'transparent',
        color: disabled ? 'var(--queue-text-4)' : active ? activeColor : 'var(--queue-icon)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </motion.button>
  )
}

function TextButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: 0,
        background: 'none',
        border: 'none',
        color: disabled ? 'var(--queue-text-4)' : '#ff4f7a',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}
