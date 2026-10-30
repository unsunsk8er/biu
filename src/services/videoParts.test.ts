import { describe, expect, it } from 'vitest'
import type { VideoDetail } from '@/services/bilibiliApi'
import { videoPageTracks } from './videoParts'

function detail(overrides: Partial<VideoDetail> = {}): VideoDetail {
  return {
    bvid: 'BV1test',
    aid: 100,
    title: 'Test Video',
    desc: '',
    pic: '//i0.hdslb.com/cover.jpg',
    owner: { mid: 7, name: 'Uploader', face: '' },
    stat: { view: 1234, danmaku: 5, like: 6, coin: 7, favorite: 8, share: 9 },
    duration: 120,
    cid: 1,
    videos: 1,
    pages: [{ page: 1, cid: 1, part: 'Full', duration: 120 }],
    pubdate: 0,
    ...overrides,
  }
}

describe('videoPageTracks', () => {
  it('keeps a single-page video as one track without a page suffix', () => {
    const [track] = videoPageTracks(detail())

    expect(track.id).toBe('BV1test')
    expect(track.title).toBe('Test Video')
    expect(track.page).toBeUndefined()
    expect(track.videoUrl).toBe('https://www.bilibili.com/video/BV1test')
    expect(track.coverUrl).toBe('https://i0.hdslb.com/cover.jpg')
    expect(track.playCount).toBe(1234)
  })

  it('splits multi-P videos into independent queue entries', () => {
    const tracks = videoPageTracks(detail({
      videos: 2,
      pages: [
        { page: 1, cid: 11, part: 'Opening', duration: 30 },
        { page: 2, cid: 22, part: 'Finale', duration: 90 },
      ],
    }))

    expect(tracks.map((track) => track.id)).toEqual(['BV1test:p1', 'BV1test:p2'])
    expect(tracks.map((track) => track.title)).toEqual(['P1 · Opening', 'P2 · Finale'])
    expect(tracks.map((track) => track.cid)).toEqual([11, 22])
    expect(tracks.map((track) => track.page)).toEqual([1, 2])
    expect(tracks[1].videoUrl).toBe('https://www.bilibili.com/video/BV1test?p=2')
  })

  it('falls back to the video-level cid when pages are missing', () => {
    const [track] = videoPageTracks(detail({ pages: [] }))
    expect(track.id).toBe('BV1test')
    expect(track.cid).toBe(1)
    expect(track.duration).toBe(120)
  })
})
