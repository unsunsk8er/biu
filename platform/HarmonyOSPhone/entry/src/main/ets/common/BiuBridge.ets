import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { http } from '@kit.NetworkKit';
import { avSession } from '@kit.AVSessionKit';
import { image } from '@kit.ImageKit';
import { fileIo } from '@kit.CoreFileKit';
import { media } from '@kit.MediaKit';

interface NativeAudioPayload {
  time?: number;
  duration?: number;
  message?: string;
}

/**
 * ArkWeb enforces CORS for renderer fetches. All api/passport requests are
 * proxied through @ohos.net.http; cookies are read from / written back to the
 * WebView cookie jar so QR login and favourites survive page reloads.
 */
export class BiuBridge {
  private context: common.UIAbilityContext;
  private controller?: webview.WebviewController;
  private mediaSession?: avSession.AVSession;
  private mediaMetadata?: avSession.AVMetadata;
  private artworkUrl: string = '';
  private artwork?: image.PixelMap;
  private lyricText: string = '';
  private currentLyric: string = '';
  private allowSystemBack: boolean = false;
  private nativePlayer?: media.AVPlayer;
  private nativeRequestId: string = '';
  private nativeVolume: number = 1;
  private nativePrepared: boolean = false;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  setController(controller: webview.WebviewController): void {
    this.controller = controller;
  }

  getVersion(): string {
    return '2.0.0';
  }

  getPlatform(): string {
    return 'harmonyos';
  }

  openExternal(url: string): void {
    this.context.startAbility({
      action: 'ohos.want.action.viewData',
      uri: url
    }).catch(() => {});
  }

  exitApp(): void {
    this.context.terminateSelf();
  }

  setBackMode(allowSystemBack: boolean): void {
    this.allowSystemBack = allowSystemBack;
  }

  shouldUseSystemBack(): boolean {
    return this.allowSystemBack;
  }

  /**
   * Direct native audio playback. The WebView only sends commands and renders
   * state; AVPlayer owns the network stream, so backgrounding the ability no
   * longer pauses the HTML media pipeline.
   */
  playNativeAudio(requestId: string, url: string): void {
    void this.startNativeAudio(requestId, url);
  }

  pauseNativeAudio(): void {
    this.nativePlayer?.pause();
  }

  resumeNativeAudio(): void {
    const player = this.nativePlayer;
    if (player && this.nativePrepared) player.play();
  }

  seekNativeAudio(positionSec: number): void {
    const player = this.nativePlayer;
    if (!player || !this.nativePrepared) return;
    player.seek(Math.max(0, positionSec) * 1000);
  }

  setNativeVolume(volume: number): void {
    this.nativeVolume = Math.max(0, Math.min(1, volume));
    if (this.nativePrepared) this.nativePlayer?.setVolume(this.nativeVolume);
  }

  stopNativeAudio(): void {
    this.nativePrepared = false;
    const player = this.nativePlayer;
    this.nativePlayer = undefined;
    if (player) player.release().catch(() => {});
    this.emitNativeEvent('stopped', {});
  }

