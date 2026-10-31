import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

export default function WindowResizeHandles() {
  const active = useRef<ResizeEdge | null>(null)

  const start = (edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    active.current = edge
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Synthetic pointers cannot be captured; the main-process resize still works.
    }
    window.electronAPI?.startResize?.(edge, event.screenX, event.screenY)
  }

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active.current) return
    window.electronAPI?.resizeMove?.(event.screenX, event.screenY)
  }

  const stop = () => {
    if (!active.current) return
    active.current = null
    window.electronAPI?.endResize?.()
  }

  return (
    <div className="window-resize-layer" aria-hidden="true" onPointerUp={stop} onPointerCancel={stop}>
      {HANDLES.map(edge => (
        <div
          key={edge}
          className={`window-resize-handle window-resize-handle--${edge}`}
          onPointerDown={(event) => start(edge, event)}
          onPointerMove={move}
        />
      ))}
    </div>
  )
}
