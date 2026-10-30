import { describe, expect, it } from 'vitest'
import { buildAudioCandidateUrls, nextPlaybackStage } from './playbackFallback'

describe('buildAudioCandidateUrls', () => {
  it('keeps primary first, normalizes http and de-duplicates backups', () => {
    expect(buildAudioCandidateUrls({
      audioUrl: 'http://primary.example/a.m4s',
      backupUrls: ['https://primary.example/a.m4s', 'https://backup.example/b.m4s', ''],
    })).toEqual([
      'https://primary.example/a.m4s',
      'https://backup.example/b.m4s',
    ])
  })

  it('honours the candidate limit', () => {
    expect(buildAudioCandidateUrls({
      audioUrl: 'https://a/1',
      backupUrls: ['https://a/2', 'https://a/3', 'https://a/4'],
    }, 2)).toEqual(['https://a/1', 'https://a/2'])
  })

  it('returns an empty list for a missing source', () => {
    expect(buildAudioCandidateUrls({ audioUrl: '', backupUrls: [] })).toEqual([])
  })
})

describe('nextPlaybackStage', () => {
  it('walks direct → progressive → native cache → stop', () => {
    expect(nextPlaybackStage('direct')).toBe('progressive')
    expect(nextPlaybackStage('progressive')).toBe('nativeCache')
    expect(nextPlaybackStage('nativeCache')).toBeNull()
  })
})
