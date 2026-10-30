import { describe, expect, it } from 'vitest'
import { BiliApiError } from './errors'

describe('BiliApiError', () => {
  it('is a real Error with code and path', () => {
    const error = new BiliApiError(-101, '账号未登录', '/x/web-interface/nav')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('BiliApiError')
    expect(error.message).toBe('账号未登录')
    expect(error.code).toBe(-101)
    expect(error.path).toBe('/x/web-interface/nav')
    expect(error.stack).toBeTruthy()
  })

  it('falls back to a readable message when the API omits one', () => {
    expect(new BiliApiError(-352).message).toBe('B 站接口错误（-352）')
    expect(new BiliApiError(-352).path).toBe('')
  })
})
