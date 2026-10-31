import { common } from '@kit.AbilityKit'
import { preferences } from '@kit.ArkData'
import { NativeBiliApi } from '../common/NativeBiliApi'

type ThemeMode = 'light' | 'dark'
type PlayQuality = '标准' | '高品质' | '无损'

interface NativeSettings {
  theme: ThemeMode
  playQuality: PlayQuality
  autoCache: boolean
  showLyrics: boolean
  autoMatchCover: boolean
}

const PREF_NAME = 'biu_native_settings'
const PREF_KEY = 'settings'

const DEFAULTS: NativeSettings = {
  theme: 'light',
  playQuality: '高品质',
  autoCache: false,
  showLyrics: true,
  autoMatchCover: true,
}

@Component
export struct NativeSettingsPage {
  topInset: number = 0
  onLogin: () => void = () => {}
  @Prop @Watch('loadAccount') refreshToken: number = 0

  @State private settings: NativeSettings = DEFAULTS
  @State private isLogin: boolean = false
  @State private uname: string = ''
  private pref?: preferences.Preferences

  aboutToAppear(): void {
    this.loadNative()
    this.loadAccount()
  }

  async loadAccount(): Promise<void> {
    try {
      const api = new NativeBiliApi(getContext(this) as common.UIAbilityContext)
      const user = await api.getNavInfo()
      this.isLogin = user.isLogin
      this.uname = user.uname
    } catch (error) {
      this.isLogin = false
      this.uname = ''
    }
  }

  private logout(): void {
    new NativeBiliApi(getContext(this) as common.UIAbilityContext).clearCookie()
    this.isLogin = false
    this.uname = ''
  }

  private getPref(): preferences.Preferences | undefined {
    try {
      this.pref = preferences.getPreferencesSync(getContext(this), { name: PREF_NAME })
    } catch (error) {
      this.pref = undefined
    }
    return this.pref
  }

  private loadNative(): void {
    try {
      const pref = this.getPref()
      if (!pref) return
      const raw = pref.getSync(PREF_KEY, '') as string
      if (!raw) return
      const parsed = JSON.parse(raw) as NativeSettings
      this.settings = {
        theme: parsed.theme === 'dark' ? 'dark' : 'light',
        playQuality: parsed.playQuality === '标准' || parsed.playQuality === '无损' ? parsed.playQuality : '高品质',
        autoCache: Boolean(parsed.autoCache),
        showLyrics: parsed.showLyrics !== false,
        autoMatchCover: parsed.autoMatchCover !== false,
      }
      AppStorage.setOrCreate('biu-theme', this.settings.theme)
    } catch (error) {
      // Keep defaults; native preferences are best-effort.
    }
  }

  private persist(): void {
    AppStorage.setOrCreate('biu-theme', this.settings.theme)
    try {
      const pref = this.getPref()
      if (pref) {
        pref.putSync(PREF_KEY, JSON.stringify(this.settings))
        pref.flush()
      }
    } catch (error) {
      // A failed native write must not block the UI.
    }
  }

  private pageBg(): string {
    return this.settings.theme === 'dark' ? '#0B0B0D' : '#F7F8FA'
  }

  private cardBg(): string {
    return this.settings.theme === 'dark' ? '#1C1C1E' : '#FFFFFF'
  }

  private textColor(): string {
    return this.settings.theme === 'dark' ? '#F5F5F7' : '#1C1C1E'
  }

  private mutedColor(): string {
    return this.settings.theme === 'dark' ? '#9A9AA0' : '#8A8A8E'
  }

  private segmentBg(): string {
    return this.settings.theme === 'dark' ? '#2C2C2E' : '#F2F3F5'
  }

  private segmentText(): string {
    return this.settings.theme === 'dark' ? '#D1D1D6' : '#5F6368'
  }

  @Builder
  SectionTitle(title: string) {
    Text(title)
      .fontSize(15)
      .fontWeight(FontWeight.Medium)
      .fontColor(this.textColor())
      .width('100%')
      .padding({ left: 4, top: 18, bottom: 8 })
  }

  @Builder
  Segment(options: string[], value: string, onSelect: (value: string) => void) {
    Row({ space: 4 }) {
      ForEach(options, (option: string) => {
        Button(option)
          .height(34)
          .layoutWeight(1)
          .fontSize(12)
          .fontColor(value === option ? '#FFFFFF' : this.segmentText())
          .backgroundColor(value === option ? '#FF5C93' : this.segmentBg())
          .borderRadius(10)
          .stateEffect(false)
          .onClick(() => onSelect(option))
      }, (option: string) => option)
    }
    .padding(3)
    .borderRadius(12)
    .backgroundColor(this.segmentBg())
  }

