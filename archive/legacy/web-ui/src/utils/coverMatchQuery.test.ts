import { describe, expect, it } from 'vitest'
import { inferCoverQueries } from './coverMatchQuery'

describe('inferCoverQueries for Bilibili multi-part titles', () => {
  it('extracts the song identity instead of treating the part as an uploader title', () => {
    const queries = inferCoverQueries('P1 · 001.周杰伦-晴天', '无损音乐合集')
    expect(queries[0]).toEqual({ title: '晴天', artist: '周杰伦' })
  })

  it('handles a plain artist-hyphen-title part', () => {
    const queries = inferCoverQueries('001.周杰伦-晴天', '无损音乐合集')
    expect(queries[0]).toEqual({ title: '晴天', artist: '周杰伦' })
  })

  it('handles a title-hyphen-artist part', () => {
    const queries = inferCoverQueries('P1 · 夜曲-周杰伦', '无损音乐合集')
    expect(queries[0]).toEqual({ title: '夜曲', artist: '周杰伦' })
  })
})
