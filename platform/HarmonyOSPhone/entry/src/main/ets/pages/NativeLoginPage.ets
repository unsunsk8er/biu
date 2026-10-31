import { common } from '@kit.AbilityKit'
import { QrLoginStart, NativeLoginApi } from '../common/NativeLoginApi'
import { NativeBiliApi } from '../common/NativeBiliApi'

@Component
export struct NativeLoginPage {
  topInset: number = 0
  onClose: () => void = () => {}
  onSuccess: () => void = () => {}

  @State private qrUrl: string = ''
  @State private status: string = '正在生成二维码'
  @State private success: boolean = false
  @State private manual: boolean = false
  @State private cookieInput: string = ''
  @StorageLink('biu-theme') private theme: string = 'light'
  private api: NativeLoginApi = new NativeLoginApi()
  private pollTimer: number = -1
  private qrKey: string = ''

  aboutToAppear(): void {
    void this.start()
  }

  aboutToDisappear(): void {
    this.stopPolling()
  }

  private stopPolling(): void {
    if (this.pollTimer >= 0) {
      clearInterval(this.pollTimer)
      this.pollTimer = -1
    }
  }

  private async start(): Promise<void> {
    this.stopPolling()
    this.success = false
    this.qrUrl = ''
    this.status = '正在生成二维码'
    try {
      const start: QrLoginStart = await this.api.generate()
      this.qrUrl = start.url
      this.qrKey = start.key
      this.status = '请使用 B 站 App 扫码'
      this.pollTimer = setInterval(() => {
        void this.poll()
      }, 2000)
    } catch (error) {
      this.status = '二维码生成失败，请重试'
    }
  }

  private async poll(): Promise<void> {
    if (!this.qrKey || this.success) return
    try {
      const result = await this.api.poll(this.qrKey)
      this.status = result.message
      if (result.state === 'success') {
        this.success = true
        this.stopPolling()
        new NativeBiliApi(getContext(this) as common.UIAbilityContext).saveCookie(result.cookie)
        this.onSuccess()
      } else if (result.state === 'expired') {
        this.stopPolling()
      }
    } catch (error) {
      this.status = '网络异常，等待重试'
    }
  }

  private saveManual(): void {
    const cookie = this.cookieInput.trim()
    if (!cookie.includes('SESSDATA=')) {
      this.status = 'Cookie 中缺少 SESSDATA'
      return
    }
    new NativeBiliApi(getContext(this) as common.UIAbilityContext).saveCookie(cookie)
    this.success = true
    this.status = '登录成功'
    this.stopPolling()
    this.onSuccess()
  }

  private textColor(): string {
    return this.theme === 'dark' ? '#F5F5F7' : '#1C1C1E'
  }

  private mutedColor(): string {
    return this.theme === 'dark' ? '#9A9AA0' : '#8A8A8E'
  }

  private pageBg(): string {
    return this.theme === 'dark' ? '#0B0B0D' : '#F7F8FA'
  }

  build() {
    Column({ space: 18 }) {
      Row() {
        Button('关闭')
          .height(32)
          .fontSize(12)
          .fontColor(this.mutedColor())
          .backgroundColor(this.theme === 'dark' ? '#1C1C1E' : '#FFFFFF')
          .borderRadius(16)
          .stateEffect(false)
          .onClick(() => this.onClose())
        Blank()
        Text('B 站登录')
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.textColor())
        Blank()
        Text(' ')
          .width(50)
      }
      .width('100%')

      if (this.success) {
        Text('登录成功')
          .fontSize(24)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FF5C93')
          .margin({ top: 60 })
      } else if (this.qrUrl) {
        QRCode(this.qrUrl)
          .width(240)
          .height(240)
          .color(this.theme === 'dark' ? '#FFFFFF' : '#1C1C1E')
          .backgroundColor('#FFFFFF')
          .margin({ top: 24 })
      } else {
        LoadingProgress()
          .width(40)
          .height(40)
          .color('#FF5C93')
          .margin({ top: 80 })
      }

      Text(this.status)
        .fontSize(13)
        .fontColor(this.mutedColor())

      Button('刷新二维码')
        .height(36)
        .fontSize(13)
        .fontColor('#FF5C93')
        .backgroundColor(this.theme === 'dark' ? '#1C1C1E' : '#FFFFFF')
        .borderRadius(18)
        .stateEffect(false)
        .onClick(() => {
          void this.start()
        })

        Button(this.manual ? '收起手动登录' : '手动粘贴 Cookie')
          .height(32)
          .fontSize(12)
          .fontColor(this.mutedColor())
          .backgroundColor(Color.Transparent)
          .stateEffect(false)
          .onClick(() => {
            this.manual = !this.manual
          })

        if (this.manual) {
          TextArea({ placeholder: '粘贴包含 SESSDATA 的完整 Cookie', text: this.cookieInput })
            .width('100%')
            .height(110)
            .fontSize(12)
            .backgroundColor(this.theme === 'dark' ? '#1C1C1E' : '#FFFFFF')
            .borderRadius(12)
            .onChange((value: string) => {
              this.cookieInput = value
            })
          Button('使用 Cookie 登录')
            .height(36)
            .fontSize(13)
            .fontColor('#FFFFFF')
            .backgroundColor('#FF5C93')
            .borderRadius(18)
            .stateEffect(false)
            .onClick(() => this.saveManual())
        }

      Text('登录用于同步收藏夹和获取更高音质；登录态仅保存在本机')
        .fontSize(11)
        .fontColor(this.mutedColor())
        .textAlign(TextAlign.Center)
        .padding({ left: 30, right: 30 })
    }
    .width('100%')
    .height('100%')
    .padding({ left: 24, right: 24, top: this.topInset + 12, bottom: 24 })
    .backgroundColor(this.pageBg())
  }
}
