import { beforeEach, describe, expect, it } from 'vitest'
import { BiliApiError } from './errors'
import { createAndroidBiliApi } from './androidBiliApi'

interface PostCall {
  requestId: string
  path: string
  body: string
}

describe('androidBiliApi', () => {
  let calls: PostCall[]

  beforeEach(() => {
    calls = []
    window.BiuAndroid = {
      biliPost: (requestId, path, body) => {
        calls.push({ requestId, path, body })
        window.__biuBiliPostResult?.(requestId, JSON.stringify({ code: 0, data: { id: 7, title: 'Mix' } }))
      },
    }
  })

  it('posts through the native bridge without exposing csrf to JS', async () => {
    const api = createAndroidBiliApi()
    await expect(api.favoriteCreate('  My List  ')).resolves.toEqual({ id: 7, title: 'Mix' })

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/x/v3/fav/folder/add')
    expect(calls[0].body).toContain('title=My+List')
    expect(calls[0].body).not.toContain('csrf')
  })

  it('rejects with BiliApiError when the native call reports an API error', async () => {
    window.BiuAndroid = {
      biliPost: (requestId) => {
        window.__biuBiliPostResult?.(requestId, JSON.stringify({ code: -101, message: '账号未登录' }))
      },
    }

    const api = createAndroidBiliApi()
    await expect(api.favoriteCreate('Mix')).rejects.toMatchObject({
      name: 'BiliApiError',
      code: -101,
      message: '账号未登录',
    })
    await expect(api.favoriteCreate('Mix')).rejects.toBeInstanceOf(BiliApiError)
  })
})
