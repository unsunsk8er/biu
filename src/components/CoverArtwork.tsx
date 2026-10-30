import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Music } from 'lucide-react'

interface CoverArtworkProps {
  src?: string | null
  alt?: string
  className?: string
  style?: CSSProperties
  loading?: 'eager' | 'lazy'
  decoding?: 'async' | 'sync' | 'auto'
  iconSize?: number
  fallback?: ReactNode
}

/**
 * A cover image that can never leave an empty/broken image box behind.
 * Empty URLs and network/decode errors are rendered as a local gradient +
 * music glyph, so an offline or expired CDN still produces a finished tile.
 */
export default function CoverArtwork({
  src,
  alt = '',
  className,
  style,
  loading = 'lazy',
  decoding = 'async',
  iconSize = 20,
  fallback,
}: CoverArtworkProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <span
        className={`cover-artwork-fallback${className ? ` ${className}` : ''}`}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        role="img"
        aria-label={alt || '暂无封面'}
      >
        {fallback ?? <Music size={iconSize} strokeWidth={1.6} />}
      </span>
    )
  }

  return (
    <img
      className={className}
      style={style}
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
