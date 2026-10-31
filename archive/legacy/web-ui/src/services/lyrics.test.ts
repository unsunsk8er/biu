import { describe, expect, it } from 'vitest'
import { cleanTitle, parseLrc } from './lyrics'

describe('cleanTitle', () => {
  it('removes common video noise while keeping the song name', () => {
    const title = cleanTitle('周杰伦 - 夜曲 (Official MV)')
    expect(title).toContain('夜曲')
    expect(title.toLowerCase()).not.toContain('official')
  })

  it('extracts the song name from CJK brackets', () => {
    expect(cleanTitle('【官方MV】起风了')).toBe('起风了')
  })

  it('returns an empty string for empty input', () => {
    expect(cleanTitle('')).toBe('')
  })

  it('falls back to the trimmed raw title when everything is noise', () => {
    const title = cleanTitle('官方 完整版 高音质')
    expect(title.length).toBeGreaterThan(0)
    expect(title.length).toBeLessThanOrEqual(40)
  })
})

describe('parseLrc', () => {
  it('parses timestamps, fractions and repeated tags', () => {
    const lines = parseLrc([
      '[ti:Test]',
      '[00:01.50]Hello',
      '[00:03.00][00:05.00]World',
      '[00:07]No Fraction',
    ].join('\n'))

    expect(lines).toEqual([
      { time: 1.5, text: 'Hello' },
      { time: 3, text: 'World' },
      { time: 5, text: 'World' },
      { time: 7, text: 'No Fraction' },
    ])
  })

  it('ignores metadata and untimed lines', () => {
    expect(parseLrc('[ar:Someone]\nno timestamp here\n[00:02.00]Real line')).toEqual([
      { time: 2, text: 'Real line' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(parseLrc('')).toEqual([])
  })
})
