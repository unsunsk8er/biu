import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import display from '@ohos.display';
import { BiuBridge } from '../common/BiuBridge';
import { NativeBiliApi, NativeSearchItem, NativeVideoPage } from '../common/NativeBiliApi';
import { NativeDownload, NativeTrack } from '../common/NativeLibrary';
import { NativeQueue } from '../common/NativeQueue';
import { NativeDownloadsPage } from './NativeDownloadsPage';
import { NativeLoginPage } from './NativeLoginPage';
import { NativePlayerPage, NativePlayerState } from './NativePlayerPage';
import { NativePlaylistsPage } from './NativePlaylistsPage';
import { NativeQueuePage } from './NativeQueuePage';
import { NativeSearchPage } from './NativeSearchPage';
import { NativeSettingsPage } from './NativeSettingsPage';

@Entry
@Component
struct Index {
  private bridge: BiuBridge = new BiuBridge(getContext(this) as common.UIAbilityContext);
  private queue: NativeQueue = new NativeQueue(getContext(this) as common.UIAbilityContext);
  @State private bottomInset: number = 0;
  @State private topInset: number = 48;
  @State private activeTab: string = '/search';
  @State private nativeSearchOpen: boolean = true;
  @State private nativePlaylistsOpen: boolean = false;
  @State private nativeDownloadsOpen: boolean = false;
  @State private queueOpen: boolean = false;
  @State private loginOpen: boolean = false;
  @State private miniVisible: boolean = false;
  @State private miniOpen: boolean = false;
  @State private currentBvid: string = '';
  @State private currentCid: number = 0;
  @State private currentPartTitle: string = '';
  @State private currentLocalPath: string = '';
  @State private localTitle: string = '';
  @State private localArtist: string = '';
  @State private localCover: string = '';
  @State private miniTitle: string = '';
  @State private miniArtist: string = '';
  @State private miniCover: string = '';
  @State private miniPlaying: boolean = false;
  @State private miniTime: number = 0;
  @State private miniDuration: number = 0;
  @StorageLink('biu-theme') private nativeTheme: string = 'light';

  private parseDuration(value: string): number {
    const parts = value.split(':');
    if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
    if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    return 0;
  }

  private applyTrack(track: NativeTrack | null): void {
    if (!track) return;
    this.currentBvid = track.localPath ? '' : track.bvid;
    this.currentCid = track.cid || 0;
    this.currentPartTitle = track.partTitle || '';
    this.currentLocalPath = track.localPath || '';
    this.localTitle = track.title;
    this.localArtist = track.artist;
    this.localCover = track.coverUrl;
    this.miniTitle = track.title;
    this.miniArtist = track.artist;
    this.miniCover = track.coverUrl;
    this.miniVisible = true;
    this.miniOpen = true;
  }

  private async playSearchSelection(item: NativeSearchItem, list: NativeSearchItem[]): Promise<void> {
    const tracks: NativeTrack[] = list.map((row: NativeSearchItem): NativeTrack => {
      return {
        bvid: row.bvid,
        title: row.title,
        artist: row.author,
        coverUrl: row.pic,
        duration: this.parseDuration(row.duration),
      };
    });
    let index = tracks.findIndex((row: NativeTrack) => row.bvid === item.bvid);
    if (index < 0) index = 0;
    try {
      const api = new NativeBiliApi(getContext(this) as common.UIAbilityContext);
      const info = await api.getVideoInfo(item.bvid);
      if (info.pages.length > 1) {
        const parts: NativeTrack[] = info.pages.map((part: NativeVideoPage): NativeTrack => {
          return {
            bvid: info.bvid,
            title: part.part || info.title,
            artist: info.artist,
            coverUrl: info.cover,
            duration: part.duration,
            cid: part.cid,
            page: part.page,
            partTitle: part.part,
          };
        });
        tracks.splice(index, 1, ...parts);
      } else {
        tracks[index].cid = info.cid;
        tracks[index].duration = info.duration;
      }
    } catch (error) {
      // Fall back to the single result; the player resolves the default part.
    }
    this.playQueueTracks(tracks, index);
  }

  private playQueueTracks(tracks: NativeTrack[], index: number): void {
    this.applyTrack(this.queue.setQueue(tracks, index));
  }

  private playQueueIndex(index: number): void {
    this.applyTrack(this.queue.setIndex(index));
  }

