import { common } from '@kit.AbilityKit'
import { NativeQueue, NativeRepeatMode } from '../common/NativeQueue'
import { NativeTrack } from '../common/NativeLibrary'

@Component
export struct NativeQueuePage {
  queue: NativeQueue = new NativeQueue(getContext(this) as common.UIAbilityContext)
  topInset: number = 0
  onSelect: (index: number) => void = () => {}
  onClose: () => void = () => {}

  @State private items: NativeTrack[] = []
  @State private current: number = -1
  @State private shuffle: boolean = false
  @State private repeat: NativeRepeatMode = 'all'
  @StorageLink('biu-theme') private theme: string = 'light'

  aboutToAppear(): void {
    this.reload()
  }

  private reload(): void {
    this.items = this.queue.items()
    this.current = this.queue.index()
    this.shuffle = this.queue.isShuffle()
    this.repeat = this.queue.repeatMode()
  }

  private pageBg(): string {
    return this.theme === 'dark' ? '#0B0B0D' : '#F7F8FA'
  }

  private cardBg(): string {
    return this.theme === 'dark' ? '#1C1C1E' : '#FFFFFF'
  }

  private textColor(): string {
    return this.theme === 'dark' ? '#F5F5F7' : '#1C1C1E'
  }

  private mutedColor(): string {
    return this.theme === 'dark' ? '#9A9AA0' : '#8A8A8E'
  }

  private repeatLabel(): string {
    if (this.repeat === 'one') return '单曲循环'
    if (this.repeat === 'all') return '列表循环'
    return '顺序播放'
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Button('收起')
          .height(32)
          .fontSize(12)
          .fontColor(this.mutedColor())
          .backgroundColor(this.cardBg())
          .borderRadius(16)
          .stateEffect(false)
          .onClick(() => this.onClose())
        Text('播放队列')
          .fontSize(24)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.textColor())
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text(`${this.items.length} 首`)
          .fontSize(12)
          .fontColor(this.mutedColor())
      }
      .width('100%')

      Row({ space: 8 }) {
        Button(`随机：${this.shuffle ? '开' : '关'}`)
          .height(32)
          .fontSize(12)
          .fontColor(this.shuffle ? '#FF5C93' : this.mutedColor())
          .backgroundColor(this.cardBg())
          .borderRadius(16)
          .stateEffect(false)
          .onClick(() => {
            this.queue.toggleShuffle()
            this.reload()
          })
        Button(this.repeatLabel())
          .height(32)
          .fontSize(12)
          .fontColor('#FF5C93')
          .backgroundColor(this.cardBg())
          .borderRadius(16)
          .stateEffect(false)
          .onClick(() => {
            this.queue.cycleRepeat()
            this.reload()
          })
      }
      .width('100%')

      if (!this.items.length) {
        Text('队列为空')
          .fontSize(14)
          .fontColor(this.mutedColor())
          .margin({ top: 40 })
      } else {
        List({ space: 6 }) {
          ForEach(this.items, (item: NativeTrack, index: number) => {
            ListItem() {
              Row({ space: 10 }) {
                Text(`${index + 1}`)
                  .fontSize(11)
                  .fontColor(index === this.current ? '#FF5C93' : this.mutedColor())
                  .width(24)
                Image(item.coverUrl)
                  .width(42)
                  .height(42)
                  .borderRadius(8)
                  .objectFit(ImageFit.Cover)
                  .backgroundColor(this.theme === 'dark' ? '#2C2C2E' : '#E8E8ED')
                Column({ space: 2 }) {
                  Text(item.title)
                    .fontSize(13)
                    .fontWeight(index === this.current ? FontWeight.Medium : FontWeight.Normal)
                    .fontColor(index === this.current ? '#FF5C93' : this.textColor())
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                  Text(item.artist)
                    .fontSize(10)
                    .fontColor(this.mutedColor())
                    .maxLines(1)
                }
                .alignItems(HorizontalAlign.Start)
                .layoutWeight(1)
              }
              .width('100%')
              .padding(10)
              .backgroundColor(this.cardBg())
              .borderRadius(12)
              .onClick(() => {
                this.onSelect(index)
                this.onClose()
              })
            }
          }, (item: NativeTrack) => item.bvid + item.title)
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: this.topInset + 12, bottom: 12 })
    .backgroundColor(this.pageBg())
  }
}
