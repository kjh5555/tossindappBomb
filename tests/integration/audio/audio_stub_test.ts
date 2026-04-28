/**
 * AudioStub integration test — Sprint 5 S5-S1
 *
 * Tests:
 *  - Each AudioKey routes to IAudioOutput.play()
 *  - Multiple events in same flush all play
 *  - Silent fallback on output error
 *  - dispose() unsubscribes
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import {
  AudioStub,
  ConsoleAudioOutput,
  IAudioOutput,
  AudioKey,
} from '../../../src/features/audio/AudioStub';

class RecordingAudioOutput implements IAudioOutput {
  readonly calls: AudioKey[] = [];
  play(key: AudioKey): void {
    this.calls.push(key);
  }
}

class ThrowingAudioOutput implements IAudioOutput {
  callCount = 0;
  play(_key: AudioKey): void {
    this.callCount++;
    throw new Error('simulated missing asset');
  }
}

function makeEnv(output?: IAudioOutput) {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const recorder = output ?? new RecordingAudioOutput();
  const stub = new AudioStub(bus, recorder);
  const flush = () => clock.advanceBy(0, bus);
  return { bus, clock, recorder, stub, flush };
}

describe('AudioStub — AUDIO_EVENT routing (S5-S1)', () => {
  test('EXPLOSION event routes to output.play("EXPLOSION")', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, stub, flush } = makeEnv(recorder);

    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    flush();

    expect(recorder.calls).toEqual(['EXPLOSION']);
    expect(stub.getPlayCount('EXPLOSION')).toBe(1);
  });

  test('GAME_OVER event routes to output.play("GAME_OVER")', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, stub, flush } = makeEnv(recorder);

    bus.emit('AUDIO_EVENT', { key: 'GAME_OVER' });
    flush();

    expect(recorder.calls).toEqual(['GAME_OVER']);
    expect(stub.getPlayCount('GAME_OVER')).toBe(1);
  });

  test('ROUND_CLEAR event routes correctly', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, stub, flush } = makeEnv(recorder);

    bus.emit('AUDIO_EVENT', { key: 'ROUND_CLEAR' });
    flush();

    expect(recorder.calls).toEqual(['ROUND_CLEAR']);
    expect(stub.getPlayCount('ROUND_CLEAR')).toBe(1);
  });

  test('GATE_SAFE event routes correctly', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, stub, flush } = makeEnv(recorder);

    bus.emit('AUDIO_EVENT', { key: 'GATE_SAFE' });
    flush();

    expect(recorder.calls).toEqual(['GATE_SAFE']);
    expect(stub.getPlayCount('GATE_SAFE')).toBe(1);
  });

  test('multiple events in same flush all play in FIFO order', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, flush } = makeEnv(recorder);

    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    bus.emit('AUDIO_EVENT', { key: 'GAME_OVER' });
    bus.emit('AUDIO_EVENT', { key: 'GATE_SAFE' });
    flush();

    expect(recorder.calls).toEqual(['EXPLOSION', 'GAME_OVER', 'GATE_SAFE']);
  });

  test('silent fallback — output.play() throwing does not crash', () => {
    const thrower = new ThrowingAudioOutput();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bus, stub, flush } = makeEnv(thrower);

    expect(() => {
      bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
      flush();
    }).not.toThrow();

    expect(thrower.callCount).toBe(1);
    // The play count is NOT incremented when output throws (the error is caught BEFORE the increment line)
    expect(stub.getPlayCount('EXPLOSION')).toBe(0);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('subsequent events still process after one output throws', () => {
    const thrower = new ThrowingAudioOutput();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bus, flush } = makeEnv(thrower);

    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    bus.emit('AUDIO_EVENT', { key: 'GAME_OVER' });
    flush();

    expect(thrower.callCount).toBe(2);
    warnSpy.mockRestore();
  });

  test('dispose() unsubscribes — subsequent events do not play', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, stub, flush } = makeEnv(recorder);

    stub.dispose();
    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    flush();

    expect(recorder.calls).toEqual([]);
    expect(stub.getPlayCount('EXPLOSION')).toBe(0);
  });

  test('dispose() is idempotent', () => {
    const { stub } = makeEnv();
    stub.dispose();
    expect(() => stub.dispose()).not.toThrow();
  });

  test('default ConsoleAudioOutput logs to console.log', () => {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const stub = new AudioStub(bus); // default output
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    clock.advanceBy(0, bus);

    expect(logSpy).toHaveBeenCalledWith('[AudioStub] play: EXPLOSION');
    expect(stub.getPlayCount('EXPLOSION')).toBe(1);

    logSpy.mockRestore();
    stub.dispose();
  });

  test('cellId field on AUDIO_EVENT is ignored by the stub (key-only routing)', () => {
    const recorder = new RecordingAudioOutput();
    const { bus, stub, flush } = makeEnv(recorder);

    bus.emit('AUDIO_EVENT', { key: 'EXPLOSION', cellId: { row: 3, col: 4 } });
    flush();

    expect(recorder.calls).toEqual(['EXPLOSION']);
    expect(stub.getPlayCount('EXPLOSION')).toBe(1);
  });

  test('ConsoleAudioOutput.play does not throw for any valid key', () => {
    const output = new ConsoleAudioOutput();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    expect(() => output.play('EXPLOSION')).not.toThrow();
    expect(() => output.play('GATE_SAFE')).not.toThrow();
    expect(() => output.play('ROUND_CLEAR')).not.toThrow();
    expect(() => output.play('GAME_OVER')).not.toThrow();

    logSpy.mockRestore();
  });
});
