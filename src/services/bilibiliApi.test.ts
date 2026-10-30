import { describe, expect, it } from 'vitest'
import {
  md5,
  orderedAudioStreams,
  signWbiQuery,
  type AudioStream,
  type PlayUrlData,
} from './bilibiliApi'

function stream(quality: number, bandwidth: number): AudioStream {
  return {
    id: quality,
    quality,
    bandwidth,
    mimeType: 'audio/mp4',
    codecid: 0,
    baseUrl: `https://example.com/${quality}`,
    backupUrl: [],
  }
}

function playData(streams: AudioStream[]): PlayUrlData {
  return { quality: 0, format: 'dash', dash: { audio: streams, video: [] } }
}

describe('md5', () => {
  it('matches known RFC 1321 vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    )
  })
})

describe('signWbiQuery', () => {
  const imgKey = '7cd084941338484aae1ad9425b84077c'
  const subKey = '4932caff0ff746eab6f01bf08b70ac45'

  it('sorts params, strips forbidden chars and appends wts/w_rid', () => {
    const query = signWbiQuery({ z: 1, keyword: "a!'()*b", foo: 'bar' }, imgKey, subKey, 1_700_000_000)
    expect(query).toMatch(/^foo=bar&keyword=ab&wts=1700000000&z=1&w_rid=[0-9a-f]{32}$/)
  })

  it('is deterministic and changes with the timestamp', () => {
    const a = signWbiQuery({ keyword: '夜曲' }, imgKey, subKey, 1_700_000_000)
    const b = signWbiQuery({ keyword: '夜曲' }, imgKey, subKey, 1_700_000_000)
    const c = signWbiQuery({ keyword: '夜曲' }, imgKey, subKey, 1_700_000_001)
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })
})

describe('orderedAudioStreams', () => {
  it('prefers the selected quality tier', () => {
    const data = playData([stream(30280, 200_000), stream(30216, 64_000)])
    expect(orderedAudioStreams(data, '标准').map((s) => s.quality)).toEqual([30216, 30280])
    expect(orderedAudioStreams(data, '高品质').map((s) => s.quality)).toEqual([30280, 30216])
  })

  it('falls back through the lossless ladder', () => {
    const data = playData([stream(30280, 200_000), stream(30250, 300_000), stream(30251, 900_000)])
    expect(orderedAudioStreams(data, '无损').map((s) => s.quality)).toEqual([30251, 30250, 30280])
  })

  it('uses bandwidth as the tie-breaker for unknown qualities', () => {
    const data = playData([stream(999, 100_000), stream(998, 400_000)])
    expect(orderedAudioStreams(data, '高品质').map((s) => s.quality)).toEqual([998, 999])
  })

  it('throws when the response has no audio stream', () => {
    expect(() => orderedAudioStreams(playData([]), '高品质')).toThrow('No audio stream available')
  })
})