  @Builder
  SwitchRow(title: string, description: string, checked: boolean, onChange: (value: boolean) => void) {    Row() {
      Column({ space: 3 }) {
        Text(title).fontSize(14).fontColor(this.textColor())
        if (description) {
          Text(description).fontSize(11).fontColor(this.mutedColor())
        }
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: checked })
        .selectedColor('#FF5C93')
        .onChange((value: boolean) => onChange(value))
    }
    .width('100%')
    .padding({ left: 14, right: 14, top: 12, bottom: 12 })
    .backgroundColor(this.cardBg())
    .borderRadius(14)
  }

  build() {
    Column() {
      Scroll() {
        Column({ space: 12 }) {
          Column({ space: 4 }) {
            Text('设置')
              .fontSize(30)
              .fontWeight(FontWeight.Bold)
              .fontColor(this.textColor())
            Text('管理外观、播放与本地数据')
              .fontSize(12)
              .fontColor(this.mutedColor())
          }
          .alignItems(HorizontalAlign.Start)
          .width('100%')
          .padding({ left: 4, top: 8, bottom: 4 })

          this.SectionTitle('账号')
          Row() {
            Column({ space: 3 }) {
              Text('B 站账号').fontSize(14).fontColor(this.textColor())
              Text(this.isLogin ? `已登录：${this.uname || 'B 站账号'}` : '扫码登录后可同步收藏夹与获取更高音质')
                .fontSize(11)
                .fontColor(this.isLogin ? '#FF5C93' : this.mutedColor())
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
            Button(this.isLogin ? '退出登录' : '扫码登录')
              .height(34)
              .fontSize(12)
              .fontColor(this.isLogin ? this.mutedColor() : '#FFFFFF')
              .backgroundColor(this.isLogin ? (this.settings.theme === 'dark' ? '#2C2C2E' : '#F2F3F5') : '#FF5C93')
              .borderRadius(17)
              .stateEffect(false)
              .onClick(() => {
                if (this.isLogin) {
                  this.logout()
                } else {
                  this.onLogin()
                }
              })
          }
          .width('100%')
          .padding(14)
          .backgroundColor(this.cardBg())
          .borderRadius(16)

          this.SectionTitle('外观')
          Column({ space: 12 }) {
            Text('主题模式').fontSize(14).fontColor(this.textColor()).width('100%')
            this.Segment(['浅色', '深色'], this.settings.theme === 'dark' ? '深色' : '浅色', (value: string) => {
              this.settings = {
                theme: value === '深色' ? 'dark' : 'light',
                playQuality: this.settings.playQuality,
                autoCache: this.settings.autoCache,
                showLyrics: this.settings.showLyrics,
                autoMatchCover: this.settings.autoMatchCover,
              }
              this.persist()
            })
          }
          .width('100%')
          .padding(14)
          .backgroundColor(this.cardBg())
          .borderRadius(16)

          this.SectionTitle('播放')
          Column({ space: 14 }) {
            Text('音质').fontSize(14).fontColor(this.textColor()).width('100%')
            this.Segment(['标准', '高品质', '无损'], this.settings.playQuality, (value: string) => {
              this.settings = {
                theme: this.settings.theme,
                playQuality: value as PlayQuality,
                autoCache: this.settings.autoCache,
                showLyrics: this.settings.showLyrics,
                autoMatchCover: this.settings.autoMatchCover,
              }
              this.persist()
            })
            Text('音质在下一首或重新加载时生效；实际档位取决于 B 站是否提供该流。')
              .fontSize(11)
              .fontColor(this.mutedColor())
              .width('100%')
          }
          .width('100%')
          .padding(14)
          .backgroundColor(this.cardBg())
          .borderRadius(16)

          this.SectionTitle('内容')
          Column({ space: 10 }) {
            this.SwitchRow('自动匹配封面', '根据歌名和歌手匹配专辑封面', this.settings.autoMatchCover,
              (value: boolean) => {
                this.settings = {
                  theme: this.settings.theme,
                  playQuality: this.settings.playQuality,
                  autoCache: this.settings.autoCache,
                  showLyrics: this.settings.showLyrics,
                  autoMatchCover: value,
                }
                this.persist()
              })
            this.SwitchRow('显示歌词', '播放页显示歌词', this.settings.showLyrics,
              (value: boolean) => {
                this.settings = {
                  theme: this.settings.theme,
                  playQuality: this.settings.playQuality,
                  autoCache: this.settings.autoCache,
                  showLyrics: value,
                  autoMatchCover: this.settings.autoMatchCover,
                }
                this.persist()
              })
            this.SwitchRow('自动缓存', '播放时缓存音频到本地', this.settings.autoCache,
              (value: boolean) => {
                this.settings = {
                  theme: this.settings.theme,
                  playQuality: this.settings.playQuality,
                  autoCache: value,
                  showLyrics: this.settings.showLyrics,
                  autoMatchCover: this.settings.autoMatchCover,
                }
                this.persist()
              })
          }
        }
        .padding({ left: 20, right: 20, top: this.topInset + 12, bottom: 24 })
      }
      .scrollBar(BarState.Off)
      .layoutWeight(1)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.pageBg())
  }
}
