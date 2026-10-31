import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import display from '@ohos.display';
import { BiuBridge } from '../common/BiuBridge';
import { NativeSettingsPage } from './NativeSettingsPage';

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
      if (this.activeTab === path) return;
      this.activeTab = path;
      // Settings is the first fully native page. Keep the WebView alive
      // underneath so playback UI and audio state are not destroyed.
      if (path === '/settings') return;
      // Other tabs still use the WebView fallback until their native rewrite.
      this.controller.loadUrl(`resource://rawfile/www/index.html#${path}`);
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
          .opacity(this.activeTab === '/settings' ? 0 : 1)
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
        if (this.activeTab === '/settings') {
          NativeSettingsPage({ controller: this.controller, topInset: this.topInset })
        }
      }
      .width('100%')
      .layoutWeight(1)
      if (this.showNativeTabs) {
        this.NativeTabsBar()
      }
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
