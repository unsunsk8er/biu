import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import display from '@ohos.display';
import { BiuBridge } from '../common/BiuBridge';
import { NativeSearchItem } from '../common/NativeBiliApi';
import { NativePlayerPage, NativePlayerState } from './NativePlayerPage';
import { NativePlaylistsPage } from './NativePlaylistsPage';
import { NativeDownloadsPage } from './NativeDownloadsPage';
import { NativeSearchPage } from './NativeSearchPage';
import { NativeSettingsPage } from './NativeSettingsPage';
import { NativeDownload, NativeTrack } from '../common/NativeLibrary';

const RESOURCE_METHODS: string[] = [
  'getVersion',
  'getPlatform',
  'openExternal',
  'exitApp',
  'request',
  'setMediaSession',
  'setMediaSessionLyric',
  'setMediaSessionState',
  'clearMediaSession',
  'setBackMode',
  'cacheAudioFile'
];

const RESOURCE_PERMISSION = '{"javascriptProxyPermission":{"urlPermissionList":[{"scheme":"resource","host":"rawfile","port":"","path":""}],"methodList":[' +
  RESOURCE_METHODS.map((methodName: string) =>
    `{"methodName":"${methodName}","urlPermissionList":[{"scheme":"resource","host":"rawfile","port":"","path":""}]}`
  ).join(',') + ']}}';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: BiuBridge = new BiuBridge(getContext(this) as common.UIAbilityContext);
  @State private showNativeTabs: boolean = true;
  @State private bottomInset: number = 0;
  @State private topInset: number = 0;
  @State private activeTab: string = '/search';
  @State private nativeSearchOpen: boolean = false;
  @State private nativePlaylistsOpen: boolean = false;
  @State private nativeDownloadsOpen: boolean = false;
  @State private miniVisible: boolean = false;
  @State private miniOpen: boolean = false;
  @State private currentBvid: string = '';
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

  aboutToAppear(): void {
    this.bridge.setController(this.controller);
    this.bridge.setAtRootListener((atRoot: boolean) => {
      this.showNativeTabs = atRoot;
    });
    window.getLastWindow(getContext(this)).then((mainWindow: window.Window) => {
      mainWindow.on('avoidAreaChange', () => {
        this.injectInsets();
      });
    }).catch(() => {});
  }

  /**
   * ArkUI lays the Web out edge-to-edge because of expandSafeArea(). Publish
   * the real status/navigation insets to the existing CSS variables so the
   * header, bottom player and tab bar stay clear of system UI.
   */
  private async injectInsets(): Promise<void> {
    try {
      const mainWindow = await window.getLastWindow(getContext(this));
      const density = display.getDefaultDisplaySync().densityPixels || 1;
      const systemArea = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      const indicatorArea = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      const top = Math.max(systemArea.topRect.height, 0) / density;
      const bottom = Math.max(systemArea.bottomRect.height, indicatorArea.bottomRect.height, 0) / density;
      this.topInset = top;
      this.bottomInset = bottom;
      const script =
        `document.documentElement.style.setProperty('--biu-inset-top','${top}px');` +
        `document.documentElement.style.setProperty('--biu-inset-bottom','${bottom}px');`;
      await this.controller.runJavaScript(script);
    } catch (error) {
      // The Web may not be attached yet; onPageEnd retries.
    }
  }

  /**
   * Native touch targets over the Web tab bar. ArkWeb on this device does not
   * reliably deliver taps to the bottom links, so these transparent native
   * buttons own the gesture and drive the hash router directly.
   */
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
      if (this.activeTab === path) return;
      this.activeTab = path;
      this.nativeSearchOpen = false;
      this.nativePlaylistsOpen = false;
      this.nativeDownloadsOpen = false;
      // Settings is fully native as well; no WebView route change is needed.
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
    // Native player collapses into the mini player instead of stopping audio.
    if (this.miniOpen) {
      this.miniOpen = false;
      return true;
    }
    // Native search closes back to the Web tab underneath.
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
    // The native settings page is a top-level ArkUI layer; back returns to the
    // previously active Web tab instead of exiting the app.
    if (this.activeTab === '/settings') {
      this.activeTab = '/search';
      this.controller.loadUrl('resource://rawfile/www/index.html#/search');
      return true;
    }
    // Root tabs return false so the system side-back gesture goes to the
    // launcher; overlays/subpages keep the gesture and resolve in React.
    if (this.bridge.shouldUseSystemBack()) {
      return false;
    }
    this.controller.runJavaScript(
      'window.__biuBackPressed ? window.__biuBackPressed() : "fallback"'
    ).catch(() => {});
    return true;
  }

  build() {
    Column() {
      Stack() {
        Web({ src: $rawfile('www/index.html'), controller: this.controller })
          .width('100%')
          .height('100%')
          .opacity(this.activeTab === '/settings' || this.nativeSearchOpen || this.nativePlaylistsOpen || this.nativeDownloadsOpen ? 0 : 1)
          .javaScriptAccess(true)
          .domStorageAccess(true)
          .fileAccess(true)
          .imageAccess(true)
          .onlineImageAccess(true)
          .mixedMode(MixedMode.All)
          .zoomAccess(false)
          .horizontalScrollBarAccess(false)
          .verticalScrollBarAccess(false)
          .userAgent('Mozilla/5.0 (Linux; Android 15; BiuHarmony 2.0.0) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36')
          .javaScriptProxy({
            object: this.bridge,
            name: 'BiuHarmony',
            methodList: ['getVersion', 'getPlatform', 'openExternal', 'exitApp', 'request',
              'setMediaSession', 'setMediaSessionLyric', 'setMediaSessionState', 'clearMediaSession', 'setBackMode',
              'cacheAudioFile'],
            controller: this.controller
          })
          .onPageEnd(() => {
            this.bridge.setController(this.controller);
            this.injectInsets();
            this.controller.runJavaScript(
              "document.documentElement.dataset.biuNativeTabs='true';"
            ).catch(() => {});
          })
        if (this.nativeSearchOpen) {
          NativeSearchPage({
            topInset: this.topInset,
            onSelect: (item: NativeSearchItem) => {
              this.currentLocalPath = '';
              this.currentBvid = item.bvid;
              this.miniTitle = item.title;
              this.miniArtist = item.author;
              this.miniCover = item.pic;
              this.miniVisible = true;
              this.miniOpen = true;
            },
          })
        }
        if (this.activeTab === '/settings') {
          NativeSettingsPage({ controller: this.controller, topInset: this.topInset })
        }
        if (this.nativePlaylistsOpen) {
          NativePlaylistsPage({
            controller: this.controller,
            topInset: this.topInset,
            onPlayTrack: (track: NativeTrack) => {
              this.currentLocalPath = '';
              this.currentBvid = track.bvid;
              this.miniTitle = track.title;
              this.miniArtist = track.artist;
              this.miniCover = track.coverUrl;
              this.miniVisible = true;
              this.miniOpen = true;
            },
          })
        }
        if (this.nativeDownloadsOpen) {
          NativeDownloadsPage({
            topInset: this.topInset,
            onPlayDownload: (item: NativeDownload) => {
              this.currentBvid = '';
              this.currentLocalPath = item.path;
              this.localTitle = item.title;
              this.localArtist = item.artist;
              this.localCover = item.coverUrl;
              this.miniTitle = item.title;
              this.miniArtist = item.artist;
              this.miniCover = item.coverUrl;
              this.miniVisible = true;
              this.miniOpen = true;
            },
          })
        }
        if (this.miniVisible) {
          NativePlayerPage({
            bridge: this.bridge,
            bvid: this.currentBvid,
            localPath: this.currentLocalPath,
            localTitle: this.localTitle,
            localArtist: this.localArtist,
            localCover: this.localCover,
            visible: this.miniOpen,
            topInset: this.topInset,
            onClose: () => {
              this.miniOpen = false;
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
      }
      .width('100%')
      .layoutWeight(1)
      if (this.miniVisible && !this.miniOpen) {
        this.NativeMiniBar()
      }
      if (this.showNativeTabs) {
        this.NativeTabsBar()
      }
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
