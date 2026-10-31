import { common } from '@kit.AbilityKit'
import { BiuBridge, NativeAudioPayload } from '../common/BiuBridge'
import { NativeBiliApi } from '../common/NativeBiliApi'
import { NativeLyricsApi, LyricLine } from '../common/NativeLyricsApi'
import { NativeLibrary } from '../common/NativeLibrary'

export interface NativePlayerState {
  title: string
  artist: string
  cover: string
  playing: boolean
  time: number
  duration: number
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

@Component
export struct NativePlayerPage {
  bridge: BiuBridge = new BiuBridge(getContext(this) as common.UIAbilityContext)
  @Prop @Watch('onBvidChange') bvid: string = ''
  @Prop @Watch('onLocalChange') localPath: string = ''
  @Prop localTitle: string = ''
  @Prop localArtist: string = ''
  @Prop localCover: string = ''
  @Prop visible: boolean = true
  topInset: number = 0
  onClose: () => void = () => {}
  onState: (state: NativePlayerState) => void = () => {}

  @State private title: string = ''
  @State private artist: string = ''
  @State private cover: string = ''
  @State private playing: boolean = false
  @State private loading: boolean = true
  @State private time: number = 0
  @State private duration: number = 0
  @State private error: string = ''
  @State private lyrics: LyricLine[] = []
  @State private lyricIndex: number = -1
  @State private showLyrics: boolean = false
  @StorageLink('biu-theme') private theme: string = 'light'
  private scroller: Scroller = new Scroller()
  private library: NativeLibrary = new NativeLibrary(getContext(this) as common.UIAbilityContext)
  private requestId: string = ''
  private playable: boolean = false

  onBvidChange(): void {
    if (this.localPath || !this.bvid) return
    this.resetForLoad()
    void this.load()
  }

  onLocalChange(): void {
    if (!this.localPath) return
    this.resetForLoad()
    // Prop updates for localTitle/localArtist may land in the same frame as
    // localPath; read them on the next tick so the header is not blank.
    setTimeout(() => {
      this.title = this.localTitle
      this.artist = this.localArtist
      this.cover = this.localCover
      this.notify()
      void this.loadLocal()
    }, 0)
  }

  private resetForLoad(): void {
    this.bridge.cacheAudioFile(`switch-${Date.now()}`, 'native-audio://stop')
    this.title = ''
    this.artist = ''
    this.cover = ''
    this.time = 0
    this.duration = 0
    this.lyrics = []
    this.lyricIndex = -1
    this.playable = false
    this.loading = true
    this.error = ''
  }

  aboutToAppear(): void {
    this.bridge.setAudioFileListener((requestId: string, path: string) => {
      if (requestId !== this.requestId) return
      if (!path) {
        this.loading = false
        this.error = '音频缓存失败'
        this.notify()
        return
      }
      this.playable = true
      if (this.bvid && this.title) {
        this.library.addDownload({
          bvid: this.bvid,
          title: this.title,
          artist: this.artist,
          coverUrl: this.cover,
          path,
          cachedAt: Date.now(),
          size: 0,
        })
      }
      this.bridge.cacheAudioFile(
        `player-play-${Date.now()}`,
        `native-audio://play?value=${encodeURIComponent(path)}`
      )
    })
    this.bridge.setNativeAudioListener((type: string, payload: NativeAudioPayload) => {
      if (type === 'playing') {
        this.playing = true
        this.loading = false
      } else if (type === 'paused') {
        this.playing = false
        this.loading = false
      } else if (type === 'time') {
        this.time = Number(payload.time || 0)
        if (Number(payload.duration || 0) > 0) this.duration = Number(payload.duration)
        this.updateLyric(this.time)
        this.loading = false
      } else if (type === 'duration') {
        if (Number(payload.duration || 0) > 0) this.duration = Number(payload.duration)
      } else if (type === 'ended') {
        this.playing = false
      } else if (type === 'error') {
        this.loading = false
        this.playing = false
        this.error = '播放失败'
      }
      this.notify()
    })
    if (this.localPath) {
      void this.loadLocal()
    } else if (this.bvid) {
      void this.load()
    }
  }

