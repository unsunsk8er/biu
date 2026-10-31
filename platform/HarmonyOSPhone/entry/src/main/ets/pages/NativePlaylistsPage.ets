import { common } from '@kit.AbilityKit'
import { webview } from '@kit.ArkWeb'
import { NativeLibrary, NativePlaylist, NativeTrack } from '../common/NativeLibrary'

@Component
export struct NativePlaylistsPage {
  controller: webview.WebviewController = new webview.WebviewController()
  topInset: number = 0
  onPlayTrack: (track: NativeTrack) => void = () => {}

  @State private playlists: NativePlaylist[] = []
  @State private selectedId: string = ''
  @State private creating: boolean = false
  @State private draftName: string = ''
  @State private loading: boolean = true
  @StorageLink('biu-theme') private theme: string = 'light'
  private library: NativeLibrary = new NativeLibrary(getContext(this) as common.UIAbilityContext)

  aboutToAppear(): void {
    void this.load()
  }

  private async load(): Promise<void> {
    this.loading = true
    try {
      await this.library.migrateFromWeb(this.controller)
      this.playlists = this.library.getPlaylists()
    } catch (error) {
      this.playlists = this.library.getPlaylists()
    } finally {
      this.loading = false
    }
  }

  private selected(): NativePlaylist | undefined {
    return this.playlists.find((item) => item.id === this.selectedId)
  }

  private create(): void {
    const name = this.draftName.trim()
    if (!name) return
    this.library.createPlaylist(name)
    this.draftName = ''
    this.creating = false
    this.playlists = this.library.getPlaylists()
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
  TrackRow(track: NativeTrack) {
    Row({ space: 12 }) {
      Image(track.coverUrl)
        .width(48)
        .height(48)
        .borderRadius(10)
        .objectFit(ImageFit.Cover)
        .backgroundColor(this.theme === 'dark' ? '#2C2C2E' : '#E8E8ED')
      Column({ space: 3 }) {
        Text(track.title)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.textColor())
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(track.artist)
          .fontSize(11)
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
    .onClick(() => this.onPlayTrack(track))
  }

  @Builder
  PlaylistRow(playlist: NativePlaylist) {
    Row({ space: 12 }) {
      Image(playlist.coverUrl || playlist.tracks[0]?.coverUrl || '')
        .width(58)
        .height(58)
        .borderRadius(12)
        .objectFit(ImageFit.Cover)
        .backgroundColor(this.theme === 'dark' ? '#2C2C2E' : '#E8E8ED')
      Column({ space: 4 }) {
        Text(playlist.name)
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.textColor())
          .maxLines(1)
        Text(`${playlist.tracks.length} 首歌曲`)
          .fontSize(11)
          .fontColor(this.mutedColor())
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Text('›').fontSize(22).fontColor(this.mutedColor())
    }
    .width('100%')
    .padding(12)
    .backgroundColor(this.cardBg())
    .borderRadius(14)
    .onClick(() => {
      this.selectedId = playlist.id
    })
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        if (this.selectedId) {
          Button('‹ 返回')
            .height(32)
            .fontSize(12)
            .fontColor(this.mutedColor())
            .backgroundColor(this.cardBg())
            .borderRadius(16)
            .stateEffect(false)
            .onClick(() => {
              this.selectedId = ''
            })
        }
        Text(this.selectedId ? (this.selected()?.name || '歌单') : '歌单')
          .fontSize(this.selectedId ? 24 : 30)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.textColor())
          .layoutWeight(1)
        if (!this.selectedId) {
          Button('新建')
            .height(32)
            .fontSize(12)
            .fontColor('#FF5C93')
            .backgroundColor(this.cardBg())
            .borderRadius(16)
            .stateEffect(false)
            .onClick(() => {
              this.creating = !this.creating
            })
        }
      }
      .width('100%')

      if (!this.selectedId) {
        Text('本地歌单会同步导入；播放列表保存在原生 Preferences')
          .fontSize(11)
          .fontColor(this.mutedColor())
          .width('100%')

        if (this.creating) {
          Row({ space: 8 }) {
            TextInput({ placeholder: '歌单名称', text: this.draftName })
              .layoutWeight(1)
              .height(40)
              .fontSize(13)
              .backgroundColor(this.cardBg())
              .borderRadius(12)
              .onChange((value: string) => {
                this.draftName = value
              })
            Button('创建')
              .height(40)
              .fontSize(13)
              .fontColor('#FFFFFF')
              .backgroundColor('#FF5C93')
              .borderRadius(12)
              .stateEffect(false)
              .onClick(() => this.create())
          }
          .width('100%')
        }

        if (this.loading) {
          LoadingProgress().width(28).height(28).color('#FF5C93').margin({ top: 24 })
        } else if (!this.playlists.length) {
          Text('还没有歌单')
            .fontSize(14)
            .fontColor(this.mutedColor())
            .margin({ top: 30 })
        } else {
          List({ space: 8 }) {
            ForEach(this.playlists, (playlist: NativePlaylist) => {
              ListItem() {
                this.PlaylistRow(playlist)
              }
            }, (playlist: NativePlaylist) => playlist.id)
          }
          .layoutWeight(1)
          .scrollBar(BarState.Off)
        }
      } else {
        List({ space: 8 }) {
          ForEach(this.selected()?.tracks || [], (track: NativeTrack) => {
            ListItem() {
              this.TrackRow(track)
            }
          }, (track: NativeTrack) => track.bvid)
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
