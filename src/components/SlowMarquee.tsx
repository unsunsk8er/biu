import { useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Slow marquee for long track titles/artists. It measures its own viewport and
 * only animates when the text is wider than the available space.
 */
export default function SlowMarquee({ text }: { text: string }) {
  const viewportRef = useRef<HTMLSpanElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const textEl = textRef.current
    if (!viewport || !textEl) return
    const measure = () => {
      setOverflowing(textEl.scrollWidth > viewport.clientWidth + 2)
    }
    measure()
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null
    observer?.observe(viewport)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [text])

  const duration = Math.min(48, Math.max(18, Math.ceil(text.length * 0.8)))
  return (
    <span
      ref={viewportRef}
      className={`slow-marquee ${overflowing ? 'is-overflowing' : ''}`}
      style={{ '--marquee-duration': `${duration}s` } as CSSProperties}
    >
      <span className="slow-marquee__track">
        <span ref={textRef} className="slow-marquee__item">{text}</span>
        {overflowing && <span className="slow-marquee__item" aria-hidden="true">{text}</span>}
      </span>
    </span>
  )
}
