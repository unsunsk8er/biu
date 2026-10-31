import type { TrackSource } from '@/services/bilibiliApi'

const MAX_CANDIDATES = 6

/**
 * Ordered, de-duplicated CDN candidates for one audio source. Kept pure so the
 * playback fallback regression tests do not need a WebView or network.
 */
export function buildAudioCandidateUrls(
  source: Pick<TrackSource, 'audioUrl' | 'backupUrls'>,
  limit = MAX_CANDIDATES,
): string[] {
  const urls = [source.audioUrl, ...(source.backupUrls || [])]
    .filter((url): url is string => Boolean(url))
    .map((url) => url.replace(/^http:/i, 'https:'))
  return Array.from(new Set(urls)).slice(0, Math.max(0, limit))
}

export const PLAYBACK_STAGES = ['direct', 'progressive', 'nativeCache'] as const
export type PlaybackStage = (typeof PLAYBACK_STAGES)[number]

export function nextPlaybackStage(stage: PlaybackStage): PlaybackStage | null {
  const index = PLAYBACK_STAGES.indexOf(stage)
  if (index < 0 || index >= PLAYBACK_STAGES.length - 1) return null
  return PLAYBACK_STAGES[index + 1]
}
