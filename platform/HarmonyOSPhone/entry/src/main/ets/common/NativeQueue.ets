import { common } from '@kit.AbilityKit'
import { preferences } from '@kit.ArkData'
import { NativeTrack } from './NativeLibrary'

export type NativeRepeatMode = 'none' | 'one' | 'all'

interface QueueState {
  items: NativeTrack[]
  index: number
  shuffle: boolean
  repeat: NativeRepeatMode
}

const PREF_NAME = 'biu_native_queue'
const PREF_KEY = 'state'

const EMPTY: QueueState = {
  items: [],
  index: -1,
  shuffle: false,
  repeat: 'all',
}

export class NativeQueue {
  private pref?: preferences.Preferences
  private state: QueueState = EMPTY

  constructor(context: common.UIAbilityContext) {
    try {
      this.pref = preferences.getPreferencesSync(context, { name: PREF_NAME })
      const raw = this.pref.getSync(PREF_KEY, '') as string
      if (raw) {
        const parsed = JSON.parse(raw) as QueueState
        this.state = {
          items: Array.isArray(parsed.items) ? parsed.items : [],
          index: Number.isFinite(parsed.index) ? Number(parsed.index) : -1,
          shuffle: Boolean(parsed.shuffle),
          repeat: parsed.repeat === 'none' || parsed.repeat === 'one' ? parsed.repeat : 'all',
        }
      }
    } catch (error) {
      this.state = EMPTY
    }
  }

  private persist(): void {
    try {
      if (!this.pref) return
      this.pref.putSync(PREF_KEY, JSON.stringify(this.state))
      this.pref.flush()
    } catch (error) {
      // Queue persistence is best-effort.
    }
  }

  setQueue(items: NativeTrack[], index: number): NativeTrack | null {
    if (!items.length) {
      this.state = { items: [], index: -1, shuffle: this.state.shuffle, repeat: this.state.repeat }
      this.persist()
      return null
    }
    const safeIndex = Math.min(Math.max(index, 0), items.length - 1)
    this.state = {
      items: items.slice(),
      index: safeIndex,
      shuffle: this.state.shuffle,
      repeat: this.state.repeat,
    }
    this.persist()
    return this.current()
  }

  setIndex(index: number): NativeTrack | null {
    if (index < 0 || index >= this.state.items.length) return null
    this.state.index = index
    this.persist()
    return this.current()
  }

  current(): NativeTrack | null {
    return this.state.items[this.state.index] || null
  }

  items(): NativeTrack[] {
    return this.state.items
  }

  index(): number {
    return this.state.index
  }

  isShuffle(): boolean {
    return this.state.shuffle
  }

  repeatMode(): NativeRepeatMode {
    return this.state.repeat
  }

  toggleShuffle(): void {
    this.state.shuffle = !this.state.shuffle
    this.persist()
  }

  cycleRepeat(): NativeRepeatMode {
    this.state.repeat = this.state.repeat === 'all' ? 'one' : this.state.repeat === 'one' ? 'none' : 'all'
    this.persist()
    return this.state.repeat
  }

  next(manual: boolean = true): NativeTrack | null {
    const total = this.state.items.length
    if (!total) return null
    if (!manual && this.state.repeat === 'one') {
      this.persist()
      return this.current()
    }
    if (this.state.shuffle && total > 1) {
      let next = this.state.index
      while (next === this.state.index) {
        next = Math.floor(Math.random() * total)
      }
      this.state.index = next
      this.persist()
      return this.current()
    }
    if (this.state.index + 1 < total) {
      this.state.index += 1
    } else if (this.state.repeat === 'all') {
      this.state.index = 0
    } else {
      return null
    }
    this.persist()
    return this.current()
  }

  previous(): NativeTrack | null {
    const total = this.state.items.length
    if (!total) return null
    if (this.state.shuffle && total > 1) {
      let prev = this.state.index
      while (prev === this.state.index) {
        prev = Math.floor(Math.random() * total)
      }
      this.state.index = prev
      this.persist()
      return this.current()
    }
    if (this.state.index > 0) {
      this.state.index -= 1
    } else if (this.state.repeat === 'all') {
      this.state.index = total - 1
    } else {
      return null
    }
    this.persist()
    return this.current()
  }

  removeAt(index: number): NativeTrack | null {
    if (index < 0 || index >= this.state.items.length) return this.current()
    const items = this.state.items.slice()
    items.splice(index, 1)
    if (!items.length) {
      this.state = { items: [], index: -1, shuffle: this.state.shuffle, repeat: this.state.repeat }
      this.persist()
      return null
    }
    let nextIndex = this.state.index
    if (index < this.state.index) nextIndex -= 1
    if (nextIndex >= items.length) nextIndex = items.length - 1
    this.state.items = items
    this.state.index = Math.max(nextIndex, 0)
    this.persist()
    return this.current()
  }
}
