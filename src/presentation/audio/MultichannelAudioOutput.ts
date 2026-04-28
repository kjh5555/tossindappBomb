/**
 * MultichannelAudioOutput.ts
 * IAudioOutput implementation that routes AUDIO_EVENT keys to one of three
 * cc.AudioSource channels (BGM / SFX / UIFeedback) per ADR-0016 § 2.
 *
 * Implements: production/sprints/sprint-6.md S6-M5
 * Governed by: ADR-0016 (HUD Safe Area + Audio 채널 분리)
 *
 * Replaces the Sprint 5 ConsoleAudioOutput when used as the
 * `IAudioOutput` injected into AudioStub. The thin Cocos wrapper
 * (`CocosAudioChannel`) provides cc.AudioSource-backed IAudioChannel
 * instances at the Cocos integration site.
 *
 * Channel volume defaults (ADR-0016 § 2):
 *   BGM        0.5
 *   SFX        0.8
 *   UIFeedback 0.9
 *
 * Routing (Sprint 5/6 AudioKey set — all in-game SFX go to SFX channel):
 *   EXPLOSION   → SFX
 *   GATE_SAFE   → SFX
 *   ROUND_CLEAR → SFX
 *   GAME_OVER   → SFX
 *
 * BGM is controlled via the dedicated `playBGM` / `stopBGM` API rather than
 * AUDIO_EVENT, because BGM has play/loop semantics that differ from one-shot SFX.
 */

import type {
  IAudioOutput,
  AudioKey,
} from '../../features/audio/AudioStub';
import type { IAudioChannel } from './IAudioChannel';

export type AudioChannelName = 'BGM' | 'SFX' | 'UIFeedback';

/** ADR-0016 § 2 default volumes. */
export const DEFAULT_CHANNEL_VOLUMES: Record<AudioChannelName, number> = {
  BGM: 0.5,
  SFX: 0.8,
  UIFeedback: 0.9,
};

/**
 * AUDIO_EVENT key → channel routing.
 * All 4 in-game keys are SFX; UI sounds will get their own keys in Sprint 7+.
 */
export const KEY_CHANNEL_ROUTING: Readonly<Record<AudioKey, AudioChannelName>> = {
  EXPLOSION: 'SFX',
  GATE_SAFE: 'SFX',
  ROUND_CLEAR: 'SFX',
  GAME_OVER: 'SFX',
};

/**
 * Three-channel audio output. Implements IAudioOutput so it slots into the
 * existing AudioStub via DI; also exposes BGM control APIs for direct callers.
 *
 * @example
 *   const output = new MultichannelAudioOutput(bgm, sfx, ui);
 *   const stub = new AudioStub(bus, output);
 *   // … bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' }) → sfx.play('EXPLOSION') …
 *   output.playBGM('main-theme'); // background music starts
 *   output.setChannelVolume('BGM', 0.3); // settings adjustment
 */
export class MultichannelAudioOutput implements IAudioOutput {
  constructor(
    private readonly bgm: IAudioChannel,
    private readonly sfx: IAudioChannel,
    private readonly uiFeedback: IAudioChannel,
  ) {
    this.bgm.setVolume(DEFAULT_CHANNEL_VOLUMES.BGM);
    this.sfx.setVolume(DEFAULT_CHANNEL_VOLUMES.SFX);
    this.uiFeedback.setVolume(DEFAULT_CHANNEL_VOLUMES.UIFeedback);
  }

  /** Routes a one-shot AUDIO_EVENT key to the appropriate channel. */
  play(key: AudioKey): void {
    const channelName = KEY_CHANNEL_ROUTING[key];
    this.getChannel(channelName).play(key);
  }

  /** Direct channel access for advanced control (BGM start/stop, volume settings). */
  getChannel(name: AudioChannelName): IAudioChannel {
    switch (name) {
      case 'BGM':
        return this.bgm;
      case 'SFX':
        return this.sfx;
      case 'UIFeedback':
        return this.uiFeedback;
    }
  }

  /**
   * Set a channel's volume. Clamps to [0, 1].
   *
   * @example
   *   output.setChannelVolume('BGM', 0.3);
   */
  setChannelVolume(name: AudioChannelName, v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    this.getChannel(name).setVolume(clamped);
  }

  /** Current volume of the named channel. */
  getChannelVolume(name: AudioChannelName): number {
    return this.getChannel(name).getVolume();
  }

  /**
   * Start looped BGM playback. Per ADR-0016 § 2 BGM uses loop=true.
   * If BGM is already playing, the channel implementation may decide to crossfade
   * or stop-then-start; the IAudioChannel.playLooped contract calls stop+play.
   */
  playBGM(clipKey: string): void {
    this.bgm.playLooped(clipKey);
  }

  /** Stop BGM (used at scene transitions or by Toss webview visibility hide event). */
  stopBGM(): void {
    this.bgm.stop();
  }
}
