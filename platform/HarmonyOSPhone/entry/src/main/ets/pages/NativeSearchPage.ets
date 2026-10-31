import { common } from '@kit.AbilityKit'
import { NativeBiliApi, NativeSearchItem } from '../common/NativeBiliApi'

@Component
export struct NativeSearchPage {
  topInset: number = 0
  onSelect: (item: NativeSearchItem) => void = () => {}

  @State private keyword: string = ''
  @State private loading: boolean = false
  @State private error: string = ''
  @State private total: number = 0
  @State private items: NativeSearchItem[] = []
  @StorageLink('biu-theme') private theme: string = 'light'
  private api?: NativeBiliApi

  aboutToAppear(): void {
    this.api = new NativeBiliApi(getContext(this) as common.UIAbilityContext)
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


  private async search(): Promise<void> {
    const keyword = this.keyword.trim()
    if (!keyword || this.loading || !this.api) return
    this.loading = true
    this.error = ''
    try {
      const result = await this.api.searchVideo(keyword, 1, 20)
      this.items = result.items
      this.total = result.total
    } catch (error) {
      this.items = []
      this.error = '搜索失败，请检查网络后重试'
    } finally {
      this.loading = false
    }
  }

  private play(item: NativeSearchItem): void {
    this.getUIContext().getFocusController().clearFocus()
    this.onSelect(item)
  }

  @Builder
  ResultRow(item: NativeSearchItem) {
    Row({ space: 12 }) {
      Image(item.pic)
        .width(56)
        .height(56)
        .borderRadius(10)
        .objectFit(ImageFit.Cover)
        .backgroundColor('#E8E8ED')
      Column({ space: 4 }) {
        Text(item.title)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.textColor())
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(item.author)
          .fontSize(11)
          .fontColor(this.mutedColor())
          .maxLines(1)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Text(item.duration)
        .fontSize(11)
        .fontColor(this.mutedColor())
    }
    .width('100%')
    .padding(12)
    .backgroundColor(this.cardBg())
    .borderRadius(14)
    .onClick(() => this.play(item))
  }

  build() {
    Column({ space: 12 }) {
      Column({ space: 4 }) {
        Text('搜索')
          .fontSize(30)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.textColor())
        Text('歌曲、艺人、视频')
          .fontSize(12)
          .fontColor(this.mutedColor())
      }
      .alignItems(HorizontalAlign.Start)
      .width('100%')

      Row({ space: 8 }) {
        TextInput({ placeholder: '搜索歌曲、艺人、视频', text: this.keyword })
          .layoutWeight(1)
          .height(44)
          .fontSize(14)
          .backgroundColor(this.cardBg())
          .borderRadius(14)
          .placeholderColor(this.mutedColor())
          .fontColor(this.textColor())
          .enterKeyType(EnterKeyType.Search)
          .onChange((value: string) => {
            this.keyword = value
          })
          .onSubmit(() => {
            void this.search()
          })
        Button('搜索')
          .height(44)
          .fontSize(14)
          .fontColor('#FFFFFF')
          .backgroundColor('#FF5C93')
          .borderRadius(14)
          .stateEffect(false)
          .onClick(() => {
            void this.search()
          })
      }
      .width('100%')

      if (this.error) {
        Text(this.error)
          .fontSize(12)
          .fontColor('#FF5C93')
          .width('100%')
      }

      if (this.loading) {
        LoadingProgress()
          .width(28)
          .height(28)
          .color('#FF5C93')
          .margin({ top: 24 })
      } else {
        List({ space: 8 }) {
          ForEach(this.items, (item: NativeSearchItem) => {
            ListItem() {
              this.ResultRow(item)
            }
          }, (item: NativeSearchItem) => item.bvid)
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        if (this.total > 0) {
          Text(`共 ${this.total} 项`)
            .fontSize(11)
            .fontColor(this.mutedColor())
            .width('100%')
            .textAlign(TextAlign.Center)
        }
      }
    }
    .width('100%')
    .height('100%')
    .padding({ left: 20, right: 20, top: this.topInset + 12, bottom: 12 })
    .backgroundColor(this.pageBg())
  }
}
