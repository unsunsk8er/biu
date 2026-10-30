/**
 * 共享的 B 站接口错误类型。
 *
 * 之前渲染层存在三种形态：`BiliApiError`、`AndroidBiliApiError`，以及
 * `throw { code, message, path }` 这样的裸对象。裸对象会丢失堆栈，也无法被
 * `instanceof Error` 统一处理；这里收敛为一个带 code/path 的 Error。
 */
export class BiliApiError extends Error {
  readonly code: number
  readonly path: string

  constructor(code: number, message?: string, path = '') {
    super(message || `B 站接口错误（${code}）`)
    this.name = 'BiliApiError'
    this.code = code
    this.path = path
  }
}
