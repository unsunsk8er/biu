import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LyricLine } from '@/services/lyrics'

interface LyricsViewProps {
  lines: LyricLine[]
  currentTime: number
  synced: boolean
  onSeek: (time: number) => void
}

interface LyricRowProps {
  index: number
  text: string
  time: number
  active: boolean
  near: boolean
  registerRef: (index: number, el: HTMLDivElement | null) => void
  onSeek: (time: number) => void
}

// 二分：返回最后一个 time <= t 的下标
function activeIndexFor(lines: LyricLine[], t: number): number {
  let lo = 0
  let hi = lines.length - 1
  let res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) {
      res = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return res
}

// 行组件只在 active/near 改变时重渲染；播放进度每 250ms 更新时不会重建
// 整页歌词，也不会对每行文字执行 blur 滤镜（移动端开销很大）。
const LyricRow = memo(function LyricRow({
  index, text, time, active, near, registerRef, onSeek,
}: LyricRowProps) {
  const setRef = useCallback((el: HTMLDivElement | null) => {
    registerRef(index, el)
  }, [index, registerRef])

  return (
    <div
      ref={setRef}
      onClick={() => onSeek(time)}
      style={{
        opacity: active ? 1 : near ? 0.46 : 0.22,
        transform: `translateX(${active ? 8 : near ? 3 : 0}px) scale(${active ? 1.04 : near ? 1.01 : 0.985})`,
        transformOrigin: 'left center',
        transition: 'opacity 180ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1), color 180ms ease',
        cursor: 'pointer',
        color: active ? 'var(--np-lyric-active, #fff)' : 'var(--np-lyric-color, #fff)',
        fontSize: 'clamp(1.15rem, 1.7vw, 1.95rem)',
        fontWeight: 700,
        lineHeight: 1.48,
        padding: '9px 6px',
        margin: 0,
        textShadow: active ? 'var(--np-lyric-shadow, 0 8px 34px rgba(0,0,0,0.44))' : 'none',
      }}
    >
      {text}
    </div>
  )
})

export default function LyricsView({ lines, currentTime, synced, onSeek }: LyricsViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLDivElement | null)[]>([])
  const userScrollingRef = useRef(false)
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [showScrollbar, setShowScrollbar] = useState(false)

  const active = synced ? activeIndexFor(lines, currentTime) : -1
  const posIndex = Math.max(active, 0)

  const registerLineRef = useCallback((index: number, el: HTMLDivElement | null) => {
    lineRefs.current[index] = el
  }, [])

  const scrollActiveLineIntoView = () => {
    const vp = viewportRef.current
    const el = lineRefs.current[posIndex]
    if (!vp || !el) return
    const nextTop = el.offsetTop + el.offsetHeight / 2 - vp.clientHeight / 2
    vp.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }

  // 当前行变化 → 自动滚动到视口中间；用户手动滚动时短暂让出控制权。
  useLayoutEffect(() => {
    if (!synced) return
    if (userScrollingRef.current) return
    scrollActiveLineIntoView()
  }, [posIndex, lines, synced])

  useEffect(() => {
    if (!synced) return
    const recompute = () => scrollActiveLineIntoView()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [posIndex, synced])

  useEffect(() => {
    return () => {
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current)
    }
  }, [])

  const markUserScrolling = () => {
    userScrollingRef.current = true
    setShowScrollbar(true)
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current)
    userScrollTimerRef.current = setTimeout(() => {
      userScrollingRef.current = false
      setShowScrollbar(false)
    }, 2600)
  }

  const fade = 'linear-gradient(to bottom, transparent 0%, #000 13%, #000 84%, transparent 100%)'

  // 无时间戳：静态可滚动列表。不再对每行做入场动画，减少打开歌词页的首帧开销。
  if (!synced) {
    return (
      <div
        className={`lyrics-scroll ${showScrollbar ? 'is-scrolling' : ''}`}
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          maskImage: fade,
          WebkitMaskImage: fade,
          padding: '12% 4px',
        }}
      >
        {lines.map((l, i) => (
          <p
            key={i}
            style={{
              fontSize: 'clamp(1.05rem, 1.4vw, 1.5rem)',
              fontWeight: 720,
              lineHeight: 1.7,
              color: 'var(--np-lyric-color, rgba(255,255,255,0.72))',
              margin: '0 0 6px',
            }}
          >
            {l.text}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={viewportRef}
      className={`lyrics-scroll ${showScrollbar ? 'is-scrolling' : ''}`}
      onWheel={markUserScrolling}
      onTouchMove={markUserScrolling}
      style={{
        position: 'relative',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    >
      <div style={{ padding: '36% 0' }}>
        {lines.map((l, i) => {
          const isActive = i === active
          const distance = Math.abs(i - posIndex)
          return (
            <LyricRow
              key={i}
              index={i}
              text={l.text}
              time={l.time}
              active={isActive}
              near={distance === 1}
              registerRef={registerLineRef}
              onSeek={onSeek}
            />
          )
        })}
      </div>
    </div>
  )
}
