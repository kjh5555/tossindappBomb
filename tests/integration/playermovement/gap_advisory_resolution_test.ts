/**
 * GAP Advisory Resolution Tests — Sprint 3 QA Sign-off Gaps 02, 03, 04
 *
 * References:
 *   production/qa/qa-signoff-sprint-3-2026-04-22.md — GAP-02, GAP-03, GAP-04
 *
 * GAP-02: PLAYER_KILLED wiring — playerIds array extraction
 *   Pattern: bus.on('PLAYER_KILLED', evt => pm.onPlayerKilled(evt.playerIds))
 *   Risk: caller mistakenly passes the whole event object instead of the array.
 *
 * GAP-03: FrameClock.cancelSchedule uses === reference equality.
 *   Risk: callers assume opaque handle; cancelling a different reference is a no-op.
 *
 * GAP-04: GridSimulation.onPlayerArrived emits PLAYER_KILLED cause=DANGER_ZONE
 *   when the landing cell is in the EXPLODED state (AC-PM-13).
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { FrameClock } from '../../../src/core/time/FrameClock';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { PlayerMovement } from '../../../src/core/player/PlayerMovement';
import { GridSimulation, ExplodePattern } from '../../../src/core/grid/GridSimulation';
import { GATE_PERIOD_BASE, T_EX } from '../../../src/core/grid/GridConstants';
import type { CellCoord, PlayerId } from '../../../src/core/types/Domain';

// ---------------------------------------------------------------------------
// GAP-02: PLAYER_KILLED wiring — playerIds array extraction
// ---------------------------------------------------------------------------

describe('GAP-02: PLAYER_KILLED wiring — playerIds array extraction', () => {
  let bus: EventBus;
  let clock: MockFrameClock;
  let pm: PlayerMovement;

  beforeEach(() => {
    bus = new EventBus();
    clock = new MockFrameClock();
    pm = new PlayerMovement(clock, bus);
    pm.setPosition('p1', { row: 3, col: 3 });
    // This is the wiring contract under test: the handler must extract evt.playerIds
    bus.on('PLAYER_KILLED', evt => pm.onPlayerKilled(evt.playerIds));
  });

  test('player is marked Dead after PLAYER_KILLED event is emitted and flushed', () => {
    // Arrange
    expect(pm.getPlayerState('p1')).toBe('Alive');

    // Act
    bus.emit('PLAYER_KILLED', {
      playerIds: ['p1'],
      cellId: { row: 3, col: 3 },
      cause: 'EXPLOSION',
      timestamp: 0,
    });
    clock.advanceBy(0, bus); // flush

    // Assert
    expect(pm.getPlayerState('p1')).toBe('Dead');
  });

  test('multi-player kill event marks all listed players Dead', () => {
    // Arrange
    pm.setPosition('p2', { row: 4, col: 4 });

    // Act
    bus.emit('PLAYER_KILLED', {
      playerIds: ['p1', 'p2'],
      cellId: { row: 3, col: 3 },
      cause: 'EXPLOSION',
      timestamp: 0,
    });
    clock.advanceBy(0, bus);

    // Assert
    expect(pm.getPlayerState('p1')).toBe('Dead');
    expect(pm.getPlayerState('p2')).toBe('Dead');
  });

  test('unlisted player remains Alive when only one player is killed', () => {
    // Arrange
    pm.setPosition('p2', { row: 4, col: 4 });

    // Act
    bus.emit('PLAYER_KILLED', {
      playerIds: ['p1'],
      cellId: { row: 3, col: 3 },
      cause: 'EXPLOSION',
      timestamp: 0,
    });
    clock.advanceBy(0, bus);

    // Assert
    expect(pm.getPlayerState('p1')).toBe('Dead');
    expect(pm.getPlayerState('p2')).toBe('Alive');
  });

  test('duplicate PLAYER_KILLED for same player is idempotent — no error, state stays Dead', () => {
    // Act
    bus.emit('PLAYER_KILLED', {
      playerIds: ['p1'],
      cellId: { row: 3, col: 3 },
      cause: 'EXPLOSION',
      timestamp: 0,
    });
    clock.advanceBy(0, bus);
    expect(pm.getPlayerState('p1')).toBe('Dead');

    // Act again
    bus.emit('PLAYER_KILLED', {
      playerIds: ['p1'],
      cellId: { row: 3, col: 3 },
      cause: 'EXPLOSION',
      timestamp: 1,
    });
    expect(() => clock.advanceBy(0, bus)).not.toThrow();

    // Assert
    expect(pm.getPlayerState('p1')).toBe('Dead');
  });

  test('kill cancels pending PLAYER_ARRIVED tween — no spurious arrival after kill', () => {
    // Arrange: start a move (schedules PLAYER_ARRIVED at t+0.1)
    const arrivals: string[] = [];
    bus.on('PLAYER_ARRIVED', e => arrivals.push(e.playerId));
    pm.executeMove('p1', 0 /* RIGHT */);
    clock.advanceBy(0, bus); // flush PLAYER_MOVED, tween in flight

    // Act: kill before tween fires
    bus.emit('PLAYER_KILLED', {
      playerIds: ['p1'],
      cellId: { row: 3, col: 4 },
      cause: 'EXPLOSION',
      timestamp: 0,
    });
    clock.advanceBy(0, bus); // flush kill — cancels arrivedHandle

    // Advance past tween window
    clock.advanceBy(0.2, bus);

    // Assert: PLAYER_ARRIVED must not have fired
    expect(arrivals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GAP-03: FrameClock.cancelSchedule — fn reference equality (real FrameClock)
// ---------------------------------------------------------------------------

describe('GAP-03: FrameClock.cancelSchedule — function reference equality', () => {
  let bus: EventBus;
  let clock: FrameClock;

  beforeEach(() => {
    bus = new EventBus();
    clock = new FrameClock(bus);
  });

  test('cancelled fn does not fire after tick past its fire time', () => {
    // Arrange
    let fired = false;
    const fn = () => { fired = true; };

    // Act
    clock.schedule(fn, 0.1);
    clock.cancelSchedule(fn); // cancel by exact reference
    clock.tick(0.2);           // advance past fire time

    // Assert
    expect(fired).toBe(false);
  });

  test('non-cancelled fn fires normally after tick', () => {
    // Arrange
    let fired = false;
    const fn = () => { fired = true; };

    // Act
    clock.schedule(fn, 0.1);
    clock.tick(0.2);

    // Assert
    expect(fired).toBe(true);
  });

  test('cancelling fn1 does not prevent fn2 from firing', () => {
    // Arrange
    let fn1Fired = false;
    let fn2Fired = false;
    const fn1 = () => { fn1Fired = true; };
    const fn2 = () => { fn2Fired = true; };

    // Act
    clock.schedule(fn1, 0.1);
    clock.schedule(fn2, 0.1);
    clock.cancelSchedule(fn1);
    clock.tick(0.2);

    // Assert
    expect(fn1Fired).toBe(false);
    expect(fn2Fired).toBe(true);
  });

  test('cancelling a different function reference with same body is a no-op (reference equality, not structural)', () => {
    // Arrange: two separate closures — different references, same behaviour
    let originalFired = false;
    const original = () => { originalFired = true; };
    const imposter = () => { originalFired = true; }; // same body, different identity

    // Act
    clock.schedule(original, 0.1);
    clock.cancelSchedule(imposter); // wrong reference — original is NOT cancelled
    clock.tick(0.2);

    // Assert: original still fires because cancelSchedule uses ===
    expect(originalFired).toBe(true);
  });

  test('cancelSchedule after fn has already fired does not throw', () => {
    // Arrange
    const fn = () => {};
    clock.schedule(fn, 0.1);
    clock.tick(0.2); // fn fires here, removed from schedule list

    // Act + Assert: second cancel on already-fired fn is safe
    expect(() => clock.cancelSchedule(fn)).not.toThrow();
  });

  test('cancelling one of two identical-time schedules only removes one entry', () => {
    // Arrange: same fn scheduled twice
    let callCount = 0;
    const fn = () => { callCount++; };

    // Act
    clock.schedule(fn, 0.1);
    clock.schedule(fn, 0.1);
    clock.cancelSchedule(fn); // removes the FIRST entry only (findIndex, splice(idx, 1))
    clock.tick(0.2);

    // Assert: the second scheduled entry still fires
    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GAP-04: GridSimulation.onPlayerArrived — EXPLODED cell hazard (AC-PM-13)
// ---------------------------------------------------------------------------

describe('GAP-04: GridSimulation.onPlayerArrived — EXPLODED cell emits PLAYER_KILLED', () => {
  const SAFE_WIN = GATE_PERIOD_BASE - T_EX; // 2.0 - 0.35 = 1.65 s

  let bus: EventBus;
  let clock: MockFrameClock;
  let grid: GridSimulation;

  const GATE_CELL: CellCoord = { row: 0, col: 0 };

  // Single-cell pattern — 63 safe cells, easily passes A-7 MIN_SAFE_CELLS check
  const PATTERN: ExplodePattern = {
    patternId: 'gap04-test',
    cells: [GATE_CELL],
    bfsVerified: true,
  };

  beforeEach(() => {
    bus = new EventBus();
    clock = new MockFrameClock();
    grid = new GridSimulation(bus, clock);
    grid.applyPattern(PATTERN, new Map());
    clock.advanceBy(0, bus); // flush initial CELL_STATE_CHANGED events
  });

  test('arrival on IDLE gate cell does not emit PLAYER_KILLED', () => {
    // Arrange: cell starts IDLE
    expect(grid.getCellState(GATE_CELL)).toBe('IDLE');
    const kills: unknown[] = [];
    bus.on('PLAYER_KILLED', e => kills.push(e));

    // Act
    grid.onPlayerArrived('p1', GATE_CELL);
    clock.advanceBy(0, bus);

    // Assert
    expect(kills).toHaveLength(0);
  });

  test('arrival on EXPLODED gate cell emits PLAYER_KILLED with cause=DANGER_ZONE', () => {
    // Arrange: advance to EXPLODED state
    const kills: Array<{ playerIds: PlayerId[]; cause: string }> = [];
    bus.on('PLAYER_KILLED', e => kills.push({ playerIds: e.playerIds, cause: e.cause }));

    clock.advanceBy(SAFE_WIN, bus);
    grid.update(new Map()); // triggers IDLE → EXPLODED transition
    clock.advanceBy(0, bus);

    expect(grid.getCellState(GATE_CELL)).toBe('EXPLODED');

    // Act
    grid.onPlayerArrived('p1', GATE_CELL);
    clock.advanceBy(0, bus);

    // Assert
    expect(kills).toHaveLength(1);
    expect(kills[0].playerIds).toEqual(['p1']);
    expect(kills[0].cause).toBe('DANGER_ZONE');
  });

  test('arrival on non-gate cell does not emit PLAYER_KILLED', () => {
    // Arrange
    const kills: unknown[] = [];
    bus.on('PLAYER_KILLED', e => kills.push(e));
    const nonGateCell: CellCoord = { row: 7, col: 7 }; // not in PATTERN

    // Act
    grid.onPlayerArrived('p1', nonGateCell);
    clock.advanceBy(0, bus);

    // Assert
    expect(kills).toHaveLength(0);
  });

  test('arrival after cell returns to IDLE does not emit PLAYER_KILLED', () => {
    // Arrange: advance through full EXPLODED window back to IDLE
    const kills: unknown[] = [];
    bus.on('PLAYER_KILLED', e => kills.push(e));

    clock.advanceBy(SAFE_WIN, bus);
    grid.update(new Map());                // IDLE → EXPLODED
    clock.advanceBy(T_EX, bus);
    grid.update(new Map());                // EXPLODED → IDLE
    clock.advanceBy(0, bus);

    expect(grid.getCellState(GATE_CELL)).toBe('IDLE');

    // Act
    grid.onPlayerArrived('p1', GATE_CELL);
    clock.advanceBy(0, bus);

    // Assert
    expect(kills).toHaveLength(0);
  });

  test('duplicate arrival same frame — PLAYER_KILLED emitted exactly once (deadThisFrame guard)', () => {
    // Arrange: advance to EXPLODED
    const kills: unknown[] = [];
    bus.on('PLAYER_KILLED', e => kills.push(e));

    clock.advanceBy(SAFE_WIN, bus);
    grid.update(new Map());
    clock.advanceBy(0, bus);

    // Act: two arrivals in the same frame (no update() between them)
    grid.onPlayerArrived('p1', GATE_CELL);
    grid.onPlayerArrived('p1', GATE_CELL);
    clock.advanceBy(0, bus);

    // Assert: deduplicated by deadThisFrame set
    expect(kills).toHaveLength(1);
  });

  test('two different players arriving on EXPLODED cell in same frame — both killed', () => {
    // Arrange
    const killedIds: PlayerId[][] = [];
    bus.on('PLAYER_KILLED', e => killedIds.push(e.playerIds));

    clock.advanceBy(SAFE_WIN, bus);
    grid.update(new Map());
    clock.advanceBy(0, bus);

    // Act
    grid.onPlayerArrived('p1', GATE_CELL);
    grid.onPlayerArrived('p2', GATE_CELL);
    clock.advanceBy(0, bus);

    // Assert: two separate PLAYER_KILLED events, one per player
    const flatKilled = killedIds.flat();
    expect(flatKilled).toContain('p1');
    expect(flatKilled).toContain('p2');
  });
});