  private nextTrack(manual: boolean): void {
    this.applyTrack(this.queue.next(manual));
  }

  private previousTrack(): void {
    this.applyTrack(this.queue.previous());
  }

  aboutToAppear(): void {
    this.injectInsets();    window.getLastWindow(getContext(this)).then((mainWindow: window.Window) => {
      mainWindow.on('avoidAreaChange', () => {
        this.injectInsets();
      });
    }).catch(() => {});
  }

  private async injectInsets(): Promise<void> {
    try {
      const mainWindow = await window.getLastWindow(getContext(this));
      const density = display.getDefaultDisplaySync().densityPixels || 1;
      const systemArea = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      const indicatorArea = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      this.topInset = Math.max(Math.max(systemArea.topRect.height, 0) / density, 48);
      this.bottomInset = Math.max(Math.max(systemArea.bottomRect.height, indicatorArea.bottomRect.height, 0) / density, 0);
    } catch (error) {
      // Insets fall back to zero; the native pages remain usable.
    }
  }

  @Builder
  NativeTabButton(path: string, label: string) {
    Button() {
      Text(label)
        .fontSize(11)
        .fontWeight(this.activeTab === path ? FontWeight.Medium : FontWeight.Normal)
        .fontColor(this.activeTab === path ? '#FF5C93' : (this.nativeTheme === 'dark' ? '#C7C7CC' : '#8A8A8E'))
    }
    .layoutWeight(1)
    .height(56)
    .padding(0)
    .backgroundColor(Color.Transparent)
    .stateEffect(false)
    .onClick(() => {
      if (this.queueOpen) this.queueOpen = false;
      if (this.loginOpen) this.loginOpen = false;
      if (this.miniOpen) this.miniOpen = false;
      if (path === '/search') {
        this.activeTab = path;
        this.nativeSearchOpen = true;
        this.nativePlaylistsOpen = false;
        this.nativeDownloadsOpen = false;
        return;
      }
      if (path === '/playlists') {
        this.activeTab = path;
        this.nativeSearchOpen = false;
        this.nativePlaylistsOpen = true;
        this.nativeDownloadsOpen = false;
        return;
      }
      if (path === '/downloads') {
        this.activeTab = path;
        this.nativeSearchOpen = false;
        this.nativePlaylistsOpen = false;
        this.nativeDownloadsOpen = true;
        return;
      }
      this.activeTab = path;
      this.nativeSearchOpen = false;
      this.nativePlaylistsOpen = false;
      this.nativeDownloadsOpen = false;
    })
  }

