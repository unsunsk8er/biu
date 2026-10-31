import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, X } from 'lucide-react'
import type { VideoDetail } from '@/services/bilibiliApi'
import { MOTION_FAST } from '@/utils/motion'

const PAGE_BATCH = 24

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VideoPartsDialog({
  detail,
  onClose,
  onSelect,
}: {
  detail: VideoDetail | null
  onClose: () => void
  onSelect: (index: number) => void
}) {
  const open = Boolean(detail)
  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH)

  useEffect(() => {
    if (!detail) return
    setVisibleCount(PAGE_BATCH)
  }, [detail?.bvid])

  useEffect(() => {
    if (!open) return
    const onBack = (event: Event) => {
      event.preventDefault()
      // Capture phase: this sheet is the topmost layer. Do not let a page-level
      // back handler also close the author space/search layer underneath it.
      event.stopImmediatePropagation()
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('biu:back', onBack, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('biu:back', onBack, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {detail && (
        <div className="video-parts-layer">
          <motion.div
            className="video-parts-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_FAST }}
            onClick={onClose}
          />
          <motion.section
            className="video-parts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-parts-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: MOTION_FAST }}
            onClick={event => event.stopPropagation()}
          >
            <header className="video-parts-dialog__head">
              <div>
                <span>选择分P</span>
                <h2 id="video-parts-title">{detail.title}</h2>
                <p>共 {detail.pages.length} P · 选择一P开始播放</p>
              </div>
              <button type="button" className="video-parts-close" onClick={onClose} aria-label="关闭">
                <X size={19} />
              </button>
            </header>

            <div
              className="video-parts-list"
              onScroll={event => {
                if (!detail || visibleCount >= detail.pages.length) return
                const list = event.currentTarget
                if (list.scrollTop + list.clientHeight >= list.scrollHeight - 96) {
                  setVisibleCount(count => Math.min(count + PAGE_BATCH, detail.pages.length))
                }
              }}
            >
              {detail.pages.slice(0, visibleCount).map((page, index) => (
                <button
                  type="button"
                  className="video-parts-row"
                  key={`${page.cid}-${index}`}
                  onClick={() => onSelect(index)}
                >
                  <span className="video-parts-index">P{page.page || index + 1}</span>
                  <span className="video-parts-name">{page.part || `第 ${index + 1} P`}</span>
                  <span className="video-parts-duration">{formatDuration(page.duration)}</span>
                  <span className="video-parts-play"><Play size={16} fill="currentColor" /></span>
                </button>
              ))}
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
