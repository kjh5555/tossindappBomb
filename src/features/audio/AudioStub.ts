/**
 * AudioStub.ts
 * Sprint 5 stub for audio routing. Subscribes to AUDIO_EVENT and forwards each
 * event to an `IAudioOutput` implementation (console log by default).
 *
 * Implements: production/sprints/sprint-5.md S5-S1
 * Governed by: ADR-0016 § 3 (AUDIO_EVENT EventBus routing) — stub-level
 *
 * Design:
 *  - Sprint 5 stub: no real cc.AudioSource integration. Emits a console line
 *    on every event so playtest sessions can confirm the wiring.
 *  - Sprint 6+ will replace `ConsoleAudioOutput` with `CocosAudioOutput` that
 *    routes to BGM/SFX/UIFeedback channels per ADR-0016 § 2.
 *  - Silent fallback on output errors — missing asset must NOT crash gameplay.
 *  - Subscriptions registered once at construction; dispose() unsubscribes.
 */

import type { IEventBus } from '../../core/events/IEventBus';
import type { GameEvents } from '../../core/events/GameEvents';

/** Subset of AUDIO_EVENT.key — matches GameEvents['AUDIO_EVENT']['key']. */
export type AudioKey = GameEvents['AUDIO_EVENT']['key'];

/**
 * Audio output abstraction. Sprint 5 stub uses ConsoleAudioOutput;
 * Sprint 6 will provide CocosAudioOutput backed by `cc.AudioSource`.
 */
export interface IAudioOutput {
  play(key: AudioKey): void;
}

/**
 * Default Sprint 5 output — logs to console. Replaced by CocosAudioOutput in Sprint 6.
 */
export class ConsoleAudioOutput implements IAudioOutput {
  play(key: AudioKey): void {
    // Single console line per event — used by playtest sessions to confirm wiring.
    // eslint-disable-next-line no-console
    console.log(`[AudioStub] play: ${key}`);
  }
}

/**
 * AudioStub subscribes to AUDIO_EVENT and forwards each play call to its IAudioOutput.
 *
 * @example
 *   const stub = new AudioStub(bus);
 *   bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
 *   // → [AudioStub] play: EXPLOSION
 *   stub.getPlayCount('EXPLOSION'); // 1
 */
export class AudioStub {
  private readonly playCounts: Map<AudioKey, number> = new Map();
  private subscriptions: Array<() => void> = [];

  /**
   * @param bus    - event bus with AUDIO_EVENT support
   * @param output - audio output implementation. Defaults to ConsoleAudioOutput.
   */
  constructor(
    bus: IEventBus,
    private readonly output: IAudioOutput = new ConsoleAudioOutput(),
  ) {
    const onAudioEvent = (e: GameEvents['AUDIO_EVENT']): void => this.handle(e.key);
    bus.on('AUDIO_EVENT', onAudioEvent);
    this.subscriptions = [() => bus.off('AUDIO_EVENT', onAudioEvent)];
  }

  /**
   * Inspection accessor. Returns how many times the given key has been played.
   * Used by integration tests; not part of the production API surface.
   */
  getPlayCount(key: AudioKey): number {
    return this.playCounts.get(key) ?? 0;
  }

  /**
   * Cleanup the AUDIO_EVENT subscription. Idempotent.
   */
  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }

  private handle(key: AudioKey): void {
    try {
      this.output.play(key);
      this.playCounts.set(key, (this.playCounts.get(key) ?? 0) + 1);
    } catch (err) {
      // Silent fallback — missing asset, browser autoplay policy, etc. must not
      // crash gameplay. Log and continue. Sprint 6 wiring will improve recovery.
      // eslint-disable-next-line no-console
      console.warn(`[AudioStub] output.play(${key}) failed:`, err);
    }
  }
}
