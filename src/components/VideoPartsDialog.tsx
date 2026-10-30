import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, X } from 'lucide-react'
import type { VideoDetail } from '@/services/bilibiliApi'

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
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.section
            className="video-parts-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="video-parts-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
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

            <div className="video-parts-list">
              {detail.pages.map((page, index) => (
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