  private async loadLocal(): Promise<void> {
    if (!this.localPath) return
    try {
      this.requestId = `native-local-${Date.now()}`
      this.loading = true
      this.bridge.cacheAudioFile(
        `local-play-${Date.now()}`,
        `native-audio://play?value=${encodeURIComponent(this.localPath)}`
      )
    } catch (error) {
      this.loading = false
      this.error = '本地播放失败'
      this.notify()
    }
  }

  private notify(): void {
    this.onState({
      title: this.title,
      artist: this.artist,
      cover: this.cover,
      playing: this.playing,
      time: this.time,
      duration: this.duration,
    })
    this.bridge.setMediaSessionState(this.playing, this.time, this.duration)
  }

  aboutToDisappear(): void {
    this.bridge.setAudioFileListener((_requestId: string, _path: string) => {})
    this.bridge.setNativeAudioListener((_type: string, _payload: NativeAudioPayload) => {})
  }

  private async load(): Promise<void> {
    if (!this.bvid) {
      this.loading = false
      this.error = '缺少视频信息'
      return
    }
    try {
      const api = new NativeBiliApi(getContext(this) as common.UIAbilityContext)
      const info = await api.getVideoInfo(this.bvid)
      this.title = info.title
      this.artist = info.artist
      this.cover = info.cover
      if (info.duration > 0) this.duration = info.duration
      this.bridge.setMediaSession(info.bvid, info.title, info.artist, '', info.cover, '', info.duration)
      this.notify()
      const source = await api.getPlayUrl(info.bvid, info.cid)
      this.requestId = `native-player-${Date.now()}`
      this.bridge.cacheAudioFile(
        this.requestId,
        source.url,
        `${info.bvid}_${info.cid}`
      )
      void this.loadLyrics(info.title, info.artist, info.duration)
    } catch (error) {
      this.loading = false
      this.error = '加载失败，请检查网络'
      this.notify()
    }
  }

  private async loadLyrics(title: string, artist: string, duration: number): Promise<void> {
    try {
      const api = new NativeLyricsApi()
      const result = await api.find(title, artist, duration)
      if (result) this.lyrics = result.lines
    } catch (error) {
      // Lyrics are optional; playback continues without them.
    }
  }

  private updateLyric(time: number): void {
    if (!this.lyrics.length) return
    let next = 0
    for (let index = 0; index < this.lyrics.length; index += 1) {
      if (this.lyrics[index].time <= time + 0.15) next = index
      else break
    }
    if (next === this.lyricIndex) return
    this.lyricIndex = next
    if (this.showLyrics) {
      this.scroller.scrollToIndex(next, true, ScrollAlign.CENTER)
    }
  }

  private toggle(): void {
    if (this.loading) return
    if (!this.playable) {
      void this.load()
      return
    }
    this.bridge.cacheAudioFile(
      `player-${Date.now()}`,
      this.playing ? 'native-audio://pause' : 'native-audio://resume'
    )
  }

  private seek(value: number): void {
    this.time = value
    if (!this.playable) return
    this.bridge.cacheAudioFile(
      `player-seek-${Date.now()}`,
      `native-audio://seek?value=${Math.round(value)}`
    )
  }

  private close(): void {
    // Keep the native player alive so the mini player can keep controlling it.
    this.onClose()
  }

  private textColor(): string {
    return this.theme === 'dark' ? '#F5F5F7' : '#1C1C1E'
  }

  private mutedColor(): string {
    return this.theme === 'dark' ? '#9A9AA0' : '#6B6B70'
  }

  private pageBg(): string {
    return this.theme === 'dark' ? '#0B0B0D' : '#F7F8FA'
  }

