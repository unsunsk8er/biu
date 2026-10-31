/**
 * Share one in-flight Promise per key. Used by lyrics so Now Playing and the
 * AVSession mirror never start duplicate lookups for the same track.
 */
export function createInFlight<T>() {
  const pending = new Map<string, Promise<T>>()

  return {
    run(key: string, factory: () => Promise<T>): Promise<T> {
      const running = pending.get(key)
      if (running) return running
      const task = factory().finally(() => {
        if (pending.get(key) === task) pending.delete(key)
      })
      pending.set(key, task)
      return task
    },
    clear(key: string): void {
      pending.delete(key)
    },
    size(): number {
      return pending.size
    },
  }
}
