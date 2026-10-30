import { describe, expect, it } from 'vitest'
import { createInFlight } from './inFlight'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createInFlight', () => {
  it('shares one in-flight promise per key', async () => {
    const inflight = createInFlight<number>()
    const task = deferred<number>()
    let calls = 0
    const factory = () => {
      calls += 1
      return task.promise
    }

    const first = inflight.run('track-1', factory)
    const second = inflight.run('track-1', factory)
    expect(first).toBe(second)
    expect(calls).toBe(1)

    task.resolve(7)
    await expect(first).resolves.toBe(7)
    expect(inflight.size()).toBe(0)
  })

  it('does not share different keys', async () => {
    const inflight = createInFlight<string>()
    const calls: string[] = []
    const load = (key: string) => inflight.run(key, async () => {
      calls.push(key)
      return key
    })

    await Promise.all([load('a'), load('b')])
    expect(calls.sort()).toEqual(['a', 'b'])
  })

  it('cleans up after rejection so a retry starts a new request', async () => {
    const inflight = createInFlight<number>()
    await expect(inflight.run('x', () => Promise.reject(new Error('network')))).rejects.toThrow('network')
    expect(inflight.size()).toBe(0)
    await expect(inflight.run('x', () => Promise.resolve(1))).resolves.toBe(1)
  })
})