  @Builder
  NativeMiniBar() {
    Row({ space: 10 }) {
      Image(this.miniCover)
        .width(38)
        .height(38)
        .borderRadius(9)
        .objectFit(ImageFit.Cover)
        .backgroundColor(this.nativeTheme === 'dark' ? '#2C2C2E' : '#E8E8ED')
      Column({ space: 2 }) {
        Text(this.miniTitle || '正在播放')
          .fontSize(13)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.nativeTheme === 'dark' ? '#F5F5F7' : '#1C1C1E')
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.miniArtist)
          .fontSize(10)
          .fontColor(this.nativeTheme === 'dark' ? '#9A9AA0' : '#8A8A8E')
          .maxLines(1)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Button(this.miniPlaying ? '暂停' : '播放')
        .height(32)
        .fontSize(12)
        .fontColor('#FF5C93')
        .backgroundColor(this.nativeTheme === 'dark' ? '#2C2C2E' : '#F2F3F5')
        .borderRadius(16)
        .stateEffect(false)
        .onClick(() => {
          this.bridge.cacheAudioFile(
            `mini-${Date.now()}`,
            this.miniPlaying ? 'native-audio://pause' : 'native-audio://resume'
          )
        })
    }
    .width('100%')
    .height(58)
    .padding({ left: 14, right: 14 })
    .backgroundColor(this.nativeTheme === 'dark' ? '#1C1C1E' : '#FFFFFF')
    .onClick(() => {
      this.miniOpen = true;
    })
  }

  @Builder
  NativeTabsBar() {
    Row() {
      this.NativeTabButton('/search', '搜索')
      this.NativeTabButton('/playlists', '歌单')
      this.NativeTabButton('/downloads', '下载')
      this.NativeTabButton('/settings', '设置')
    }
    .width('100%')
    .height(56 + this.bottomInset)
    .padding({ bottom: this.bottomInset })
    .alignItems(VerticalAlign.Top)
    .backgroundColor(this.nativeTheme === 'dark' ? '#1C1C1E' : '#F7F8FA')
  }

  onBackPress(): boolean {
    if (this.loginOpen) {
      this.loginOpen = false;
      return true;
    }
    if (this.queueOpen) {
      this.queueOpen = false;
      return true;
    }
    if (this.miniOpen) {
      this.miniOpen = false;
      return true;
    }
    if (this.nativeSearchOpen) {
      this.nativeSearchOpen = false;
      return true;
    }
    if (this.nativePlaylistsOpen) {
      this.nativePlaylistsOpen = false;
      return true;
    }
    if (this.nativeDownloadsOpen) {
      this.nativeDownloadsOpen = false;
      return true;
    }
    if (this.activeTab === '/settings') {
      this.activeTab = '/search';
      this.nativeSearchOpen = true;
      return true;
    }
    // Root tabs release back to the launcher.
    return false;
  }

  build() {
    Column() {
      Stack() {
        if (this.nativeSearchOpen) {
          NativeSearchPage({
            topInset: this.topInset,
            onSelect: (item: NativeSearchItem, list: NativeSearchItem[]) => {
              void this.playSearchSelection(item, list);
            },
          })
        }
        if (this.activeTab === '/settings') {
          NativeSettingsPage({
            topInset: this.topInset,
            onLogin: () => {
              this.loginOpen = true;
            },
          })
        }
        if (this.nativePlaylistsOpen) {
          NativePlaylistsPage({
            topInset: this.topInset,
            onPlayTrack: (track: NativeTrack, list: NativeTrack[]) => {
              let index = list.findIndex((row: NativeTrack) => row.bvid === track.bvid);
              if (index < 0) index = 0;
              this.playQueueTracks(list, index);
            },
          })
        }
        if (this.nativeDownloadsOpen) {
          NativeDownloadsPage({
            topInset: this.topInset,
            onPlayDownload: (item: NativeDownload, list: NativeDownload[]) => {
              const tracks: NativeTrack[] = list.map((row: NativeDownload): NativeTrack => {
                return {
                  bvid: row.bvid,
                  title: row.title,
                  artist: row.artist,
                  coverUrl: row.coverUrl,
                  duration: 0,
                  localPath: row.path,
                };
              });
              let index = tracks.findIndex((row: NativeTrack) => row.localPath === item.path);
              if (index < 0) index = 0;
              this.playQueueTracks(tracks, index);
            },
          })
        }
        if (this.miniVisible) {
          NativePlayerPage({
            bridge: this.bridge,
            bvid: this.currentBvid,
            cid: this.currentCid,
            partTitle: this.currentPartTitle,
            localPath: this.currentLocalPath,
            localTitle: this.localTitle,
            localArtist: this.localArtist,
            localCover: this.localCover,
            visible: this.miniOpen,
            topInset: this.topInset,
            onClose: () => {
              this.miniOpen = false;
            },
            onNext: () => {
              this.nextTrack(true);
            },
            onPrev: () => {
              this.previousTrack();
            },
            onQueue: () => {
              this.queueOpen = true;
            },
            onEnded: () => {
              this.nextTrack(false);
            },
            onState: (state: NativePlayerState) => {
              this.miniTitle = state.title || this.miniTitle;
              this.miniArtist = state.artist || this.miniArtist;
              this.miniCover = state.cover || this.miniCover;
              this.miniPlaying = state.playing;
              this.miniTime = state.time;
              this.miniDuration = state.duration;
            },
          })
        }
        if (this.queueOpen) {
          NativeQueuePage({
            queue: this.queue,
            topInset: this.topInset,
            onSelect: (index: number) => {
              this.playQueueIndex(index);
            },
            onClose: () => {
              this.queueOpen = false;
            },
          })
        }
        if (this.loginOpen) {
          NativeLoginPage({
            topInset: this.topInset,
            onClose: () => {
              this.loginOpen = false;
            },
            onSuccess: () => {
              this.loginOpen = false;
            },
          })
        }
      }
      .width('100%')
      .layoutWeight(1)
      if (this.miniVisible && !this.miniOpen) {
        this.NativeMiniBar()
      }
      this.NativeTabsBar()
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
