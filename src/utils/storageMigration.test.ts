import { beforeEach, describe, expect, it } from 'vitest'
import { migrateLegacyStorage } from './storageMigration'

describe('migrateLegacyStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('copies legacy BiuMusic keys into the biu_ namespace', () => {
    localStorage.setItem('busic_recent', '[{"id":"a"}]')
    localStorage.setItem('busic_settings', '{"playQuality":"无损"}')

    migrateLegacyStorage()

    expect(localStorage.getItem('biu_recent')).toBe('[{"id":"a"}]')
    expect(localStorage.getItem('biu_settings')).toBe('{"playQuality":"无损"}')
    expect(localStorage.getItem('biu_storage_migrated_v2')).toBeTruthy()
  })

  it('copies pre-rename keys into the biu_ namespace', () => {
    const oldPrefix = ['biu', 'sic'].join('') + '_'
    localStorage.setItem(oldPrefix + 'recent', '[{"id":"old"}]')
    localStorage.setItem(oldPrefix + 'player_state', '{"currentIndex":2}')

    migrateLegacyStorage()

    expect(localStorage.getItem('biu_recent')).toBe('[{"id":"old"}]')
    expect(localStorage.getItem('biu_player_state')).toBe('{"currentIndex":2}')
  })

  it('never overwrites data that already exists in the new namespace', () => {
    localStorage.setItem('biu_favorites', 'new')
    localStorage.setItem('busic_favorites', 'legacy')

    migrateLegacyStorage()

    expect(localStorage.getItem('biu_favorites')).toBe('new')
  })

  it('runs only once, so later legacy changes are ignored', () => {
    localStorage.setItem('busic_recent', 'first')
    migrateLegacyStorage()
    localStorage.setItem('busic_recent', 'second')

    migrateLegacyStorage()

    expect(localStorage.getItem('biu_recent')).toBe('first')
  })
})
