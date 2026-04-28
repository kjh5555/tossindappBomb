/**
 * MultichannelAudioOutput integration test — Sprint 6 S6-M5
 *
 * Verifies:
 *  - 3-channel routing (BGM / SFX / UIFeedback) per ADR-0016 § 2
 *  - Default volumes 0.5 / 0.8 / 0.9 applied at construction
 *  - All AudioKey values route to SFX (Sprint 5/6 mapping)
 *  - Volume clamping to [0, 1]
 *  - BGM play/stop/loop API
 *  - Integration with AudioStub via IAudioOutput contract
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { AudioStub, AudioKey } from '../../../src/features/audio/AudioStub';
import {
  MultichannelAudioOutput,
  DEFAULT_CHANNEL_VOLUMES,
  KEY_CHANNEL_ROUTING,
  AudioChannelName,
} from '../../../src/presentation/audio/MultichannelAudioOutput';
import type { IAudioChannel } from '../../../src/presentation/audio/IAudioChannel';

class FakeAudioChannel implements IAudioChannel {
  readonly playCalls: string[] = [];
  readonly playLoopedCalls: string[] = [];
  stopCallCount = 0;
  private volume = 1.0;

  play(clipKey: string): void {
    this.playCalls.push(clipKey);
  }
  playLooped(clipKey: string): void {
    this.playLoopedCalls.push(clipKey);
  }
  stop(): void {
    this.stopCallCount++;
  }
  setVolume(v: number): void {
    this.volume = v;
  }
  getVolume(): number {
    return this.volume;
  }
}

function makeOutput() {
  const bgm = new FakeAudioChannel();
  const sfx = new FakeAudioChannel();
  const ui = new FakeAudioChannel();
  const output = new MultichannelAudioOutput(bgm, sfx, ui);
  return { output, bgm, sfx, ui };
}

describe('MultichannelAudioOutput — channel routing (S6-M5)', () => {
  test('constructor applies default channel volumes from ADR-0016 § 2', () => {
    const { bgm, sfx, ui } = makeOutput();

    expect(bgm.getVolume()).toBe(DEFAULT_CHANNEL_VOLUMES.BGM);
    expect(sfx.getVolume()).toBe(DEFAULT_CHANNEL_VOLUMES.SFX);
    expect(ui.getVolume()).toBe(DEFAULT_CHANNEL_VOLUMES.UIFeedback);
    expect(DEFAULT_CHANNEL_VOLUMES).toEqual({ BGM: 0.5, SFX: 0.8, UIFeedback: 0.9 });
  });

  test('all AudioKey values route to SFX channel (Sprint 5/6 mapping)', () => {
    const { output, bgm, sfx, ui } = makeOutput();

    output.play('EXPLOSION');
    output.play('GATE_SAFE');
    output.play('ROUND_CLEAR');
    output.play('GAME_OVER');

    expect(sfx.playCalls).toEqual(['EXPLOSION', 'GATE_SAFE', 'ROUND_CLEAR', 'GAME_OVER']);
    expect(bgm.playCalls).toEqual([]);
    expect(ui.playCalls).toEqual([]);
  });

  test('KEY_CHANNEL_ROUTING table exhaustively maps all AudioKey values', () => {
    const allKeys: AudioKey[] = ['EXPLOSION', 'GATE_SAFE', 'ROUND_CLEAR', 'GAME_OVER'];
    for (const k of allKeys) {
      expect(KEY_CHANNEL_ROUTING[k]).toBeDefined();
    }
  });

  test('getChannel returns the correct channel by name', () => {
    const { output, bgm, sfx, ui } = makeOutput();

    expect(output.getChannel('BGM')).toBe(bgm);
    expect(output.getChannel('SFX')).toBe(sfx);
    expect(output.getChannel('UIFeedback')).toBe(ui);
  });

  test('setChannelVolume clamps values to [0, 1]', () => {
    const { output, sfx } = makeOutput();

    output.setChannelVolume('SFX', 0.4);
    expect(sfx.getVolume()).toBe(0.4);

    output.setChannelVolume('SFX', -0.5); // below floor
    expect(sfx.getVolume()).toBe(0);

    output.setChannelVolume('SFX', 2.0); // above ceiling
    expect(sfx.getVolume()).toBe(1);

    output.setChannelVolume('SFX', 0); // boundary
    expect(sfx.getVolume()).toBe(0);

    output.setChannelVolume('SFX', 1); // boundary
    expect(sfx.getVolume()).toBe(1);
  });

  test('getChannelVolume returns the current channel volume', () => {
    const { output } = makeOutput();
    output.setChannelVolume('BGM', 0.25);
    output.setChannelVolume('SFX', 0.75);

    expect(output.getChannelVolume('BGM')).toBe(0.25);
    expect(output.getChannelVolume('SFX')).toBe(0.75);
    expect(output.getChannelVolume('UIFeedback')).toBe(DEFAULT_CHANNEL_VOLUMES.UIFeedback);
  });

  test('playBGM uses BGM channel with looped playback', () => {
    const { output, bgm, sfx } = makeOutput();

    output.playBGM('main-theme');

    expect(bgm.playLoopedCalls).toEqual(['main-theme']);
    expect(bgm.playCalls).toEqual([]);
    expect(sfx.playLoopedCalls).toEqual([]);
  });

  test('stopBGM stops only the BGM channel', () => {
    const { output, bgm, sfx, ui } = makeOutput();

    output.stopBGM();

    expect(bgm.stopCallCount).toBe(1);
    expect(sfx.stopCallCount).toBe(0);
    expect(ui.stopCallCount).toBe(0);
  });

  test('volume changes on one channel do not affect other channels', () => {
    const { output, bgm, sfx, ui } = makeOutput();

    output.setChannelVolume('BGM', 0.1);

    expect(bgm.getVolume()).toBe(0.1);
    expect(sfx.getVolume()).toBe(DEFAULT_CHANNEL_VOLUMES.SFX);
    expect(ui.getVolume()).toBe(DEFAULT_CHANNEL_VOLUMES.UIFeedback);
  });
});

describe('MultichannelAudioOutput + AudioStub — end-to-end via EventBus', () => {
  test('AUDIO_EVENT bus emit → AudioStub → MultichannelAudioOutput → SFX channel', () => {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const { output, sfx, bgm, ui } = makeOutput();
    const stub = new AudioStub(bus, output);

    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    bus.emit('AUDIO_EVENT', { key: 'GAME_OVER' });
    clock.advanceBy(0, bus);

    expect(sfx.playCalls).toEqual(['EXPLOSION', 'GAME_OVER']);
    expect(bgm.playCalls).toEqual([]);
    expect(ui.playCalls).toEqual([]);
    expect(stub.getPlayCount('EXPLOSION')).toBe(1);
    expect(stub.getPlayCount('GAME_OVER')).toBe(1);

    stub.dispose();
  });

  test('AudioStub.dispose() prevents further routing — stops cleanly', () => {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const { output, sfx } = makeOutput();
    const stub = new AudioStub(bus, output);

    stub.dispose();
    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    clock.advanceBy(0, bus);

    expect(sfx.playCalls).toEqual([]);
  });

  test('all 3 channels reachable via getChannel for direct UI/Settings control', () => {
    const { output } = makeOutput();
    const channels: AudioChannelName[] = ['BGM', 'SFX', 'UIFeedback'];

    for (const c of channels) {
      const ch = output.getChannel(c);
      expect(ch).toBeDefined();
      ch.setVolume(0.42);
      expect(output.getChannelVolume(c)).toBe(0.42);
    }
  });
});
