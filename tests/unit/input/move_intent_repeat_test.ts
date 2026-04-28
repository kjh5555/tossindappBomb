/**
 * move_intent_repeat_test.ts
 * Unit tests for TouchInputAdapter story-002: Direction8 mapping + MOVE_REPEAT timer.
 * Also covers AC-TI-13: PlayerMovement.onMoveIntent delegation.
 *
 * Story: TouchInput story-002
 *
 * Coverage:
 *  AC-TI-8  angleToDirection8 — 8-direction boundary mapping
 *  AC-TI-9  First TOUCH_MOVE fires immediately (lastMoveAt reset to -Infinity on TOUCH_START)
 *  AC-TI-10 MOVE_REPEAT 0.22s: no call before elapsed, call at/after elapsed
 *  AC-TI-11 Direction change fires immediately and resets timer
 *  AC-TI-12 TOUCH_END resets lastDirection so new gesture fires on first move
 *  AC-TI-13 PlayerMovement.onMoveIntent delegates to tryMove
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { TouchInputAdapter, JOY_THRESHOLD } from '../../../src/core/input/TouchInputAdapter';
import { angleToDirection8, MOVE_REPEAT } from '../../../src/core/player/Direction8';
import { PlayerMovement } from '../../../src/core/player/PlayerMovement';
import type { IMovementHandler } from '../../../src/core/input/IMovementHandler';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { GameEvents } from '../../../src/core/events/GameEvents';
import type { PlayerId } from '../../../src/core/types/Domain';
import type { Direction8 } from '../../../src/core/player/Direction8';

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

function makeTouchEvent(id: number, x: number, y: number): any {
  return { getID: () => id, getLocation: () => ({ x, y }) };
}

class MockMovementHandler implements IMovementHandler {
  calls: Array<{ playerId: PlayerId; direction: Direction8; magnitude: number }> = [];

  onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void {
    this.calls.push({ playerId, direction, magnitude });
  }

  get callCount(): number { return this.calls.length; }
  lastCall(): { playerId: PlayerId; direction: Direction8; magnitude: number } | undefined {
    return this.calls[this.calls.length - 1];
  }
}

class MockEventBus implements IEventBus {
  emitted: Array<{ key: keyof GameEvents; payload: unknown }> = [];
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.emitted.push({ key, payload });
  }
  on<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  off<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  flush(): void {}
}

/** Controllable clock: set absolute time or advance by delta. */
class MockFrameClock implements IFrameClock {
  private _now = 0;
  get simulatedTime(): number { return this._now; }
  setTime(t: number): void { this._now = t; }
  advance(dt: number): void { this._now += dt; }
  now(): number { return this._now; }
  dt(): number { return 0; }
  tick(_dt: number): void {}
  schedule(_fn: () => void, _delaySecs: number): void {}
  cancelSchedule(_fn: () => void): void {}
}

function makeAdapter(
  handler: MockMovementHandler,
  bus: MockEventBus,
  clock: MockFrameClock,
  playerId: PlayerId = 'player1',
) {
  const adapter = new TouchInputAdapter(handler, bus, clock, playerId);
  const a = adapter as any;
  return {
    adapter,
    a,
    start: (id: number, x: number, y: number) => a.onTouchStart(makeTouchEvent(id, x, y)),
    move:  (id: number, x: number, y: number) => a.onTouchMove(makeTouchEvent(id, x, y)),
    end:   (id: number, x: number, y: number) => a.onTouchEnd(makeTouchEvent(id, x, y)),
  };
}

// ---------------------------------------------------------------------------
// AC-TI-8: angleToDirection8
// ---------------------------------------------------------------------------

