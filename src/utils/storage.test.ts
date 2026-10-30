import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPlaylistsExport,
  importPlaylistsFromText,
  loadPlaylists,
} from './storage'

describe('playlist import/export', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('imports valid playlists, renames duplicates and skips malformed items', () => {
    const result = importPlaylistsFromText(JSON.stringify({
      playlists: [
        { id: 'p1', name: 'Road Trip', tracks: [{ id: 't1' }] },
        { name: 'Road Trip', tracks: [] },
        { name: 42, tracks: [] },
        { name: 'Empty', tracks: [] },
      ],
    }))

    expect(result).toEqual({ imported: 3, skipped: 1 })
    expect(loadPlaylists().map((playlist) => playlist.name)).toEqual([
      'Road Trip',
      'Road Trip 导入',
      'Empty',
    ])
  })

  it('accepts a bare array as well as the exported envelope', () => {
    const result = importPlaylistsFromText(JSON.stringify([
      { name: 'Favorites', tracks: [] },
    ]))
    expect(result.imported).toBe(1)
    expect(loadPlaylists()[0].name).toBe('Favorites')
  })

  it('round-trips through the export envelope', () => {
    importPlaylistsFromText(JSON.stringify({ playlists: [{ name: 'Mix', tracks: [] }] }))
    const exported = createPlaylistsExport()

    expect(exported).toMatchObject({ app: 'biu', type: 'playlists', version: 1 })
    expect(exported.playlists).toHaveLength(1)
    expect(exported.playlists[0].name).toBe('Mix')
  })

  it('rejects invalid JSON and payloads without a playlist array', () => {
    expect(() => importPlaylistsFromText('not json')).toThrow()
    expect(() => importPlaylistsFromText(JSON.stringify({ foo: [] }))).toThrow('文件中没有找到歌单列表')
  })
})
