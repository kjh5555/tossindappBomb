/**
 * input_buffer_event_test.ts
 * Unit tests for PlayerMovement story-002: input buffering + event split.
 *
 * Story: PlayerMovement story-002
 *
 * Coverage:
 *  AC-PM-4   Logical coord updates at t=0 before tween completes
 *  AC-PM-5   Valid input during tween stored in single-slot buffer
 *  AC-PM-6   Second input during same tween overwrites first (buffer size=1)
 *  AC-PM-7   Buffer auto-executes on tween completion
 *  AC-PM-14  Buffered direction revalidated against new position on tween end
 *  AC-PM-18  PLAYER_MOVED emitted at t=0 with correct payload
 *  AC-PM-18b PLAYER_ARRIVED emitted at t+0.1s via schedule; NOT at t=0
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { PlayerMovement, MOVE_TWEEN_DURATION } from '../../../src/core/player/PlayerMovement';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { GameEvents } from '../../../src/core/events/GameEvents';
import type { CellCoord } from '../../../src/core/patterns/PatternTypes';
import type { PlayerId } from '../../../src/core/types/Domain';

// ---------------------------------------------------------------------------
// ControllableFrameClock — fires scheduled callbacks when time passes their target
// ---------------------------------------------------------------------------

class ControllableFrameClock implements IFrameClock {
  private _now = 0;
  private scheduled: Array<{ at: number; fn: () => void }> = [];

  get simulatedTime(): number { return this._now; }
  now(): number { return this._now; }
  dt(): number { return 0; }
  tick(_dt: number): void {}

  setTime(t: number): void {
    const prev = this._now;
    this._now = t;
    // Fire all callbacks scheduled in (prev, t] in ascending order
    const toFire = this.scheduled
      .filter(s => s.at > prev && s.at <= t)
      .sort((a, b) => a.at - b.at);
    this.scheduled = this.scheduled.filter(s => !(s.at > prev && s.at <= t));
    toFire.forEach(s => s.fn());
  }

  advance(dt: number): void { this.setTime(this._now + dt); }

  schedule(fn: () => void, delaySecs: number): void {
    this.scheduled.push({ at: this._now + delaySecs, fn });
  }

  cancelSchedule(fn: () => void): void {
    this.scheduled = this.scheduled.filter(s => s.fn !== fn);
  }
}

// ---------------------------------------------------------------------------
// MockEventBus
// ---------------------------------------------------------------------------

class MockEventBus implements IEventBus {
  emitted: Array<{ key: keyof GameEvents; payload: GameEvents[keyof GameEvents] }> = [];

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.emitted.push({ key, payload: payload as GameEvents[keyof GameEvents] });
  }

  on<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  off<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void): void {}
  flush(): void {}

  eventsOf<K extends keyof GameEvents>(key: K): GameEvents[K][] {
    return this.emitted
      .filter(e => e.key === key)
      .map(e => e.payload as GameEvents[K]);
  }

  countOf(key: keyof GameEvents): number {
    return this.emitted.filter(e => e.key === key).length;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER = 'p1' as PlayerId;

function setup(startRow = 3, startCol = 3) {
  const clock = new ControllableFrameClock();
  const bus   = new MockEventBus();
  const pm    = new PlayerMovement(clock, bus);
  pm.setPosition(PLAYER, { row: startRow, col: startCol });
  return { clock, bus, pm };
}

// ---------------------------------------------------------------------------
// AC-PM-4: Logical coord at t=0
// ---------------------------------------------------------------------------

describe('AC-PM-4: Logical coord updates at t=0', () => {

  test('test_logical_coord_updated_before_tween_completes', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);
    clock.setTime(5.0);

    // Act — move right (dir=0)
    pm.executeMove(PLAYER, 0);

    // Assert — logical coord is already at destination at t=0
    expect(pm.getPosition(PLAYER)).toEqual({ row: 3, col: 4 });

    // Tween has NOT completed yet (clock not advanced)
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);
  });

  test('test_player_moved_emitted_with_correct_from_and_to', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);
    clock.setTime(10.0);

    // Act
    pm.executeMove(PLAYER, 0); // right: {3,3} → {3,4}

    // Assert
    const events = bus.eventsOf('PLAYER_MOVED');
    expect(events).toHaveLength(1);
    expect(events[0].from).toEqual({ row: 3, col: 3 });
    expect(events[0].to).toEqual({ row: 3, col: 4 });
    expect(events[0].playerId).toBe(PLAYER);
    expect(events[0].timestamp).toBe(10.0);
  });

  test('test_out_of_bounds_move_does_not_update_coord_or_emit', () => {
    // Arrange — player at top edge
    const { pm, bus } = setup(0, 4);

    // Act — direction=6 (up), would go row=-1
    pm.executeMove(PLAYER, 6);

    // Assert
    expect(pm.getPosition(PLAYER)).toEqual({ row: 0, col: 4 }); // unchanged
    expect(bus.countOf('PLAYER_MOVED')).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-18b: PLAYER_ARRIVED at t+0.1s, NOT at t=0
// ---------------------------------------------------------------------------

describe('AC-PM-18b: PLAYER_ARRIVED timing', () => {

  test('test_player_arrived_not_emitted_at_t0', () => {
    // Arrange
    const { bus, pm } = setup(3, 3);

    // Act — move without advancing clock
    pm.executeMove(PLAYER, 0);

    // Assert — ARRIVED not emitted yet
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);
  });

  test('test_player_arrived_emitted_after_move_tween_duration', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);
    clock.setTime(10.0);

    // Act
    pm.executeMove(PLAYER, 0);
    clock.advance(MOVE_TWEEN_DURATION + 0.001); // just past 0.1s

    // Assert
    const arrivedEvents = bus.eventsOf('PLAYER_ARRIVED');
    expect(arrivedEvents).toHaveLength(1);
    expect(arrivedEvents[0].cell).toEqual({ row: 3, col: 4 });
    expect(arrivedEvents[0].playerId).toBe(PLAYER);
  });

  test('test_player_arrived_not_emitted_before_tween_completes', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(PLAYER, 0);

    // Advance to just before tween completes
    clock.advance(MOVE_TWEEN_DURATION - 0.001);

    // Assert — not yet
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);
  });

  test('test_player_arrived_cell_matches_move_destination', () => {
    // Arrange — move up-right (dir=7: dRow=-1, dCol=+1)
    const { clock, bus, pm } = setup(4, 4);

    pm.executeMove(PLAYER, 7);
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Assert
    const arrivedEvents = bus.eventsOf('PLAYER_ARRIVED');
    expect(arrivedEvents[0].cell).toEqual({ row: 3, col: 5 });
  });

  test('test_player_moved_and_arrived_emit_sequence_t0_then_t01', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);
    clock.setTime(10.0);

    pm.executeMove(PLAYER, 0);

    // At t=10: only PLAYER_MOVED
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);

    clock.setTime(10.0 + MOVE_TWEEN_DURATION + 0.001);

    // After 0.1s: also PLAYER_ARRIVED
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(1);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-5 + AC-PM-6: Input during tween → single-slot buffer (overwrite)
// ---------------------------------------------------------------------------

describe('AC-PM-5/6: Input buffer during tween', () => {

  test('test_input_during_tween_does_not_execute_immediately', () => {
    // Arrange
    const { bus, pm } = setup(3, 3);

    pm.executeMove(PLAYER, 0); // tween starts

    // Act — send another input before tween completes
    pm.executeMove(PLAYER, 2); // down

    // Assert — no second PLAYER_MOVED yet
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
    expect(pm.getPosition(PLAYER)).toEqual({ row: 3, col: 4 }); // first move only
  });

  test('test_second_input_overwrites_first_in_buffer', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(PLAYER, 0);    // move right, tween active

    pm.executeMove(PLAYER, 2);    // down → buffer=2
    pm.executeMove(PLAYER, 4);    // left → buffer=4 (overwrites 2)
    pm.executeMove(PLAYER, 2);    // down again → buffer=2 (overwrites 4)
    pm.executeMove(PLAYER, 6);    // up → buffer=6 (final buffer value)

    // Act — tween completes
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Assert — only the LAST buffered input (dir=6, up) executed
    // From {3,4}, up (dir=6): dRow=-1 → {2,4}
    expect(pm.getPosition(PLAYER)).toEqual({ row: 2, col: 4 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(2); // initial + buffered
  });

  test('test_five_rapid_inputs_only_last_executes_after_tween', () => {
    // Arrange
    const { clock, bus, pm } = setup(4, 4);

    pm.executeMove(PLAYER, 0); // right → {4,5}, tween active

    // 5 rapid inputs — only last (dir=6, up) should execute
    for (let dir = 0; dir < 5; dir++) {
      pm.executeMove(PLAYER, dir as 0 | 1 | 2 | 3 | 4);
    }

    // Tween completes
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Final position: from {4,5}, dir=4 (last of 0..4 = 4=left): {4,4}
    expect(pm.getPosition(PLAYER)).toEqual({ row: 4, col: 4 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-7: Buffer auto-executes on tween completion
// ---------------------------------------------------------------------------

describe('AC-PM-7: Buffer auto-execute on tween completion', () => {

  test('test_buffered_valid_move_executes_on_tween_completion', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(PLAYER, 0); // right → {3,4}, tween
    pm.executeMove(PLAYER, 2); // buffer: down

    // Act — tween completes
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Assert — buffer executed: from {3,4}, dir=2 (down): {4,4}
    expect(pm.getPosition(PLAYER)).toEqual({ row: 4, col: 4 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
  });

  test('test_no_buffer_on_tween_completion_does_not_move', () => {
    // Arrange
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(PLAYER, 0); // right → {3,4}, tween, no buffer

    // Act
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Assert — no extra move after tween
    expect(pm.getPosition(PLAYER)).toEqual({ row: 3, col: 4 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
  });

  test('test_buffered_move_can_chain_to_second_tween', () => {
    // Arrange — two buffered inputs chain: first fires, then second buffers during chain tween
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(PLAYER, 0); // right → {3,4}, tween
    pm.executeMove(PLAYER, 2); // buffer: down (→ {4,4})

    // First tween completes → buffer executes → second tween starts
    clock.advance(MOVE_TWEEN_DURATION + 0.001);
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
    expect(pm.getPosition(PLAYER)).toEqual({ row: 4, col: 4 });

    // Second tween also completes
    clock.advance(MOVE_TWEEN_DURATION + 0.001);
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(2);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-14: Buffered direction revalidated on tween completion
// ---------------------------------------------------------------------------

describe('AC-PM-14: Buffer revalidation on tween complete', () => {

  test('test_buffered_direction_invalid_from_new_position_drops_silently', () => {
    // Arrange — player moves to right edge; buffer holds "right" which is now invalid
    // Setup: {0,6} → move right to {0,7} (edge), buffer=right(0) which would be {0,8}
    const { clock, bus, pm } = setup(0, 6);

    pm.executeMove(PLAYER, 0); // right → {0,7}, tween
    pm.executeMove(PLAYER, 0); // buffer: right again (would be {0,8} = invalid)

    // Tween completes — buffer fires, revalidates: isValidCell({0,8})=false → drop
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Assert — player at {0,7}, no second PLAYER_MOVED
    expect(pm.getPosition(PLAYER)).toEqual({ row: 0, col: 7 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
  });

  test('test_buffered_direction_valid_from_new_position_executes', () => {
    // Arrange — {0,6}, buffer=left(4) which is valid from {0,7}
    const { clock, bus, pm } = setup(0, 6);

    pm.executeMove(PLAYER, 0); // right → {0,7}, tween
    pm.executeMove(PLAYER, 4); // buffer: left → from {0,7} to {0,6} (valid)

    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Assert — moved right then left = back to {0,6}
    expect(pm.getPosition(PLAYER)).toEqual({ row: 0, col: 6 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
  });

});