describe('AC-TI-8: angleToDirection8 direction mapping', () => {

  test('test_angle_0deg_maps_right', () => {
    expect(angleToDirection8(0)).toBe(0);
  });

  test('test_angle_45deg_maps_down_right', () => {
    expect(angleToDirection8(45)).toBe(1);
  });

  test('test_angle_90deg_maps_down', () => {
    expect(angleToDirection8(90)).toBe(2);
  });

  test('test_angle_135deg_maps_down_left', () => {
    expect(angleToDirection8(135)).toBe(3);
  });

  test('test_angle_180deg_maps_left', () => {
    expect(angleToDirection8(180)).toBe(4);
  });

  test('test_angle_225deg_maps_up_left', () => {
    expect(angleToDirection8(225)).toBe(5);
  });

  test('test_angle_270deg_maps_up', () => {
    expect(angleToDirection8(270)).toBe(6);
  });

  test('test_angle_315deg_maps_up_right', () => {
    expect(angleToDirection8(315)).toBe(7);
  });

  test('test_angle_360deg_wraps_to_right', () => {
    expect(angleToDirection8(360)).toBe(0);
  });

  test('test_angle_negative_45deg_maps_up_right', () => {
    // -45° normalises to 315° → 7
    expect(angleToDirection8(-45)).toBe(7);
  });

  test('test_angle_negative_90deg_maps_up', () => {
    // -90° normalises to 270° → 6
    expect(angleToDirection8(-90)).toBe(6);
  });

  test('test_angle_361deg_normalises_to_right', () => {
    expect(angleToDirection8(361)).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// AC-TI-9, AC-TI-10, AC-TI-11, AC-TI-12: TouchInputAdapter MOVE_REPEAT
// ---------------------------------------------------------------------------

describe('TouchInputAdapter — story-002', () => {
  let handler: MockMovementHandler;
  let bus: MockEventBus;
  let clock: MockFrameClock;

  beforeEach(() => {
    handler = new MockMovementHandler();
    bus     = new MockEventBus();
    clock   = new MockFrameClock();
  });

  // =========================================================================
  // AC-TI-9: First TOUCH_MOVE after TOUCH_START fires immediately
  // =========================================================================

  describe('AC-TI-9: First move fires immediately', () => {

    test('test_first_touch_move_above_threshold_calls_on_move_intent', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move } = makeAdapter(handler, bus, clock);

      // Act — TOUCH_START, then drag 30px right
      start(1, 0, 0);
      move(1, 30, 0); // dx=30, dy=0 → angle=0° → dir=0 (right)

      // Assert
      expect(handler.callCount).toBe(1);
      expect(handler.lastCall()!.direction).toBe(0); // right
      expect(handler.lastCall()!.magnitude).toBeCloseTo(30);
    });

    test('test_first_touch_move_below_threshold_does_not_fire', () => {
      // Arrange
      const { start, move } = makeAdapter(handler, bus, clock);

      // Act — displacement 10px < JOY_THRESHOLD(18)
      start(1, 0, 0);
      move(1, 10, 0);

      // Assert
      expect(handler.callCount).toBe(0);
    });

    test('test_new_gesture_fires_immediately_even_within_repeat_interval', () => {
      // Arrange — first gesture fires, then end and start a second gesture quickly
      clock.setTime(5.0);
      const { start, move, end } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // fires (lastMoveAt=5.0)
      end(1, 30, 0);  // drag end

      // Second gesture only 0.05s later (< MOVE_REPEAT) — should still fire (fresh start)
      clock.setTime(5.05);
      start(2, 0, 0);
      move(2, 30, 0); // lastMoveAt was reset to -Infinity on TOUCH_START

      // Assert — fired twice total
      expect(handler.callCount).toBe(2);
    });

  });

  // =========================================================================
  // AC-TI-10: MOVE_REPEAT 0.22s timer
  // =========================================================================

  describe('AC-TI-10: MOVE_REPEAT timer', () => {

    test('test_move_before_repeat_interval_does_not_re_fire', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // first call at t=5.0

      // Act — same direction at t=5.1 (elapsed 0.1s < 0.22s)
      clock.setTime(5.1);
      move(1, 30, 0);

      // Assert — still only 1 call
      expect(handler.callCount).toBe(1);
    });

    test('test_move_at_or_after_repeat_interval_fires', () => {
      // Arrange — use integer-friendly times to avoid floating-point cancellation
      // (5.0 + 0.22 - 5.0 may not equal 0.22 exactly in IEEE 754)
      clock.setTime(0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // t=0 → fires (lastMoveAt=0)

      // Act — advance past MOVE_REPEAT with a clear margin
      clock.setTime(MOVE_REPEAT + 0.001); // 0.221s > 0.22s
      move(1, 30, 0);

      // Assert
      expect(handler.callCount).toBe(2);
    });

    test('test_move_just_before_repeat_interval_does_not_fire', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // t=5.0

      // Act — 1ms before threshold
      clock.setTime(5.0 + MOVE_REPEAT - 0.001);
      move(1, 30, 0);

      // Assert
      expect(handler.callCount).toBe(1);
    });

    test('test_multiple_repeats_fire_at_each_interval', () => {
      // Arrange
      clock.setTime(0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0);           // t=0.00 → fires (1)
      clock.setTime(MOVE_REPEAT);
      move(1, 30, 0);           // t=0.22 → fires (2)
      clock.setTime(MOVE_REPEAT * 2);
      move(1, 30, 0);           // t=0.44 → fires (3)

      // Assert
      expect(handler.callCount).toBe(3);
    });

  });

  // =========================================================================
  // AC-TI-11: Direction change fires immediately and resets timer
  // =========================================================================

  describe('AC-TI-11: Direction change resets MOVE_REPEAT', () => {

    test('test_direction_change_fires_before_repeat_interval', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0);   // dir=0 (right), t=5.0 → fires

      // Act — new direction at t=5.1 (0.1s < MOVE_REPEAT)
      // dx=0-0=0, dy=-30-0=-30 → angleDeg=atan2(30,0)=90° → dir=2 (down)
      clock.setTime(5.1);
      move(1, 0, -30);

      // Assert — second call fires immediately despite < 0.22s elapsed
      expect(handler.callCount).toBe(2);
      expect(handler.calls[0].direction).toBe(0); // right
      expect(handler.calls[1].direction).toBe(2); // down
    });

    test('test_direction_change_resets_timer_for_subsequent_same_direction', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0);   // dir=0, t=5.0 → fires (lastMoveAt=5.0)

      clock.setTime(5.1);
      move(1, 0, -30);  // dir=2, direction changed → fires (lastMoveAt=5.1)

      // Stay on dir=2, 0.1s later (< 0.22 from lastMoveAt=5.1)
      clock.setTime(5.2);
      move(1, 0, -30);  // same dir=2, elapsed=0.1s → should NOT fire

      // Assert — only 2 calls total
      expect(handler.callCount).toBe(2);
    });

    test('test_same_direction_held_uses_repeat_interval_not_direction_change', () => {
      // Arrange
      clock.setTime(0);
      const { start, move } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // t=0.00 → fires (dir=0)

      clock.setTime(0.1);
      move(1, 30, 0); // same dir, 0.1s < 0.22 → no fire

      clock.setTime(0.22);
      move(1, 30, 0); // same dir, exactly 0.22s → fires

      // Assert
      expect(handler.callCount).toBe(2);
    });

  });

  // =========================================================================
  // AC-TI-12: TOUCH_END stops MOVE_REPEAT
  // =========================================================================

  describe('AC-TI-12: TOUCH_END stops MOVE_REPEAT', () => {

    test('test_touch_end_prevents_stale_move_id_from_firing', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move, end } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // fires

      // Act — end touch; try same-id move (activeTouchId is now null → ignored)
      end(1, 30, 0);
      clock.setTime(10.0);
      move(1, 30, 0); // stale id — ignored

      // Assert
      expect(handler.callCount).toBe(1);
    });

    test('test_after_touch_end_new_gesture_fires_immediately_same_direction', () => {
      // Arrange
      clock.setTime(5.0);
      const { start, move, end } = makeAdapter(handler, bus, clock);

      start(1, 0, 0);
      move(1, 30, 0); // dir=0, fires
      end(1, 30, 0);  // drag end → lastDirection reset to null

      // New gesture — same direction, very soon after
      clock.setTime(5.05);
      start(2, 0, 0);
      move(2, 30, 0); // dir=0, but lastDirection=null → direction changed → fires

      // Assert — fired twice
      expect(handler.callCount).toBe(2);
    });

  });

});

