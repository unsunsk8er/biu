import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'

/**
 * 受信任的 webContents 登记表。
 *
 * 只有应用自己创建的窗口（主窗口、托盘面板）才允许调用 IPC。这样即使未来新增
 * 隐藏窗口、预览窗口或意外加载了第三方页面，也无法直接调用 getCookies /
 * persistent-storage / shell 等敏感通道。
 */
const trustedWebContents = new Set<number>()

export function trustWebContents(contents: WebContents): void {
  trustedWebContents.add(contents.id)
}

export function untrustWebContents(id: number): void {
  trustedWebContents.delete(id)
}

type IpcEvent = IpcMainEvent | IpcMainInvokeEvent

export function isTrustedSender(event: IpcEvent): boolean {
  const sender = event.sender
  if (!sender || sender.isDestroyed()) return false
  return trustedWebContents.has(sender.id)
}

/**
 * 敏感 IPC 的统一入口校验。未登记的发送方直接拒绝，而不是静默放行。
 * 仅在 handler 内部调用，错误会以 reject 形式回到渲染层。
 */
export function assertTrustedSender(event: IpcEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('IPC blocked: untrusted sender')
  }
}
