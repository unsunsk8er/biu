import { webview } from '@kit.ArkWeb';
import { media } from '@kit.MediaKit';
import { fileIo } from '@kit.CoreFileKit';
import { BusinessError } from '@kit.BasicServicesKit';

/**
 * Native audio takeover for HarmonyOS. ArkWeb pauses its HTML <audio> pipeline
 * when the ability is backgrounded; the native AVPlayer owns the local M4A
 * stream instead, so it keeps running behind the Home screen.
 */
export class NativeAudioPlayer implements webview.NativeMediaPlayerBridge {
  private handler: webview.NativeMediaPlayerHandler;
  private source: string;
  private sourceFile?: fileIo.File;
  private player?: media.AVPlayer;
  private prepared: boolean = false;
  private released: boolean = false;
  private pendingPlay: boolean = false;
  private pendingSeek: number = -1;
  private pendingVolume: number = 1;
  private pendingMuted: boolean = false;
  private pendingRate: number = 1;

  constructor(handler: webview.NativeMediaPlayerHandler, mediaInfo: webview.MediaInfo) {
    this.handler = handler;
    const sources = mediaInfo.mediaSrcList || [];
    const chosen = sources.find((item: webview.MediaSourceInfo) => item.source.startsWith('file://')) || sources[0];
    this.source = chosen ? chosen.source : '';
    this.pendingVolume = mediaInfo.muted ? 0 : 1;
    this.pendingMuted = mediaInfo.muted;
    void this.init();
  }

  private async init(): Promise<void> {
    if (!this.source) {
      this.handler.handleError(webview.MediaError.FORMAT_ERROR, 'empty audio source');
      return;
    }
    try {
      const player = await media.createAVPlayer();
      if (this.released) {
        await player.release();
        return;
      }
      this.player = player;
      this.bind(player);
      // AVPlayer rejects file:// URLs. An independent local file is addressed
      // as fd://<fd>; the descriptor stays open until release().
      if (this.source.startsWith('file://')) {
        const path = this.source.slice('file://'.length);
        this.sourceFile = fileIo.openSync(path, fileIo.OpenMode.READ_ONLY);
        player.url = `fd://${this.sourceFile.fd}`;
      } else {
        player.url = this.source;
      }
    } catch (error) {
      this.fail(error);
    }
  }

  private bind(player: media.AVPlayer): void {
    player.on('stateChange', async (state: string) => {
      if (state === 'initialized') {
        await player.prepare();
      } else if (state === 'prepared') {
        this.prepared = true;
        this.handler.handleReadyStateChanged(webview.ReadyState.HAVE_ENOUGH_DATA);
        player.setVolume(this.pendingMuted ? 0 : this.pendingVolume);
        if (this.pendingRate !== 1) player.setSpeed(this.speedFor(this.pendingRate));
        if (this.pendingSeek >= 0) {
          const target = this.pendingSeek;
          this.pendingSeek = -1;
          player.seek(target * 1000);
        }
        if (this.pendingPlay) {
          this.pendingPlay = false;
          player.play();
        }
      } else if (state === 'playing') {
        this.handler.handleStatusChanged(webview.PlaybackStatus.PLAYING);
      } else if (state === 'paused') {
        this.handler.handleStatusChanged(webview.PlaybackStatus.PAUSED);
      } else if (state === 'completed') {
        this.handler.handleEnded();
      } else if (state === 'released') {
        this.player = undefined;
      }
    });
    player.on('timeUpdate', (time: number) => {
      this.handler.handleTimeUpdate(time / 1000);
    });
    player.on('durationUpdate', (duration: number) => {
      this.handler.handleDurationChanged(duration / 1000);
    });
    player.on('seekDone', () => {
      this.handler.handleSeekFinished();
    });
    player.on('error', (error: BusinessError) => {
      this.fail(error);
    });
  }

  private fail(error: Object): void {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    this.handler.handleError(webview.MediaError.DECODE_ERROR, message);
  }

  private speedFor(rate: number): media.PlaybackSpeed {
    if (rate < 0.9) return media.PlaybackSpeed.SPEED_FORWARD_0_75_X;
    if (rate < 1.15) return media.PlaybackSpeed.SPEED_FORWARD_1_00_X;
    if (rate < 1.4) return media.PlaybackSpeed.SPEED_FORWARD_1_25_X;
    if (rate < 1.9) return media.PlaybackSpeed.SPEED_FORWARD_1_75_X;
    return media.PlaybackSpeed.SPEED_FORWARD_2_00_X;
  }

  updateRect(x: number, y: number, width: number, height: number): void {
  }

  play(): void {
    if (this.prepared && this.player) {
      this.player.play();
    } else {
      this.pendingPlay = true;
    }
  }

  pause(): void {
    this.pendingPlay = false;
    this.player?.pause();
  }

  seek(targetTime: number): void {
    if (this.prepared && this.player) {
      this.handler.handleSeeking();
      this.player.seek(targetTime * 1000);
    } else {
      this.pendingSeek = targetTime;
    }
  }

  setVolume(volume: number): void {
    this.pendingVolume = Math.max(0, Math.min(1, volume));
    this.player?.setVolume(this.pendingMuted ? 0 : this.pendingVolume);
    this.handler.handleVolumeChanged(this.pendingVolume);
  }

  setMuted(muted: boolean): void {
    this.pendingMuted = muted;
    this.player?.setVolume(muted ? 0 : this.pendingVolume);
    this.handler.handleMutedChanged(muted);
  }

  setPlaybackRate(playbackRate: number): void {
    this.pendingRate = playbackRate;
    if (this.player) this.player.setSpeed(this.speedFor(playbackRate));
    this.handler.handlePlaybackRateChanged(playbackRate);
  }

  release(): void {
    this.released = true;
    this.pendingPlay = false;
    const player = this.player;
    this.player = undefined;
    if (player) {
      player.release().catch(() => {});
    }
    if (this.sourceFile) {
      try {
        fileIo.closeSync(this.sourceFile);
      } catch (error) {
        // ignore close failure
      }
      this.sourceFile = undefined;
    }
  }

  enterFullscreen(): void {
  }

  exitFullscreen(): void {
  }

  resumePlayer(): void {
    this.play();
  }

  suspendPlayer(type: webview.SuspendType): void {
    // Do not pause for ordinary backgrounding; only discard on BFCache.
    if (type === webview.SuspendType.ENTER_BACK_FORWARD_CACHE) this.pause();
  }
}
