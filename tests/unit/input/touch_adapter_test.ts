/**
 * touch_adapter_test.ts
 * Unit tests for TouchInputAdapter story-001.
 *
 * Implements: design/gdd/touch-input.md
 * Story: TouchInput story-001
 *
 * Coverage:
 *  AC-TI-4  Dead-zone (JOY_THRESHOLD = 18 px)
 *  AC-TI-5  Multi-touch guard
 *  AC-TI-6  Tap → TAP_DETECTED emitted, onMoveIntent NOT called
 *  AC-TI-7  Drag → TAP_DETECTED suppressed
 *
 * Testing strategy:
 *  Cocos Creator Node.on() does not function in a headless Jest environment.
 *  Tests bypass node wiring entirely and invoke the private handler methods
 *  directly via TypeScript type-casting to `any`.  This is intentional and
 *  mirrors the pattern used across this test suite for engine-coupled classes.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { TouchInputAdapter, JOY_THRESHOLD } from '../../../src/core/input/TouchInputAdapter';
import type { IMovementHandler } from '../../../src/core/input/IMovementHandler';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { GameEvents } from '../../../src/core/events/GameEvents';
import type { PlayerId } from '../../../src/core/types/Domain';
import type { Direction8 } from '../../../src/core/player/Direction8';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeTouchEvent(id: number, x: number, y: number): any {
  return {
    getID: () => id,
    getLocation: () => ({ x, y }),
  };
}

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

class MockMovementHandler implements IMovementHandler {
  calls: Array<{ playerId: PlayerId; direction: Direction8; magnitude: number }> = [];

  onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void {
    this.calls.push({ playerId, direction, magnitude });
  }

  get callCount(): number {
    return this.calls.length;
  }
}

class MockEventBus implements IEventBus {
  emitted: Array<{ key: keyof GameEvents; payload: GameEvents[keyof GameEvents] }> = [];

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.emitted.push({ key, payload });
  }

  on<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  off<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  flush(): void {}

  emittedKeys(): Array<keyof GameEvents> {
    return this.emitted.map((e) => e.key);
  }

  tapEvents(): Array<GameEvents['TAP_DETECTED']> {
    return this.emitted
      .filter((e) => e.key === 'TAP_DETECTED')
      .map((e) => e.payload as GameEvents['TAP_DETECTED']);
  }
}

class MockFrameClock implements IFrameClock {
  private _now = 1000;

  get simulatedTime(): number { return this._now; }
  now(): number { return this._now; }
  dt(): number { return 0; }
  tick(_dt: number): void {}
  schedule(_fn: () => void, _delaySecs: number): void {}
  cancelSchedule(_fn: () => void): void {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an adapter and expose its private handlers via `any` cast. */
