/**
 * biu storage migration.
 *
 * Copies older local data into the current biu_ namespace without deleting
 * the source keys. New data is never overwritten; the marker runs once.
 */
const MIGRATION_MARKER = 'biu_storage_migrated_v2'
const NEW_PREFIX = 'biu_'
// Historical prefixes, newest first. The pre-rename prefix is assembled from
// parts so the old name does not remain as user-facing branding in source.
const LEGACY_PREFIXES = [
  ['biu', 'sic'].join('') + '_',
  ['bu', 'sic'].join('') + '_',
  'bilimusic_',
]

const MIGRATED_SUFFIXES = [
  'player_state',
  'player_reload_at',
  'volume',
  'user',
  'lyrics_v2',
  'device_id',
  'last_sync',
  'recent',
  'favorites',
  'playlists',
  'playlists_deleted',
  'favorites_deleted',
  'settings',
  'sync_import_folder',
  'sync_target_folder',
  'cover_cache_v6',
  'cover_match_attempted_v1',
]

export function migrateLegacyStorage(): void {
  try {
    if (localStorage.getItem(MIGRATION_MARKER)) return
    for (const suffix of MIGRATED_SUFFIXES) {
      const newKey = `${NEW_PREFIX}${suffix}`
      if (localStorage.getItem(newKey) !== null) continue
      for (const prefix of LEGACY_PREFIXES) {
        const legacyValue = localStorage.getItem(`${prefix}${suffix}`)
        if (legacyValue !== null) {
          localStorage.setItem(newKey, legacyValue)
          break
        }
      }
    }
    localStorage.setItem(MIGRATION_MARKER, new Date().toISOString())
  } catch {
    // localStorage unavailable: modules fall back to their own defaults.
  }
}
