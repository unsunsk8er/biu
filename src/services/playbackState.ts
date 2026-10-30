export interface PlaybackStateSnapshot {
  trackId: string
  playing: boolean
  position: number
  duration: number
  at: number
}

/**
 * AVSession progress ticks are intentionally rate-limited. Play/pause/track
 * changes are immediate; position-only updates are flushed once per interval.
 */
export function shouldPushPlaybackState(
  previous: PlaybackStateSnapshot | null,
  next: PlaybackStateSnapshot,
  intervalMs = 900,
): boolean {
  if (!previous) return true
  if (previous.trackId !== next.trackId) return true
  if (previous.playing !== next.playing) return true
  if (next.at - previous.at >= intervalMs) return true
  // A seek can move the playhead much further than elapsed wall time.
  const expected = (next.at - previous.at) / 1000
  return Math.abs(next.position - previous.position) > expected + 0.75
}
