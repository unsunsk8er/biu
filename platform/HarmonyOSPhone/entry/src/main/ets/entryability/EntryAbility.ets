import { AbilityConstant, ConfigurationConstant, UIAbility, Want, wantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';

const DOMAIN = 0x0000;

export default class EntryAbility extends UIAbility {
  private audioTaskStarted: boolean = false;

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, 'biu', '%{public}s', 'Ability onCreate');
    void this.startAudioBackgroundTask();
  }

  private async startAudioBackgroundTask(): Promise<void> {
    if (this.audioTaskStarted) return;
    try {
      const target: Want = {
        bundleName: this.context.abilityInfo.bundleName,
        abilityName: this.context.abilityInfo.name
      };
      const info: wantAgent.WantAgentInfo = {
        wants: [target],
        operationType: wantAgent.OperationType.START_ABILITY,
        requestCode: 0,
        wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
      };
      const agent = await wantAgent.getWantAgent(info);
      await backgroundTaskManager.startBackgroundRunning(
        this.context,
        backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK,
        agent
      );
      this.audioTaskStarted = true;
      hilog.info(DOMAIN, 'biu', '%{public}s', 'Audio background task started');
    } catch (error) {
      hilog.error(DOMAIN, 'biu', 'Audio background task failed: %{public}s', JSON.stringify(error));
    }
  }

  onDestroy(): void {
    if (this.audioTaskStarted) {
      backgroundTaskManager.stopBackgroundRunning(this.context).catch(() => {});
    }
    hilog.info(DOMAIN, 'biu', '%{public}s', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, 'biu', 'Failed to load content: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, 'biu', '%{public}s', 'Succeeded in loading content');
    });

    try {
      const mainWindow = windowStage.getMainWindowSync();
      mainWindow.setWindowLayoutFullScreen(true);
    } catch (error) {
      hilog.error(DOMAIN, 'biu', 'Failed to enable full screen: %{public}s', JSON.stringify(error));
    }

    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    } catch (error) {
      hilog.error(DOMAIN, 'biu', 'Failed to set color mode: %{public}s', JSON.stringify(error));
    }
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, 'biu', '%{public}s', 'Ability onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, 'biu', '%{public}s', 'Ability onForeground');
  }

  onBackground(): void {
    hilog.info(DOMAIN, 'biu', '%{public}s', 'Ability onBackground');
  }
}