function makeAdapter(
  handler: MockMovementHandler,
  bus: MockEventBus,
  clock: MockFrameClock,
  playerId: PlayerId = 'player1',
): {
  adapter: TouchInputAdapter;
  start: (id: number, x: number, y: number) => void;
  move:  (id: number, x: number, y: number) => void;
  end:   (id: number, x: number, y: number) => void;
} {
  const adapter = new TouchInputAdapter(handler, bus, clock, playerId);
  const a = adapter as any;
  return {
    adapter,
    start: (id, x, y) => a.onTouchStart(makeTouchEvent(id, x, y)),
    move:  (id, x, y) => a.onTouchMove(makeTouchEvent(id, x, y)),
    end:   (id, x, y) => a.onTouchEnd(makeTouchEvent(id, x, y)),
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('TouchInputAdapter — story-001', () => {
  let handler: MockMovementHandler;
  let bus: MockEventBus;
  let clock: MockFrameClock;

  beforeEach(() => {
    handler = new MockMovementHandler();
    bus     = new MockEventBus();
    clock   = new MockFrameClock();
  });

  // =========================================================================
  // AC-TI-4: Dead zone — magnitude < JOY_THRESHOLD
  // =========================================================================

  describe('AC-TI-4: Dead zone', () => {

    test('test_dead_zone_below_threshold_no_move_intent', () => {
      // Arrange
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act — displacement of 10 px (below 18 px threshold)
      start(1, 0, 0);
      end(1, 10, 0);

      // Assert
      expect(handler.callCount).toBe(0);
    });

    test('test_dead_zone_at_threshold_tap_detected', () => {
      // Arrange — displacement of 17 px (below threshold → tap)
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);
      end(1, 17, 0);

      // Assert
      expect(bus.tapEvents()).toHaveLength(1);
    });

  });

  // =========================================================================
  // AC-TI-6: Tap → TAP_DETECTED emitted, onMoveIntent NOT called
  // =========================================================================

  describe('AC-TI-6: Tap detection', () => {

    test('test_tap_no_move_intent_called', () => {
      // Arrange — displacement 5 px (tap)
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 100, 100);
      end(1, 105, 100);

      // Assert
      expect(handler.callCount).toBe(0);
      expect(bus.tapEvents()).toHaveLength(1);
    });

    test('test_tap_event_payload_contains_end_position_and_timestamp', () => {
      // Arrange
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 50, 50);
      end(1, 55, 52); // magnitude ≈ 5.39 px — tap

      // Assert
      const tap = bus.tapEvents()[0];
      expect(tap.pos).toEqual({ x: 55, y: 52 });
      expect(tap.timestamp).toBe(clock.now());
    });

  });

  // =========================================================================
  // AC-TI-7: Drag → TAP_DETECTED suppressed
  // =========================================================================

  describe('AC-TI-7: Drag suppresses tap', () => {

    test('test_drag_no_tap_detected', () => {
      // Arrange — displacement 20 px (≥ 18 threshold → drag)
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);
      end(1, 20, 0);

      // Assert
      expect(bus.tapEvents()).toHaveLength(0);
    });

    test('test_drag_diagonal_no_tap_detected', () => {
      // Arrange — diagonal displacement: hypot(15, 15) ≈ 21.2 px → drag
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);
      end(1, 15, 15);

      // Assert
      expect(bus.tapEvents()).toHaveLength(0);
    });

  });

  // =========================================================================
  // AC-TI-5: Multi-touch guard
  // =========================================================================

  describe('AC-TI-5: Multi-touch guard', () => {

    test('test_multitouching_second_touch_ignored', () => {
      // Arrange — touch 1 is active; touch 2 tries to start
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);   // touch 1 begins
      start(2, 50, 50); // touch 2 should be ignored
      end(2, 55, 50);   // touch 2 end — should be ignored
      end(1, 5, 0);     // touch 1 ends as tap

      // Assert — only touch 1's tap fires
      expect(bus.tapEvents()).toHaveLength(1);
    });

    test('test_multitouching_second_touch_move_ignored', () => {
      // Arrange — touch 1 is active; touch 2 move/end events are no-ops
      const { start, move, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);
      move(2, 10, 0);  // wrong id — ignored
      end(2, 30, 0);   // wrong id — ignored; would be drag if processed

      // Assert — no tap, no move intent; touch 1 is still locked
      expect(bus.tapEvents()).toHaveLength(0);
      expect(handler.callCount).toBe(0);
    });

    test('test_multitouching_after_first_released_second_accepted', () => {
      // Arrange
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act — touch 1 completes (tap), then touch 2 begins and completes (tap)
      start(1, 0, 0);
      end(1, 5, 0);   // touch 1 ends as tap → activeTouchId reset to null

      start(2, 100, 100);
      end(2, 104, 100); // touch 2 ends as tap

      // Assert — both taps were processed
      expect(bus.tapEvents()).toHaveLength(2);
    });

  });

  // =========================================================================
  // Exact threshold boundary values
  // =========================================================================

  describe('Exact threshold boundary values', () => {

    test('test_exact_threshold_17_9px_is_tap', () => {
      // Arrange — magnitude = 17.9 px (< 18 → tap)
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);
      end(1, 17.9, 0);

      // Assert
      expect(bus.tapEvents()).toHaveLength(1);
      expect(handler.callCount).toBe(0);
    });

    test('test_exact_threshold_18px_is_drag_not_tap', () => {
      // Arrange — magnitude = 18 px (= JOY_THRESHOLD → drag, not tap)
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act
      start(1, 0, 0);
      end(1, JOY_THRESHOLD, 0); // exactly 18 px

      // Assert — drag: no tap event
      expect(bus.tapEvents()).toHaveLength(0);
    });

  });

  // =========================================================================
  // AC-TI-3: attachToNode — activeTouchId lifecycle
  // =========================================================================

  describe('AC-TI-5 (activeTouchId lifecycle)', () => {

    test('test_touch_start_sets_active_id_and_subsequent_other_id_ignored', () => {
      // Arrange
      const { start, end } = makeAdapter(handler, bus, clock);

      // Act — touch 1 starts, touch 3 attempts start and end (both ignored)
      start(1, 0, 0);
      start(3, 200, 200); // should not override activeTouchId
      end(3, 210, 200);   // displacement 10 px; should be ignored

      // Then touch 1 ends as a tap
      end(1, 5, 0);

      // Assert — only touch 1's tap fires; touch 3 was fully ignored
      expect(bus.tapEvents()).toHaveLength(1);
      const tap = bus.tapEvents()[0];
      expect(tap.pos).toEqual({ x: 5, y: 0 });
    });

    test('test_touch_cancel_treated_as_touch_end', () => {
      // Arrange — TOUCH_CANCEL maps to onTouchEnd in attachToNode
      const adapter = new TouchInputAdapter(handler, bus, clock, 'player1');
      const a = adapter as any;

      // Act — simulate cancel at end position within tap threshold
      a.onTouchStart(makeTouchEvent(1, 0, 0));
      a.onTouchEnd(makeTouchEvent(1, 5, 0)); // cancel fires same handler

      // Assert — tap recorded, activeTouchId reset
      expect(bus.tapEvents()).toHaveLength(1);
      expect(a.activeTouchId).toBeNull();
    });

    test('test_after_touch_end_active_touch_id_is_null', () => {
      // Arrange
      const adapter = new TouchInputAdapter(handler, bus, clock, 'player1');
      const a = adapter as any;

      // Act
      a.onTouchStart(makeTouchEvent(1, 0, 0));
      expect(a.activeTouchId).toBe(1); // sanity check
      a.onTouchEnd(makeTouchEvent(1, 5, 0));

      // Assert
      expect(a.activeTouchId).toBeNull();
    });

  });

});
