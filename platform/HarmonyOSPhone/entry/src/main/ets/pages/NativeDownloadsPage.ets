import { common } from '@kit.AbilityKit'
import { NativeDownload, NativeLibrary } from '../common/NativeLibrary'

@Component
export struct NativeDownloadsPage {
  topInset: number = 0
  onPlayDownload: (download: NativeDownload, queue: NativeDownload[]) => void = () => {}

  @State private downloads: NativeDownload[] = []
  @StorageLink('biu-theme') private theme: string = 'light'
  private library: NativeLibrary = new NativeLibrary(getContext(this) as common.UIAbilityContext)

  aboutToAppear(): void {
    this.library.migrateCacheFiles()
    this.downloads = this.library.getDownloads()
  }

  private remove(bvid: string): void {
    this.library.removeDownload(bvid)
    this.downloads = this.library.getDownloads()
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

  @Builder
  DownloadRow(item: NativeDownload) {
    Row({ space: 12 }) {
      Image(item.coverUrl)
        .width(54)
        .height(54)
        .borderRadius(10)
        .objectFit(ImageFit.Cover)
        .backgroundColor(this.theme === 'dark' ? '#2C2C2E' : '#E8E8ED')
      Column({ space: 4 }) {
        Text(item.title)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.textColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(item.artist)
          .fontSize(11)
          .fontColor(this.mutedColor())
          .maxLines(1)
        Text('已缓存 · 离线可听')
          .fontSize(10)
          .fontColor('#FF5C93')
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Button('删除')
        .height(30)
        .fontSize(11)
        .fontColor(this.mutedColor())
        .backgroundColor(this.theme === 'dark' ? '#2C2C2E' : '#F2F3F5')
        .borderRadius(15)
        .stateEffect(false)
        .onClick(() => this.remove(item.bvid))
    }
    .width('100%')
    .padding(12)
    .backgroundColor(this.cardBg())
    .borderRadius(14)
    .onClick(() => this.onPlayDownload(item, this.downloads))
  }

  build() {
    Column({ space: 12 }) {
      Column({ space: 4 }) {
        Text('下载')
          .fontSize(30)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.textColor())
        Text('播放时自动缓存的音频，可离线播放')
          .fontSize(12)
          .fontColor(this.mutedColor())
      }
      .alignItems(HorizontalAlign.Start)
      .width('100%')

      if (!this.downloads.length) {
        Text('还没有本地音乐')
          .fontSize(14)
          .fontColor(this.mutedColor())
          .margin({ top: 40 })
      } else {
        List({ space: 8 }) {
          ForEach(this.downloads, (item: NativeDownload) => {
            ListItem() {
              this.DownloadRow(item)
            }
          }, (item: NativeDownload) => item.bvid)
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
