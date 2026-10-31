import { describe, expect, it } from 'vitest'
import { shouldPushPlaybackState, type PlaybackStateSnapshot } from './playbackState'

const base: PlaybackStateSnapshot = {
  trackId: 'track-1',
  playing: true,
  position: 10,
  duration: 200,
  at: 1000,
}

describe('shouldPushPlaybackState', () => {
  it('pushes the first state and immediate play/pause or track changes', () => {
    expect(shouldPushPlaybackState(null, base)).toBe(true)
    expect(shouldPushPlaybackState(base, { ...base, playing: false, at: 1100 })).toBe(true)
    expect(shouldPushPlaybackState(base, { ...base, trackId: 'track-2', at: 1100 })).toBe(true)
  })

  it('throttles ordinary progress ticks below the interval', () => {
    expect(shouldPushPlaybackState(base, { ...base, position: 10.5, at: 1500 })).toBe(false)
  })

  it('flushes after the interval elapses', () => {
    expect(shouldPushPlaybackState(base, { ...base, position: 11, at: 1900 })).toBe(true)
  })

  it('flushes an obvious seek immediately', () => {
    expect(shouldPushPlaybackState(base, { ...base, position: 90, at: 1200 })).toBe(true)
  })
})
