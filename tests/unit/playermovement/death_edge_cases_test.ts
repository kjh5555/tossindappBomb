/**
 * death_edge_cases_test.ts
 * Unit tests for PlayerMovement story-003: death handling + edge cases.
 *
 * Story: PlayerMovement story-003
 *
 * Coverage:
 *  AC-PM-8   Dead state — moves ignored after PLAYER_KILLED
 *  AC-PM-9   Buffer cleared on PLAYER_KILLED
 *  AC-PM-11  Source cell explosion during tween — logical coord is destination
 *  AC-PM-13  Landing on EXPLODED cell — PlayerMovement accepts move (GridSim fires kill)
 *  AC-PM-15  Cross movement swap — both players complete moves
 *  AC-PM-16  Death + buffered input same tick — death wins, no move
 *  AC-PM-17  Round end tween snap — PLAYER_ARRIVED cancelled, no post-round event
 *  AC-PM-19  Same-destination simultaneous — both logical coords set to destination
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { PlayerMovement, MOVE_TWEEN_DURATION } from '../../../src/core/player/PlayerMovement';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { GameEvents } from '../../../src/core/events/GameEvents';
import type { PlayerId } from '../../../src/core/types/Domain';

// ---------------------------------------------------------------------------
// ControllableFrameClock
// ---------------------------------------------------------------------------

class ControllableFrameClock implements IFrameClock {
  private _now = 0;
  private pending: Array<{ at: number; fn: () => void }> = [];

  get simulatedTime(): number { return this._now; }
  now(): number { return this._now; }
  dt(): number { return 0; }
  tick(_dt: number): void {}

  setTime(t: number): void {
    const prev = this._now;
    this._now = t;
    const toFire = this.pending
      .filter(s => s.at > prev && s.at <= t)
      .sort((a, b) => a.at - b.at);
    this.pending = this.pending.filter(s => !(s.at > prev && s.at <= t));
    toFire.forEach(s => s.fn());
  }

  advance(dt: number): void { this.setTime(this._now + dt); }

  schedule(fn: () => void, delaySecs: number): void {
    this.pending.push({ at: this._now + delaySecs, fn });
  }

  cancelSchedule(fn: () => void): void {
    this.pending = this.pending.filter(s => s.fn !== fn);
  }

  pendingCount(): number { return this.pending.length; }
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

const P1 = 'p1' as PlayerId;
const P2 = 'p2' as PlayerId;

function setup(startRow = 3, startCol = 3) {
  const clock = new ControllableFrameClock();
  const bus   = new MockEventBus();
  const pm    = new PlayerMovement(clock, bus);
  pm.setPosition(P1, { row: startRow, col: startCol });
  return { clock, bus, pm };
}

function setupTwo() {
  const clock = new ControllableFrameClock();
  const bus   = new MockEventBus();
  const pm    = new PlayerMovement(clock, bus);
  pm.setPosition(P1, { row: 3, col: 3 });
  pm.setPosition(P2, { row: 3, col: 4 });
  return { clock, bus, pm };
}

// ---------------------------------------------------------------------------
// AC-PM-8: Dead state — moves ignored after PLAYER_KILLED
// ---------------------------------------------------------------------------

describe('AC-PM-8: Dead state — moves ignored', () => {

  test('test_execute_move_ignored_after_player_killed', () => {
    const { pm, bus } = setup(3, 3);

    pm.onPlayerKilled([P1]);

    pm.executeMove(P1, 0); // right — should be ignored

    expect(bus.countOf('PLAYER_MOVED')).toBe(0);
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 3 }); // unchanged
  });

  test('test_on_move_intent_ignored_after_player_killed', () => {
    const { pm, bus } = setup(3, 3);

    pm.onPlayerKilled([P1]);

    pm.onMoveIntent(P1, 0, 25); // should be ignored

    expect(bus.countOf('PLAYER_MOVED')).toBe(0);
  });

  test('test_player_state_is_dead_after_killed', () => {
    const { pm } = setup(3, 3);

    expect(pm.getPlayerState(P1)).toBe('Alive');

    pm.onPlayerKilled([P1]);

    expect(pm.getPlayerState(P1)).toBe('Dead');
  });

  test('test_setposition_resets_dead_player_to_alive', () => {
    const { pm, bus } = setup(3, 3);

    pm.onPlayerKilled([P1]);
    pm.setPosition(P1, { row: 4, col: 4 });

    expect(pm.getPlayerState(P1)).toBe('Alive');

    pm.executeMove(P1, 0);
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
  });

  test('test_killed_player_not_tweening_still_marked_dead', () => {
    const { pm } = setup(3, 3);
    // Kill without any active tween
    pm.onPlayerKilled([P1]);
    expect(pm.getPlayerState(P1)).toBe('Dead');
    expect(pm.arrivedHandles.get(P1)).toBeNull();
  });

  test('test_player_arrived_not_emitted_after_kill_mid_tween', () => {
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // tween starts
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);

    pm.onPlayerKilled([P1]); // kill mid-tween — cancel arrived

    clock.advance(MOVE_TWEEN_DURATION + 0.001); // tween would have fired

    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0); // cancelled
  });

});

// ---------------------------------------------------------------------------
// AC-PM-9: Buffer cleared on PLAYER_KILLED
// ---------------------------------------------------------------------------

describe('AC-PM-9: Buffer cleared on PLAYER_KILLED', () => {

  test('test_buffer_cleared_when_player_killed_during_tween', () => {
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // right → {3,4}, tween active
    pm.executeMove(P1, 2); // buffer: down

    pm.onPlayerKilled([P1]);

    // Tween time passes — buffer should NOT execute
    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // Only the first PLAYER_MOVED, nothing from buffer
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 }); // stayed at first destination
  });

  test('test_buffer_is_null_after_kill', () => {
    const { pm } = setup(3, 3);

    pm.executeMove(P1, 0); // tween
    pm.executeMove(P1, 2); // buffer direction

    pm.onPlayerKilled([P1]);

    // After kill, arrivedHandles should be null
    expect(pm.arrivedHandles.get(P1)).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// AC-PM-11: Source cell explosion during tween — logical coord is destination
// ---------------------------------------------------------------------------

describe('AC-PM-11: Source cell not used after t=0 move', () => {

  test('test_logical_coord_is_destination_immediately_at_t0', () => {
    // GridSimulation reads logicalCoord for death detection.
    // At t=0, logicalCoord is already at destination — source cell explosion won't kill player.
    const { pm } = setup(3, 3);

    pm.executeMove(P1, 0); // right: {3,3} → {3,4}

    // Immediately after executeMove (before tween completes), coord is at destination
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 });
    // Source {3,3} is no longer the player's logical position
  });

  test('test_logical_coord_is_destination_mid_tween', () => {
    const { clock, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // right: {3,3} → {3,4}

    clock.advance(MOVE_TWEEN_DURATION / 2); // halfway through tween

    // Logical coord is still at destination (not interpolated)
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 });
  });

});

// ---------------------------------------------------------------------------
// AC-PM-13: Landing on EXPLODED cell — PlayerMovement accepts move
// ---------------------------------------------------------------------------

describe('AC-PM-13: Move to EXPLODED cell accepted by PlayerMovement', () => {

  test('test_player_movement_does_not_reject_any_in_bounds_destination', () => {
    // PlayerMovement has no knowledge of cell states.
    // PLAYER_KILLED for landing on an EXPLODED cell comes from GridSimulation.
    const { bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // right — destination is always accepted if in-bounds

    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 });
  });

});

// ---------------------------------------------------------------------------
// AC-PM-15: Cross movement — A→Y, B→X swap both succeed
// ---------------------------------------------------------------------------

describe('AC-PM-15: Cross movement swap succeeds', () => {

  test('test_player_a_and_b_swap_cells_successfully', () => {
    // A at {3,3} moves right → {3,4}; B at {3,4} moves left → {3,3}
    const { bus, pm } = setupTwo();

    pm.executeMove(P1, 0); // right: {3,3} → {3,4}
    pm.executeMove(P2, 4); // left:  {3,4} → {3,3}

    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 });
    expect(pm.getPosition(P2)).toEqual({ row: 3, col: 3 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
  });

  test('test_swap_both_player_arrived_fire_after_tween', () => {
    const { clock, bus, pm } = setupTwo();

    pm.executeMove(P1, 0); // right
    pm.executeMove(P2, 4); // left

    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    expect(bus.countOf('PLAYER_ARRIVED')).toBe(2);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-16: Death + buffered input same tick — death wins
// ---------------------------------------------------------------------------

describe('AC-PM-16: Death during same tick as buffered input', () => {

  test('test_death_clears_buffer_before_tween_complete', () => {
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // right → {3,4}, tween
    pm.executeMove(P1, 2); // buffer: down

    // Kill before tween completes
    pm.onPlayerKilled([P1]);

    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    // No second PLAYER_MOVED, no PLAYER_ARRIVED
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 });
  });

  test('test_kill_at_tween_boundary_still_cancels_arrived', () => {
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0);

    // Kill just before tween fires
    pm.onPlayerKilled([P1]);

    // Clock advances past tween point — arrived must not fire
    clock.setTime(MOVE_TWEEN_DURATION + 0.05);

    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-17: Round end tween snap — PLAYER_ARRIVED cancelled
// ---------------------------------------------------------------------------

describe('AC-PM-17: Round end — pending PLAYER_ARRIVED cancelled', () => {

  test('test_on_round_end_cancels_pending_arrived_schedule', () => {
    const { clock, bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // tween active
    expect(bus.countOf('PLAYER_MOVED')).toBe(1);

    pm.onRoundEnd();

    clock.advance(MOVE_TWEEN_DURATION + 0.001); // tween would have fired

    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0); // cancelled
  });

  test('test_on_round_end_clears_tween_active', () => {
    const { pm } = setup(3, 3);

    pm.executeMove(P1, 0); // tween starts
    pm.onRoundEnd();

    // arrivedHandle is cleared
    expect(pm.arrivedHandles.get(P1)).toBeNull();
  });

  test('test_on_round_end_with_no_active_tween_is_noop', () => {
    const { clock, bus, pm } = setup(3, 3);

    pm.onRoundEnd(); // no tween active — should not throw

    clock.advance(1.0);
    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0);
  });

  test('test_on_round_end_cancels_all_active_players', () => {
    const { clock, bus, pm } = setupTwo();

    pm.executeMove(P1, 0); // tween for P1
    pm.executeMove(P2, 4); // tween for P2

    pm.onRoundEnd();

    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    expect(bus.countOf('PLAYER_ARRIVED')).toBe(0); // both cancelled
  });

  test('test_player_can_move_again_after_round_end_and_setposition', () => {
    const { bus, pm } = setup(3, 3);

    pm.executeMove(P1, 0); // tween
    pm.onRoundEnd();
    pm.setPosition(P1, { row: 0, col: 0 }); // reset for new round

    pm.executeMove(P1, 2); // down — should work
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
  });

});

// ---------------------------------------------------------------------------
// AC-PM-19: Same-destination simultaneous — both logical coords set
// ---------------------------------------------------------------------------

describe('AC-PM-19: Same-destination simultaneous arrivals both accepted', () => {

  test('test_two_players_move_to_same_cell_both_accepted', () => {
    const clock = new ControllableFrameClock();
    const bus   = new MockEventBus();
    const pm    = new PlayerMovement(clock, bus);
    pm.setPosition(P1, { row: 3, col: 3 });
    pm.setPosition(P2, { row: 3, col: 5 });

    pm.executeMove(P1, 0); // right: {3,3} → {3,4}
    pm.executeMove(P2, 4); // left:  {3,5} → {3,4}

    // Both arrive at {3,4}
    expect(pm.getPosition(P1)).toEqual({ row: 3, col: 4 });
    expect(pm.getPosition(P2)).toEqual({ row: 3, col: 4 });
    expect(bus.countOf('PLAYER_MOVED')).toBe(2);
  });

  test('test_same_destination_both_player_arrived_fire', () => {
    const clock = new ControllableFrameClock();
    const bus   = new MockEventBus();
    const pm    = new PlayerMovement(clock, bus);
    pm.setPosition(P1, { row: 3, col: 3 });
    pm.setPosition(P2, { row: 3, col: 5 });

    pm.executeMove(P1, 0);
    pm.executeMove(P2, 4);

    clock.advance(MOVE_TWEEN_DURATION + 0.001);

    expect(bus.countOf('PLAYER_ARRIVED')).toBe(2);
  });

});
