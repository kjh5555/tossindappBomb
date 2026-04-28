/**
 * SettingsState.ts
 * In-memory player settings: channel volumes + reduced-motion flag.
 * Persistence (localStorage / Toss SDK preferences) is deferred to Sprint 7+.
 *
 * Implements: production/sprints/sprint-6.md S6-S1 (Settings 부분)
 * Governed by: ADR-0016 § 2 (channel volume defaults), accessibility-requirements.md (reduced-motion)
 *
 * Design:
 *  - Volume changes are applied imperatively to MultichannelAudioOutput by the
 *    settings UI (drag → setChannelVolume) — SettingsState only mirrors them.
 *  - reducedMotion is broadcast via SETTINGS_CHANGED so motion-using systems
 *    (HUDLayer, GridLayer, ResultOverlay) can subscribe and adjust without
 *    polling settings every frame.
 */

import type { IEventBus } from '../../core/events/IEventBus';
import {
  DEFAULT_CHANNEL_VOLUMES,
  AudioChannelName,
} from '../../presentation/audio/MultichannelAudioOutput';

export interface SettingsSnapshot {
  reducedMotion: boolean;
  volumes: Record<AudioChannelName, number>;
}

export class SettingsState {
  private reducedMotion: boolean = false;
  private volumes: Record<AudioChannelName, number> = { ...DEFAULT_CHANNEL_VOLUMES };

  constructor(private readonly bus: IEventBus) {}

  getSnapshot(): SettingsSnapshot {
    return {
      reducedMotion: this.reducedMotion,
      volumes: { ...this.volumes },
    };
  }

  isReducedMotion(): boolean {
    return this.reducedMotion;
  }

  setReducedMotion(value: boolean): void {
    if (this.reducedMotion === value) return;
    this.reducedMotion = value;
    this.emitChanged();
  }

  getChannelVolume(name: AudioChannelName): number {
    return this.volumes[name];
  }

  /**
   * Set a channel volume in [0, 1]. Clamps out-of-range input.
   * Note: this updates the SettingsState mirror only — the UI also calls
   * `MultichannelAudioOutput.setChannelVolume` to apply the change to the
   * actual audio engine.
   */
  setChannelVolume(name: AudioChannelName, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (this.volumes[name] === clamped) return;
    this.volumes[name] = clamped;
    this.emitChanged();
  }

  private emitChanged(): void {
    this.bus.emit('SETTINGS_CHANGED', {
      reducedMotion: this.reducedMotion,
      volumes: { ...this.volumes },
      timestamp: Date.now(),
    });
  }
}
