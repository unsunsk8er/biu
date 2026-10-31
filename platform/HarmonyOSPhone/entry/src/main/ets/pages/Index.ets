import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import display from '@ohos.display';
import { BiuBridge } from '../common/BiuBridge';

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

  aboutToAppear(): void {
    this.bridge.setController(this.controller);
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
      const script =
        `document.documentElement.style.setProperty('--biu-inset-top','${top}px');` +
        `document.documentElement.style.setProperty('--biu-inset-bottom','${bottom}px');`;
      await this.controller.runJavaScript(script);
    } catch (error) {
      // The Web may not be attached yet; onPageEnd retries.
    }
  }

  onBackPress(): boolean {
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
      Web({ src: $rawfile('www/index.html'), controller: this.controller })
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
            'cacheAudioFile', 'playNativeAudio', 'pauseNativeAudio', 'resumeNativeAudio', 'seekNativeAudio',
            'setNativeVolume', 'stopNativeAudio'],
          controller: this.controller,
          permission: RESOURCE_PERMISSION
        })
        .onPageEnd(() => {
          this.bridge.setController(this.controller);
          this.injectInsets();
        })
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
