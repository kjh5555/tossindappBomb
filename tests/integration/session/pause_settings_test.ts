/**
 * Pause + Settings integration test — Sprint 6 S6-S1
 *
 * Covers:
 *  - PauseController: state transitions + GAME_PAUSED/GAME_RESUMED events
 *  - SettingsState: volume + reducedMotion + SETTINGS_CHANGED emission
 *  - PauseOverlay: GAME_PAUSED → show, GAME_RESUMED → hide, button bindings
 *  - Restart confirmation flow
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { SessionFlow } from '../../../src/features/session/SessionFlow';
import { PauseController } from '../../../src/features/session/PauseController';
import { SettingsState } from '../../../src/features/session/SettingsState';
import { PauseOverlay } from '../../../src/presentation/hud/PauseOverlay';
import {
  IButton,
  IOverlayNode,
  ILabel,
} from '../../../src/presentation/hud/ResultOverlay';
import { DEFAULT_CHANNEL_VOLUMES } from '../../../src/presentation/audio/MultichannelAudioOutput';

class FakeButton implements IButton {
  private handlers: Array<() => void> = [];
  onClick(h: () => void): void {
    this.handlers.push(h);
  }
  offClick(h: () => void): void {
    const i = this.handlers.indexOf(h);
    if (i !== -1) this.handlers.splice(i, 1);
  }
  click(): void {
    for (const h of [...this.handlers]) h();
  }
}

function makePauseEnv() {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const sessionFlow = new SessionFlow(bus);
  const pauseController = new PauseController(bus, sessionFlow);
  const node: IOverlayNode = { visible: false };
  const label: ILabel = { string: '' };
  const buttons = {
    resume: new FakeButton(),
    settings: new FakeButton(),
    restart: new FakeButton(),
    confirmRestart: new FakeButton(),
    cancelRestart: new FakeButton(),
  };
  const overlay = new PauseOverlay(
    bus,
    sessionFlow,
    pauseController,
    node,
    label,
    buttons,
  );
  const flush = () => clock.advanceBy(0, bus);
  return { bus, sessionFlow, pauseController, overlay, node, label, buttons, flush };
}

// ─────────────────────────────────────────────────────────────────────────────
// PauseController
// ─────────────────────────────────────────────────────────────────────────────

describe('PauseController — state + events', () => {
  test('initial state is not paused', () => {
    const { pauseController } = makePauseEnv();
    expect(pauseController.isPaused()).toBe(false);
  });

  test('pause() returns false when not in MATCH state (no-op in MENU)', () => {
    const { pauseController, bus, flush } = makePauseEnv();
    const events: number[] = [];
    bus.on('GAME_PAUSED', (e) => events.push(e.timestamp));

    const result = pauseController.pause();
    flush();

    expect(result).toBe(false);
    expect(pauseController.isPaused()).toBe(false);
    expect(events).toHaveLength(0);
  });

  test('pause() during MATCH state succeeds and emits GAME_PAUSED', () => {
    const { pauseController, sessionFlow, bus, flush } = makePauseEnv();
    sessionFlow.startMatch();
    const events: number[] = [];
    bus.on('GAME_PAUSED', (e) => events.push(e.timestamp));

    const result = pauseController.pause();
    flush();

    expect(result).toBe(true);
    expect(pauseController.isPaused()).toBe(true);
    expect(events).toHaveLength(1);
  });

  test('duplicate pause() is a no-op', () => {
    const { pauseController, sessionFlow, bus, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush(); // drain the first GAME_PAUSED before subscribing
    const events: number[] = [];
    bus.on('GAME_PAUSED', (e) => events.push(e.timestamp));

    const result = pauseController.pause();
    flush();

    expect(result).toBe(false);
    expect(events).toHaveLength(0);
  });

  test('resume() after pause emits GAME_RESUMED', () => {
    const { pauseController, sessionFlow, bus, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();
    const events: number[] = [];
    bus.on('GAME_RESUMED', (e) => events.push(e.timestamp));

    const result = pauseController.resume();
    flush();

    expect(result).toBe(true);
    expect(pauseController.isPaused()).toBe(false);
    expect(events).toHaveLength(1);
  });

  test('resume() when not paused is a no-op', () => {
    const { pauseController, bus, flush } = makePauseEnv();
    const events: number[] = [];
    bus.on('GAME_RESUMED', (e) => events.push(e.timestamp));

    const result = pauseController.resume();
    flush();

    expect(result).toBe(false);
    expect(events).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SettingsState
// ─────────────────────────────────────────────────────────────────────────────

describe('SettingsState — volume + reducedMotion + SETTINGS_CHANGED', () => {
  function makeSettings() {
    const bus = new EventBus();
    const clock = new MockFrameClock();
    const settings = new SettingsState(bus);
    const flush = () => clock.advanceBy(0, bus);
    return { bus, clock, settings, flush };
  }

  test('initial snapshot uses ADR-0016 default volumes and reducedMotion=false', () => {
    const { settings } = makeSettings();
    const snap = settings.getSnapshot();

    expect(snap.reducedMotion).toBe(false);
    expect(snap.volumes).toEqual(DEFAULT_CHANNEL_VOLUMES);
    expect(settings.isReducedMotion()).toBe(false);
    expect(settings.getChannelVolume('BGM')).toBe(DEFAULT_CHANNEL_VOLUMES.BGM);
  });

  test('setReducedMotion(true) updates state + emits SETTINGS_CHANGED', () => {
    const { settings, bus, flush } = makeSettings();
    const events: Array<{ reducedMotion: boolean }> = [];
    bus.on('SETTINGS_CHANGED', (e) => events.push({ reducedMotion: e.reducedMotion }));

    settings.setReducedMotion(true);
    flush();

    expect(settings.isReducedMotion()).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].reducedMotion).toBe(true);
  });

  test('setReducedMotion to same value is a no-op (no event emitted)', () => {
    const { settings, bus, flush } = makeSettings();
    const events: number[] = [];
    bus.on('SETTINGS_CHANGED', (e) => events.push(e.timestamp));

    settings.setReducedMotion(false); // already false
    flush();

    expect(events).toHaveLength(0);
  });

  test('setChannelVolume clamps to [0, 1] and emits SETTINGS_CHANGED', () => {
    const { settings, bus, flush } = makeSettings();
    const events: Array<{ volumes: { BGM: number } }> = [];
    bus.on('SETTINGS_CHANGED', (e) => events.push({ volumes: e.volumes as { BGM: number } }));

    settings.setChannelVolume('BGM', 0.3);
    settings.setChannelVolume('BGM', -1); // clamped to 0
    settings.setChannelVolume('BGM', 99); // clamped to 1
    flush();

    expect(events).toHaveLength(3);
    expect(settings.getChannelVolume('BGM')).toBe(1);
  });

  test('setChannelVolume to same value is a no-op', () => {
    const { settings, bus, flush } = makeSettings();
    const initial = settings.getChannelVolume('SFX');
    const events: number[] = [];
    bus.on('SETTINGS_CHANGED', (e) => events.push(e.timestamp));

    settings.setChannelVolume('SFX', initial);
    flush();

    expect(events).toHaveLength(0);
  });

  test('snapshot returns a defensive copy — mutations do not affect state', () => {
    const { settings } = makeSettings();
    const snap = settings.getSnapshot();
    snap.volumes.BGM = 0.0;
    snap.reducedMotion = true;

    expect(settings.getChannelVolume('BGM')).toBe(DEFAULT_CHANNEL_VOLUMES.BGM);
    expect(settings.isReducedMotion()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PauseOverlay
// ─────────────────────────────────────────────────────────────────────────────

describe('PauseOverlay — UI binding to PauseController + buttons', () => {
  test('initial state is HIDDEN', () => {
    const { overlay, node, label } = makePauseEnv();
    expect(overlay.getState()).toBe('HIDDEN');
    expect(node.visible).toBe(false);
    expect(label.string).toBe('');
  });

  test('GAME_PAUSED → overlay shows with "PAUSED" message', () => {
    const { pauseController, sessionFlow, overlay, node, label, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();

    expect(overlay.getState()).toBe('SHOWING');
    expect(node.visible).toBe(true);
    expect(label.string).toBe('PAUSED');
  });

  test('GAME_RESUMED → overlay hides', () => {
    const { pauseController, sessionFlow, overlay, node, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();
    expect(node.visible).toBe(true);

    pauseController.resume();
    flush();

    expect(overlay.getState()).toBe('HIDDEN');
    expect(node.visible).toBe(false);
  });

  test('Resume button click → pauseController.resume + overlay hides', () => {
    const { pauseController, sessionFlow, overlay, node, buttons, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();

    buttons.resume.click();
    flush();

    expect(pauseController.isPaused()).toBe(false);
    expect(overlay.getState()).toBe('HIDDEN');
    expect(node.visible).toBe(false);
  });

  test('Settings button click → SETTINGS_REQUESTED emitted (overlay stays visible)', () => {
    const { pauseController, sessionFlow, overlay, node, buttons, bus, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();
    const events: number[] = [];
    bus.on('SETTINGS_REQUESTED', (e) => events.push(e.timestamp));

    buttons.settings.click();
    flush();

    expect(events).toHaveLength(1);
    expect(overlay.getState()).toBe('SHOWING');
    expect(node.visible).toBe(true);
  });

  test('Restart button click → CONFIRMING_RESTART state + label changes', () => {
    const { pauseController, sessionFlow, overlay, label, buttons, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();

    buttons.restart.click();

    expect(overlay.getState()).toBe('CONFIRMING_RESTART');
    expect(label.string).toBe('Restart match?');
  });

  test('Confirm Restart → resume + sessionFlow.reset + overlay hides + event fires', () => {
    const { pauseController, sessionFlow, overlay, node, buttons, bus, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();
    buttons.restart.click();
    expect(overlay.getState()).toBe('CONFIRMING_RESTART');
    const events: number[] = [];
    bus.on('PAUSE_RESTART_CONFIRMED', (e) => events.push(e.timestamp));

    buttons.confirmRestart.click();
    flush();

    expect(sessionFlow.getState()).toBe('MENU');
    expect(pauseController.isPaused()).toBe(false);
    expect(overlay.getState()).toBe('HIDDEN');
    expect(node.visible).toBe(false);
    expect(events).toHaveLength(1);
  });

  test('Cancel Restart → returns to SHOWING with PAUSED label', () => {
    const { pauseController, sessionFlow, overlay, label, buttons, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();
    buttons.restart.click();
    expect(overlay.getState()).toBe('CONFIRMING_RESTART');

    buttons.cancelRestart.click();

    expect(overlay.getState()).toBe('SHOWING');
    expect(label.string).toBe('PAUSED');
  });

  test('Resume button while in CONFIRMING_RESTART is a no-op', () => {
    const { pauseController, sessionFlow, overlay, buttons, flush } = makePauseEnv();
    sessionFlow.startMatch();
    pauseController.pause();
    flush();
    buttons.restart.click();
    expect(overlay.getState()).toBe('CONFIRMING_RESTART');

    buttons.resume.click(); // intercepted in handleResume

    // State unchanged, still showing the confirm dialog
    expect(overlay.getState()).toBe('CONFIRMING_RESTART');
    expect(pauseController.isPaused()).toBe(true);
  });

  test('dispose() unsubscribes events and removes button handlers', () => {
    const { pauseController, sessionFlow, overlay, node, buttons, flush } = makePauseEnv();
    sessionFlow.startMatch();

    overlay.dispose();
    pauseController.pause();
    flush();
    buttons.resume.click();

    expect(node.visible).toBe(false);
    expect(overlay.getState()).toBe('HIDDEN');
    // pauseController.pause() still succeeded (PauseController is independent)
    expect(pauseController.isPaused()).toBe(true);
  });
});
