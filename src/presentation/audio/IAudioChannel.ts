/**
 * IAudioChannel.ts
 * Single-channel audio playback interface — matches the subset of cc.AudioSource
 * that GRID REAPER's audio system uses.
 *
 * Implements: production/sprints/sprint-6.md S6-M5
 * Governed by: ADR-0016 § 2 (3-channel AudioManager)
 *
 * Production wraps cc.AudioSource; tests inject a FakeAudioChannel.
 */

export interface IAudioChannel {
  /** One-shot playback (cc.AudioSource.playOneShot equivalent). */
  play(clipKey: string): void;

  /** Looped playback — primarily for BGM. */
  playLooped(clipKey: string): void;

  /** Stop the currently-playing clip on this channel (BGM control). */
  stop(): void;

  /**
   * Set channel volume in [0, 1]. Implementations should clamp out-of-range values.
   */
  setVolume(v: number): void;

  /** Current channel volume in [0, 1]. */
  getVolume(): number;
}