  build() {
    Column() {
      Row() {
        Button('收起')
          .height(34)
          .fontSize(13)
          .fontColor(this.mutedColor())
          .backgroundColor(this.theme === 'dark' ? '#1C1C1E' : '#FFFFFF')
          .borderRadius(17)
          .stateEffect(false)
          .onClick(() => this.close())
        Blank()
        Text('正在播放')
          .fontSize(13)
          .fontColor(this.mutedColor())
        Blank()
        Button(this.showLyrics ? '封面' : '歌词')
          .height(34)
          .fontSize(13)
          .fontColor('#FF5C93')
          .backgroundColor(this.theme === 'dark' ? '#1C1C1E' : '#FFFFFF')
          .borderRadius(17)
          .stateEffect(false)
          .onClick(() => {
            this.showLyrics = !this.showLyrics
            if (this.showLyrics && this.lyricIndex >= 0) {
              this.scroller.scrollToIndex(this.lyricIndex, true, ScrollAlign.CENTER)
            }
          })
      }
      .width('100%')

      Column({ space: 18 }) {
        if (this.showLyrics) {
          if (this.lyrics.length) {
            List({ scroller: this.scroller, space: 8 }) {
              ForEach(this.lyrics, (line: LyricLine, index: number) => {
                ListItem() {
                  Text(line.text)
                    .fontSize(index === this.lyricIndex ? 18 : 14)
                    .fontWeight(index === this.lyricIndex ? FontWeight.Medium : FontWeight.Normal)
                    .fontColor(index === this.lyricIndex ? '#FF5C93' : this.mutedColor())
                    .textAlign(TextAlign.Center)
                    .width('100%')
                    .padding({ top: 4, bottom: 4 })
                }
                .onClick(() => this.seek(line.time))
              }, (line: LyricLine, index: number) => `${index}-${line.time}`)
            }
            .height(300)
            .width('100%')
            .scrollBar(BarState.Off)
            .margin({ top: 20 })
          } else {
            Text('暂无歌词')
              .fontSize(14)
              .fontColor(this.mutedColor())
              .height(300)
              .margin({ top: 20 })
          }
        } else {
          Image(this.cover)
            .width(280)
            .height(280)
            .borderRadius(24)
            .objectFit(ImageFit.Cover)
            .backgroundColor(this.theme === 'dark' ? '#1C1C1E' : '#E8E8ED')
            .margin({ top: 26 })
        }

        Column({ space: 6 }) {
          Text(this.title)
            .fontSize(22)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.textColor())
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .textAlign(TextAlign.Center)
          Text(this.artist)
            .fontSize(13)
            .fontColor(this.mutedColor())
            .maxLines(1)
        }

        if (this.loading) {
          LoadingProgress()
            .width(30)
            .height(30)
            .color('#FF5C93')
        } else if (this.error) {
          Text(this.error)
            .fontSize(13)
            .fontColor('#FF5C93')
        }

        Slider({
          value: this.time,
          min: 0,
          max: this.duration > 0 ? this.duration : 1,
          step: 1,
        })
          .width('100%')
          .selectedColor('#FF5C93')
          .trackColor(this.theme === 'dark' ? '#3A3A3C' : '#E5E5EA')
          .blockColor('#FF5C93')
          .onChange((value: number, mode: SliderChangeMode) => {
            if (mode === SliderChangeMode.Moving) {
              this.time = value
            } else if (mode === SliderChangeMode.End) {
              this.seek(value)
            }
          })

        Row() {
          Text(formatTime(this.time)).fontSize(11).fontColor(this.mutedColor())
          Blank()
          Text(this.duration > 0 ? `-${formatTime(this.duration - this.time)}` : '--:--')
            .fontSize(11)
            .fontColor(this.mutedColor())
        }
        .width('100%')

        Button() {
          Text(this.playing ? '暂停' : '播放')
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor('#FFFFFF')
        }
        .width(84)
        .height(84)
        .borderRadius(42)
        .backgroundColor('#FF5C93')
        .stateEffect(false)
        .onClick(() => this.toggle())
      }
      .layoutWeight(1)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .padding({ left: 24, right: 24, top: this.topInset + 12, bottom: 20 })
    .backgroundColor(this.pageBg())
    .visibility(this.visible ? Visibility.Visible : Visibility.None)
  }
}