// ---------------------------------------------------------------------------
// AC-TI-13: PlayerMovement.onMoveIntent delegates to tryMove
// ---------------------------------------------------------------------------

describe('PlayerMovement — AC-TI-13: onMoveIntent', () => {
  let pm: PlayerMovement;
  let clock: MockFrameClock;
  let bus: MockEventBus;

  beforeEach(() => {
    clock = new MockFrameClock();
    bus   = new MockEventBus();
    pm    = new PlayerMovement(clock, bus);
  });

  test('test_on_move_intent_moves_player_in_given_direction', () => {
    // Arrange — player at (3, 3)
    pm.setPosition('p1', { row: 3, col: 3 });

    // Act — direction=0 (right), magnitude=25
    pm.onMoveIntent('p1', 0, 25);

    // Assert — moved right: col+1
    expect(pm.getPosition('p1')).toEqual({ row: 3, col: 4 });
  });

  test('test_on_move_intent_up_direction_decrements_row', () => {
    // Arrange
    pm.setPosition('p1', { row: 4, col: 4 });

    // Act — direction=6 (up), magnitude=25
    pm.onMoveIntent('p1', 6, 25);

    // Assert — row-1
    expect(pm.getPosition('p1')).toEqual({ row: 3, col: 4 });
  });

  test('test_on_move_intent_with_min_magnitude_still_moves', () => {
    // Arrange — magnitude exactly at JOY_THRESHOLD (guaranteed by adapter)
    pm.setPosition('p1', { row: 4, col: 4 });

    // Act
    pm.onMoveIntent('p1', 0, JOY_THRESHOLD);

    // Assert
    expect(pm.getPosition('p1')).toEqual({ row: 4, col: 5 });
  });

  test('test_on_move_intent_rejects_out_of_bounds_move', () => {
    // Arrange — player at top edge
    pm.setPosition('p1', { row: 0, col: 4 });

    // Act — direction=6 (up) would go row=-1 (out of bounds)
    pm.onMoveIntent('p1', 6, 25);

    // Assert — position unchanged
    expect(pm.getPosition('p1')).toEqual({ row: 0, col: 4 });
  });

  test('test_player_movement_implements_imovement_handler', () => {
    // Verify interface contract: PlayerMovement can be assigned to IMovementHandler
    const handler: IMovementHandler = pm;
    expect(typeof handler.onMoveIntent).toBe('function');
  });

});