  private async startNativeAudio(requestId: string, url: string): Promise<void> {
    this.stopNativeAudio();
    try {
      const player = await media.createAVPlayer();
      this.nativePlayer = player;
      this.nativePrepared = false;
      this.bindNativePlayer(player, requestId);
      const source = media.createMediaSourceWithUrl(url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com'
      });
      await player.setMediaSource(source);
    } catch (error) {
      this.emitNativeEvent('error', { message: JSON.stringify(error) });
    }
  }

  private bindNativePlayer(player: media.AVPlayer, requestId: string): void {
    player.on('stateChange', async (state: string) => {
      if (player !== this.nativePlayer) return;
      if (state === 'initialized') {
        try {
          await player.prepare();
        } catch (error) {
          this.emitNativeEvent('error', { message: JSON.stringify(error) });
        }
      } else if (state === 'prepared') {
        this.nativePrepared = true;
        player.setVolume(this.nativeVolume);
        player.play();
        this.emitNativeEvent('duration', { duration: player.duration / 1000 });
      } else if (state === 'playing') {
        this.emitNativeEvent('playing', {});
      } else if (state === 'paused') {
        this.emitNativeEvent('paused', {});
      } else if (state === 'completed') {
        this.emitNativeEvent('ended', {});
      } else if (state === 'error') {
        this.emitNativeEvent('error', { message: 'native player error' });
      }
    });
    player.on('timeUpdate', (time: number) => {
      if (player !== this.nativePlayer) return;
      this.emitNativeEvent('time', {
        time: time / 1000,
        duration: player.duration / 1000
      });
    });
    player.on('durationUpdate', (duration: number) => {
      if (player !== this.nativePlayer) return;
      this.emitNativeEvent('duration', { duration: duration / 1000 });
    });
    player.on('error', (error: Error) => {
      if (player !== this.nativePlayer) return;
      this.emitNativeEvent('error', { message: JSON.stringify(error) });
    });
    this.nativeRequestId = requestId;
  }

  private emitNativeEvent(type: string, payload: NativeAudioPayload): void {
    if (!this.controller) return;
    const script =
      `window.__biuNativeAudio && window.__biuNativeAudio(${JSON.stringify(type)}, ${JSON.stringify(JSON.stringify(payload))})`;
    this.controller.runJavaScript(script).catch(() => {});
  }

  cacheAudioFile(requestId: string, url: string, cacheKey?: string): void {
    void this.downloadAudioFile(requestId, url, cacheKey || requestId);
  }

  private async downloadAudioFile(requestId: string, url: string, cacheKey: string): Promise<void> {
    const base = this.cacheBaseName(cacheKey);
    const cachedPath = `${this.context.cacheDir}/${base}.mp4`;
    try {
      // Reusing the already transcoded file avoids re-downloading a song on
      // every playback and is also what keeps the cache bounded over time.
      if (this.cachedFileExists(cachedPath)) {
        this.pruneAudioCache();
        this.emitAudioFile(requestId, `file://${cachedPath}`);
        return;
      }
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*'
      };
      if (url.indexOf('bilibili') >= 0 || url.indexOf('bilivideo') >= 0) {
        headers['Referer'] = 'https://www.bilibili.com/';
        headers['Origin'] = 'https://www.bilibili.com';
      }
      const response = await new Promise<http.HttpResponse>((resolve, reject) => {
        http.createHttp().request(url, {
          method: http.RequestMethod.GET,
          header: headers,
          expectDataType: http.HttpDataType.ARRAY_BUFFER,
          connectTimeout: 15000,
          readTimeout: 60000,
          usingCache: false
        }, (error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      });
      if (response.responseCode < 200 || response.responseCode >= 300) {
        console.error(`[biu-native-cache] http ${response.responseCode} ${url.slice(0, 120)}`);
        this.emitAudioFile(requestId, '');
        return;
      }
      const buffer = response.result as ArrayBuffer;
      if (!buffer || buffer.byteLength === 0) {
        console.error('[biu-native-cache] empty body');
        this.emitAudioFile(requestId, '');
        return;
      }
      const rawPath = `${this.context.cacheDir}/${base}.m4s`;
      const file = fileIo.openSync(rawPath,
        fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
      fileIo.writeSync(file.fd, buffer);
      fileIo.closeSync(file);
      const playable = await this.transcodeAudioFile(rawPath, cachedPath);
      if (playable !== rawPath) {
        try {
          fileIo.unlinkSync(rawPath);
        } catch (error) {
          // Keep the raw segment if cleanup fails; it is only cache debris.
        }
      }
      this.pruneAudioCache();
      this.emitAudioFile(requestId, `file://${playable}`);
    } catch (error) {
      console.error(`[biu-native-cache] failed ${JSON.stringify(error)}`);
      this.emitAudioFile(requestId, '');
    }
  }

  private cacheBaseName(cacheKey: string): string {
    const safe = String(cacheKey || '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .slice(0, 100);
    return `biu-audio-v3-${safe || 'track'}`;
  }

  private cachedFileExists(path: string): boolean {
    try {
      return fileIo.statSync(path).size > 1024;
    } catch (error) {
      return false;
    }
  }

  private pruneAudioCache(): void {
    try {
      const names = fileIo.listFileSync(this.context.cacheDir)
        .filter((name: string) => name.indexOf('biu-audio-') === 0);
      const entries: Array<[string, number, number]> = [];
      for (const name of names) {
        const path = `${this.context.cacheDir}/${name}`;
        try {
          const stat = fileIo.statSync(path);
          entries.push([path, stat.mtime, stat.size]);
        } catch (error) {
          // Ignore file races; the next prune will retry.
        }
      }
      entries.sort((a: [string, number, number], b: [string, number, number]) => b[1] - a[1]);
      let total = 0;
      for (let i = 0; i < entries.length; i++) {
        total += entries[i][2];
        if (i >= 20 || total > 250 * 1024 * 1024) {
          try {
            fileIo.unlinkSync(entries[i][0]);
          } catch (error) {
            // A file in use may be skipped; it will be retried next time.
          }
        }
      }
    } catch (error) {
      // Cache maintenance must never block playback.
    }
  }

  /**
   * Bilibili DASH audio is fragmented MP4. AVPlayer cannot open the .m4s
   * segment directly (EXTERNAL_RENDERER_FAILED), so transcode it to a standard
   * MP4 file that the native player can use in the background.
   */
  private async transcodeAudioFile(sourcePath: string, targetPath: string): Promise<string> {
    let sourceFile: fileIo.File | undefined;
    let targetFile: fileIo.File | undefined;
    let transcoder: media.AVTranscoder | undefined;
    try {
      sourceFile = fileIo.openSync(sourcePath, fileIo.OpenMode.READ_ONLY);
      targetFile = fileIo.openSync(targetPath,
        fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
      transcoder = await media.createAVTranscoder();
      transcoder.fdSrc = { fd: sourceFile.fd };
      transcoder.fdDst = targetFile.fd;

      const completed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('audio transcode timeout'));
        }, 90000);
        transcoder!.on('complete', () => {
          clearTimeout(timer);
          resolve();
        });
        transcoder!.on('error', (error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      await transcoder.prepare({
        fileFormat: media.ContainerFormatType.CFT_MPEG_4,
        audioCodec: media.CodecMimeType.AUDIO_AAC,
        audioBitrate: 192000
      });
      await transcoder.start();
      await completed;
      return targetPath;
    } catch (error) {
      // Keep the old raw-cache fallback for devices whose transcoder rejects
      // the source; foreground HTML audio can still play it.
      return sourcePath;
    } finally {
      if (transcoder) {
        try {
          await transcoder.release();
        } catch (error) {
          // ignore release failure
        }
      }
      if (targetFile) {
        try {
          fileIo.closeSync(targetFile);
        } catch (error) {
          // ignore close failure
        }
      }
      if (sourceFile) {
        try {
          fileIo.closeSync(sourceFile);
        } catch (error) {
          // ignore close failure
        }
      }
    }
  }

  private emitAudioFile(requestId: string, path: string): void {
    if (!this.controller) return;
    const script =
      `window.__biuAudioFile && window.__biuAudioFile(${JSON.stringify(requestId)}, ${JSON.stringify(path)})`;
    this.controller.runJavaScript(script).catch(() => {});
  }

  setMediaSession(
    assetId: string,
    title: string,
    artist: string,
    album: string,
    coverUrl: string,
    lyric: string,
    duration: number
  ): void {
    this.lyricText = lyric || '';
    this.currentLyric = '';
    void this.applyMediaSession(assetId, title, artist, album, coverUrl, duration);
  }

  setMediaSessionLyric(lyric: string, singleLine: string): void {
    this.lyricText = lyric || '';
    this.currentLyric = singleLine || '';
    void this.applyMediaLyric();
  }

  setMediaSessionState(isPlaying: boolean, positionSec: number, durationSec: number): void {
    void this.applyMediaState(isPlaying, positionSec, durationSec);
  }

  clearMediaSession(): void {
    const session = this.mediaSession;
    this.mediaSession = undefined;
    this.mediaMetadata = undefined;
    this.artwork = undefined;
    this.artworkUrl = '';
    this.lyricText = '';
    this.currentLyric = '';
    if (session) {
      session.deactivate().then(() => session.destroy()).catch(() => {});
    }
  }

  private async ensureMediaSession(): Promise<avSession.AVSession | undefined> {
    try {
      if (this.mediaSession) return this.mediaSession;
      const session = await avSession.createAVSession(this.context, 'biu', 'audio');
      this.mediaSession = session;
      session.on('play', () => this.emitCommand('play'));
      session.on('pause', () => this.emitCommand('pause'));
      session.on('stop', () => this.emitCommand('stop'));
      session.on('playNext', () => this.emitCommand('next'));
      session.on('playPrevious', () => this.emitCommand('previous'));
      session.on('seek', (time: number) => this.emitCommand('seek', time));
      await session.activate();
      return session;
    } catch (error) {
      this.mediaSession = undefined;
      return undefined;
    }
  }

  private async applyMediaSession(
    assetId: string,
    title: string,
    artist: string,
    album: string,
    coverUrl: string,
    durationSec: number
  ): Promise<void> {
    try {
      const session = await this.ensureMediaSession();
      if (!session) return;
      const artwork = await this.loadArtwork(coverUrl);
      const metadata: avSession.AVMetadata = {
        assetId: assetId || 'biu',
        title: title || '未命名歌曲',
        artist: artist || 'biu',
        album: album || '',
        duration: Math.max(0, Math.round(durationSec * 1000)),
        lyric: this.lyricText,
        singleLyricText: this.currentLyric
      };
      if (artwork) {
        metadata.mediaImage = artwork;
      } else if (coverUrl) {
        // The system may still load a reachable URI if PixelMap decoding failed.
        metadata.mediaImage = coverUrl;
      }
      this.mediaMetadata = metadata;
      await session.setAVMetadata(metadata);
    } catch (error) {
      // Media center sync must never terminate playback.
    }
  }

  private async applyMediaLyric(): Promise<void> {
    try {
      const session = this.mediaSession;
      const metadata = this.mediaMetadata;
      if (!session || !metadata) return;
      metadata.lyric = this.lyricText;
      metadata.singleLyricText = this.currentLyric;
      await session.setAVMetadata(metadata);
    } catch (error) {
      // Ignore transient session errors.
    }
  }

  private async applyMediaState(isPlaying: boolean, positionSec: number, durationSec: number): Promise<void> {
    try {
      const session = await this.ensureMediaSession();
      if (!session) return;
      const state = isPlaying
        ? avSession.PlaybackState.PLAYBACK_STATE_PLAY
        : avSession.PlaybackState.PLAYBACK_STATE_PAUSE;
      const position = Math.max(0, positionSec || 0);
      const duration = Math.max(0, durationSec || 0);
      await session.setAVPlaybackState({
        state,
        speed: 1,
        position: {
          elapsedTime: Math.round(position * 1000),
          updateTime: Date.now()
        },
        bufferedTime: Math.round(duration * 1000),
        volume: 1,
        maxVolume: 1
      });
    } catch (error) {
      // Ignore transient session errors.
    }
  }

  private async loadArtwork(url: string): Promise<image.PixelMap | undefined> {
    if (!url) return undefined;
    if (url === this.artworkUrl && this.artwork) return this.artwork;
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'image/*'
      };
      if (url.indexOf('bilibili') >= 0) {
        headers['Referer'] = 'https://www.bilibili.com/';
      }
      const response = await new Promise<http.HttpResponse>((resolve, reject) => {
        http.createHttp().request(url, {
          method: http.RequestMethod.GET,
          header: headers,
          expectDataType: http.HttpDataType.ARRAY_BUFFER,
          connectTimeout: 10000,
          readTimeout: 15000,
          usingCache: true
        }, (error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      });
      if (response.responseCode < 200 || response.responseCode >= 300) return undefined;
      const buffer = response.result as ArrayBuffer;
      if (!buffer || buffer.byteLength === 0) return undefined;
      const source = image.createImageSource(buffer);
      const pixel = await source.createPixelMap({
        desiredSize: { width: 512, height: 512 }
      });
      source.release();
      this.artworkUrl = url;
      this.artwork = pixel;
      return pixel;
    } catch (error) {
      return undefined;
    }
  }

  private emitCommand(command: string, value?: number): void {
    if (!this.controller) return;
    const valuePart = typeof value === 'number' ? `,${JSON.stringify(value)}` : '';
    const script =
      `window.__biuAvCommand && window.__biuAvCommand(${JSON.stringify(command)}${valuePart})`;
    this.controller.runJavaScript(script).catch(() => {});
  }

  request(requestId: string, url: string, method: string, headersJson: string, body: string): void {
    try {
      const headers = this.parseHeaders(headersJson);
    const cookie = webview.WebCookieManager.fetchCookieSync(url);
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    const isPlayUrl = url.indexOf('/x/player/playurl') >= 0;
    const isBilibili = url.indexOf('bilibili.com') >= 0;
    const desktopUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    if (isPlayUrl) {
      // Match the WebView UA: desktop playurl responses point at CDN URLs that
      // require a desktop Referer, which <audio> cannot send.
      headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 15; BiuHarmony 2.0.0) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    } else if (isBilibili) {
      headers['Referer'] = 'https://www.bilibili.com/';
      headers['Origin'] = 'https://www.bilibili.com';
      headers['User-Agent'] = desktopUa;
    } else {
      // Lyrics/cover catalogues must not receive a Bilibili Origin/Referer.
      headers['User-Agent'] = desktopUa;
    }

    const options: http.HttpRequestOptions = {
      method: this.toMethod(method),
      header: headers,
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: 15000,
      readTimeout: 30000,
      usingCache: false
    };
    if (body) {
      options.extraData = body;
    }

    http.createHttp().request(url, options, (error, data) => {
      try {
        if (error) {
          this.resolve(requestId, 0, '{}', JSON.stringify({ error: error.message }));
          return;
        }
        this.storeCookies(data.header, url);
        const result = data.result;
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        this.resolve(requestId, data.responseCode, JSON.stringify(data.header ?? {}), text);
      } catch (callbackError) {
        // An exception on the HTTP callback thread becomes an uncaught JsError
        // and terminates the HAP; keep every path contained.
        this.resolve(requestId, 0, '{}', JSON.stringify({ error: 'native callback failed' }));
        }
      });
    } catch (setupError) {
      // fetchCookieSync / createHttp can throw synchronously on malformed input.
      this.resolve(requestId, 0, '{}', JSON.stringify({ error: 'native request setup failed' }));
    }
  }

  private resolve(requestId: string, status: number, headersJson: string, body: string): void {
    if (!this.controller) {
      return;
    }
    const payload = JSON.stringify({ status, headers: headersJson, body });
    const script = `window.__biuHarmonyResolve && window.__biuHarmonyResolve(${JSON.stringify(requestId)}, ${payload})`;
    this.controller.runJavaScript(script).catch(() => {});
  }

  private parseHeaders(headersJson: string): Record<string, string> {
    try {
      return JSON.parse(headersJson) as Record<string, string>;
    } catch (error) {
      return {};
    }
  }

  private toMethod(method: string): http.RequestMethod {
    switch (method.toUpperCase()) {
      case 'POST':
        return http.RequestMethod.POST;
      case 'PUT':
        return http.RequestMethod.PUT;
      case 'DELETE':
        return http.RequestMethod.DELETE;
      default:
        return http.RequestMethod.GET;
    }
  }

  private storeCookies(header: Object, url: string): void {
    // Only Bilibili cookies belong in the WebView jar. Third-party metadata
    // catalogues often return cookies in non-RFC6265 forms, and passing those to
    // configCookieSync throws 17100005 and kills the app via JsError.
    if (url.indexOf('bilibili.com') < 0) {
      return;
    }
    const values = header as Record<string, string | string[]>;
    const setCookie = values['set-cookie'] ?? values['Set-Cookie'];
    if (!setCookie) {
      return;
    }
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const cookie of cookies) {
      try {
        webview.WebCookieManager.configCookieSync('https://www.bilibili.com', cookie, false, true);
      } catch (error) {
        // Ignore malformed/expired cookies instead of letting an HTTP callback
        // exception terminate the whole application.
      }
    }
  }
}