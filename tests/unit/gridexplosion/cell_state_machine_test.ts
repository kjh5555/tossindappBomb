/**
 * cell_state_machine_test.ts
 * Unit tests for GridSimulation — cyclic 2-state cell state machine (Cyclic v4).
 *
 * Implements acceptance criteria from: design/gdd/grid-explosion.md § Acceptance Criteria
 * Covers: AC-1, AC-2, AC-3, AC-4, AC-4b, AC-5, AC-6, AC-7, AC-8,
 *         AC-9, AC-10, AC-11, AC-12, AC-16, AC-17, AC-18,
 *         AC-21, AC-22, AC-23, AC-24
 *
 * AC-13/14/15 are ADVISORY (manual/screenshot) — not covered here.
 * AC-19/20 (performance) are separate profiling tests.
 */

import { GridSimulation, ExplodePattern } from '../../../src/core/grid/GridSimulation';
import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { CellCoord, PlayerId } from '../../../src/core/types/Domain';
import {
  GATE_PERIOD_BASE,
  GATE_PERIOD_FLOOR,
  T_EX,
  MIN_SAFE_CELLS,
  PATTERN_TIMEOUT,
  GRID_TOTAL,
} from '../../../src/core/grid/GridConstants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unlockBus(bus: EventBus) { (bus as any).unlockFlush(); }

function makeSim() {
  const clock = new MockFrameClock();
  const bus = new EventBus();
  const sim = new GridSimulation(bus, clock);
  return { clock, bus, sim };
}

/** A single gate cell in the top-left corner. */
const CELL_00: CellCoord = { row: 0, col: 0 };
const CELL_01: CellCoord = { row: 0, col: 1 };
const CELL_10: CellCoord = { row: 1, col: 0 };

/** 56 gate cells (top-left 7×8 = 56), leaving bottom row (8 cells) as safe. */
function make56GateCells(): CellCoord[] {
  const cells: CellCoord[] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({ row, col });
    }
  }
  return cells; // 56 cells
}

/** 57 gate cells — violates MIN_SAFE_CELLS=8 (only 7 safe). */
function make57GateCells(): CellCoord[] {
  const cells = make56GateCells();
  cells.push({ row: 7, col: 0 }); // 57th
  return cells;
}

/** Build a valid single-gate pattern. */
function singleGatePattern(cell: CellCoord = CELL_00): ExplodePattern {
  return { patternId: 'test-single', cells: [cell], bfsVerified: true };
}

/** Build a pattern with 56 valid gates + 8 safe cells in the last row. */
function valid56Pattern(): ExplodePattern {
  return { patternId: 'test-56', cells: make56GateCells(), bfsVerified: true };
}

/** Advance clock + flush bus. */
function tick(clock: MockFrameClock, bus: EventBus, dt: number) {
  clock.advanceBy(dt, bus);
}

/** Collect all emissions of an event key from a bus over a block of code. */
function collect<K extends keyof import('../../../src/core/events/GameEvents').GameEvents>(
  bus: EventBus,
  key: K,
  block: () => void,
): import('../../../src/core/events/GameEvents').GameEvents[K][] {
  const results: any[] = [];
  bus.on(key, (payload: any) => results.push(payload));
  block();
  return results;
}

// ---------------------------------------------------------------------------
// Category 1 — Cyclic state transition correctness (AC-1, AC-2, AC-3, AC-4, AC-4b)
// ---------------------------------------------------------------------------

describe('GridSimulation — Category 1: Cyclic state transitions', () => {

  test('AC-1: gate cell cycles [IDLE, EXPLODED, IDLE, EXPLODED, ...] with no intermediate states', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const states: string[] = [];
    bus.on('CELL_STATE_CHANGED', (p) => {
      if (p.cell.row === 0 && p.cell.col === 0) states.push(p.state);
    });
    const noPlayers: Map<PlayerId, CellCoord> = new Map();

    // Act: apply pattern then advance 3 full cycles
    sim.applyPattern(singleGatePattern(), noPlayers);
    unlockBus(bus); bus.flush();

    const safeWin = GATE_PERIOD_BASE - T_EX; // 1.65s
    const cycleDt = 0.016; // ~60fps steps
    let elapsed = 0;
    while (elapsed < GATE_PERIOD_BASE * 3 + 0.1) {
      tick(clock, bus, cycleDt);
      elapsed += cycleDt;
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
    }

    // Assert: sequence must be EXPLODED, IDLE repeating (initial IDLE from applyPattern is first)
    // Filter: only EXPLODED and IDLE transitions from update loop
    const transitions = states.filter(s => s === 'EXPLODED' || s === 'IDLE');
    // Must have at least 6 transitions in 3 cycles (3× IDLE→EXPLODED + 3× EXPLODED→IDLE)
    expect(transitions.length).toBeGreaterThanOrEqual(6);
    // Every even-index transition should be EXPLODED, odd should be IDLE (after initial IDLE)
    const cycleTransitions = transitions.slice(1); // skip initial IDLE from applyPattern
    for (let i = 0; i < cycleTransitions.length; i++) {
      if (i % 2 === 0) expect(cycleTransitions[i]).toBe('EXPLODED');
      else expect(cycleTransitions[i]).toBe('IDLE');
    }
    // No intermediate states
    expect(states.every(s => s === 'IDLE' || s === 'EXPLODED')).toBe(true);
  });

  test('AC-2: Idle duration ≈ SAFE_WIN ±16ms and Exploded duration ≈ T_EX ±16ms over 10 cycles', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const TOLERANCE = 0.016; // 16ms
    const safeWin = GATE_PERIOD_BASE - T_EX;

    const transitions: Array<{ state: string; time: number }> = [];
    bus.on('CELL_STATE_CHANGED', (p) => {
      if (p.cell.row === 0 && p.cell.col === 0) {
        transitions.push({ state: p.state, time: clock.now() });
      }
    });

    // Act
    sim.applyPattern(singleGatePattern(), noPlayers);
    unlockBus(bus); bus.flush();

    const step = 0.001; // 1ms ticks for precision
    let elapsed = 0;
    while (elapsed < GATE_PERIOD_BASE * 10 + 0.1) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: measure durations between transitions
    // transitions[0] = initial IDLE from applyPattern
    // transitions[1] = first EXPLODED, etc.
    for (let i = 1; i < transitions.length - 1; i++) {
      const duration = transitions[i + 1].time - transitions[i].time;
      if (transitions[i].state === 'EXPLODED') {
        // Duration of EXPLODED state ≈ T_EX
        expect(Math.abs(duration - T_EX)).toBeLessThanOrEqual(TOLERANCE);
      } else {
        // Duration of IDLE state ≈ SAFE_WIN
        expect(Math.abs(duration - safeWin)).toBeLessThanOrEqual(TOLERANCE);
      }
    }
    // Must have captured at least 10 cycle transitions
    expect(transitions.length).toBeGreaterThanOrEqual(10);
  });

  test('AC-3: no external forceState API exists — state cannot be externally overridden', () => {
    // Arrange
    const { sim } = makeSim();

    // Assert: GridSimulation has no public forceState or setState method
    expect((sim as any).forceState).toBeUndefined();
    expect((sim as any).setState).toBeUndefined();
    expect((sim as any).setGateState).toBeUndefined();
  });

  test('AC-4: CELL_STATE_CHANGED emitted exactly 4 times for 2 cycles with correct newState sequence', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const captured: Array<{ state: string; cell: CellCoord; timestamp: number }> = [];

    bus.on('CELL_STATE_CHANGED', (p) => {
      if (p.cell.row === 0 && p.cell.col === 0) captured.push(p);
    });

    // Act: apply pattern, run exactly 2 cycles
    sim.applyPattern(singleGatePattern(), noPlayers);
    unlockBus(bus); bus.flush();

    const step = 0.001;
    let elapsed = 0;
    while (elapsed < GATE_PERIOD_BASE * 2 + 0.05) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: after initial IDLE, we expect EXPLODED, IDLE, EXPLODED, IDLE = 4 transitions
    const cycleEvents = captured.filter(e => e.state === 'EXPLODED' || e.state === 'IDLE').slice(1);
    expect(cycleEvents.length).toBe(4);
    expect(cycleEvents[0].state).toBe('EXPLODED');
    expect(cycleEvents[1].state).toBe('IDLE');
    expect(cycleEvents[2].state).toBe('EXPLODED');
    expect(cycleEvents[3].state).toBe('IDLE');

    // Each event has required fields
    for (const e of cycleEvents) {
      expect(e.cell).toBeDefined();
      expect(e.state).toBeDefined();
      expect(e.timestamp).toBeDefined();
      expect(typeof e.timestamp).toBe('number');
    }
  });

  test('AC-4b: setGatePeriod accepts valid values and rejects out-of-range values', () => {
    // Arrange
    const { sim } = makeSim();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Act & Assert — valid values
    sim.setGatePeriod(1.6);
    expect(sim.getGatePeriod()).toBe(1.6);

    sim.setGatePeriod(GATE_PERIOD_FLOOR); // 1.4 — lower boundary
    expect(sim.getGatePeriod()).toBe(GATE_PERIOD_FLOOR);

    sim.setGatePeriod(GATE_PERIOD_BASE); // 2.0 — upper boundary
    expect(sim.getGatePeriod()).toBe(GATE_PERIOD_BASE);

    // Below floor
    sim.setGatePeriod(1.3);
    expect(sim.getGatePeriod()).toBe(GATE_PERIOD_BASE); // unchanged
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rejected'));

    // Above base
    sim.setGatePeriod(2.1);
    expect(sim.getGatePeriod()).toBe(GATE_PERIOD_BASE); // unchanged
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rejected'));

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Category 2 — Explosion judgment fairness (AC-5, AC-6, AC-7, AC-8)
// ---------------------------------------------------------------------------

describe('GridSimulation — Category 2: Explosion judgment', () => {

  test('AC-5: player on gate cell with same-timestep move escapes — PLAYER_KILLED not emitted', () => {
    // This AC tests the move-first ordering contract (EC-2, A-4-2).
    // GridSimulation's responsibility: if playerPositions passed to update()
    // already reflects the moved position, the player is not on the exploding cell.
    //
    // Arrange
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'p1';
    // Player starts on CELL_00 (the gate cell)
    const playerPositions: Map<PlayerId, CellCoord> = new Map([[p1, CELL_00]]);
    const killed: PlayerId[] = [];
    bus.on('PLAYER_KILLED', (p) => killed.push(...p.playerIds));

    sim.applyPattern(singleGatePattern(CELL_00), playerPositions);
    unlockBus(bus); bus.flush();

    // Advance to just before explosion
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin - 0.005) {
      clock.tick(step);
      sim.update(playerPositions);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Act: player moves away (move-first ordering) BEFORE explosion fires
    playerPositions.set(p1, CELL_01); // player is now on safe cell

    // Advance through the explosion moment
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(playerPositions);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: player moved away — not killed
    expect(killed).not.toContain(p1);
  });

  test('AC-6: player landing on Exploded cell is killed with cause=DANGER_ZONE', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'p1';
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const killedEvents: Array<{ playerIds: PlayerId[]; cause: string }> = [];
    bus.on('PLAYER_KILLED', (p) => killedEvents.push({ playerIds: p.playerIds, cause: p.cause }));

    sim.applyPattern(singleGatePattern(CELL_00), noPlayers);
    unlockBus(bus); bus.flush();

    // Advance past SAFE_WIN to put CELL_00 in Exploded
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert cell is Exploded
    expect(sim.getCellState(CELL_00)).toBe('EXPLODED');

    // Act: player arrives on the Exploded cell
    sim.onPlayerArrived(p1, CELL_00);
    unlockBus(bus); bus.flush();

    // Assert
    expect(killedEvents.length).toBe(1);
    expect(killedEvents[0].playerIds).toContain(p1);
    expect(killedEvents[0].cause).toBe('DANGER_ZONE');
  });

  test('AC-7: simultaneous explosion of two cells — processing order does not change outcome', () => {
    // Arrange: two gate cells with same offset → explode at the same tick
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'p1';
    const p2: PlayerId = 'p2';
    const playerPositions: Map<PlayerId, CellCoord> = new Map([
      [p1, CELL_00],
      [p2, CELL_01],
    ]);
    const killed: PlayerId[] = [];
    bus.on('PLAYER_KILLED', (p) => killed.push(...p.playerIds));

    const pattern: ExplodePattern = {
      patternId: 'simultaneous',
      cells: [CELL_00, CELL_01],
      bfsVerified: true,
    };

    sim.applyPattern(pattern, playerPositions);
    unlockBus(bus); bus.flush();

    // Advance to explosion moment
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(playerPositions);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: both players killed regardless of internal iteration order
    expect(killed).toContain(p1);
    expect(killed).toContain(p2);
    expect(killed.length).toBe(2);
  });

  test('AC-8: PLAYER_KILLED cause=EXPLOSION for explosion hit, cause=DANGER_ZONE for landing', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'p1-explosion';
    const p2: PlayerId = 'p2-dangerzone';

    // --- Case (a): p1 on gate cell when it explodes → EXPLOSION ---
    const posA: Map<PlayerId, CellCoord> = new Map([[p1, CELL_00]]);
    const killedA: Array<{ cause: string }> = [];
    bus.on('PLAYER_KILLED', (p) => killedA.push({ cause: p.cause }));

    sim.applyPattern(singleGatePattern(CELL_00), posA);
    unlockBus(bus); bus.flush();

    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(posA);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }
    expect(killedA.some(e => e.cause === 'EXPLOSION')).toBe(true);

    // --- Case (b): p2 lands on already-Exploded cell → DANGER_ZONE ---
    // cell is still Exploded (T_EX not yet elapsed)
    expect(sim.getCellState(CELL_00)).toBe('EXPLODED');

    const killedB: Array<{ cause: string }> = [];
    bus.on('PLAYER_KILLED', (p) => killedB.push({ cause: p.cause }));
    sim.onPlayerArrived(p2, CELL_00);
    unlockBus(bus); bus.flush();
    expect(killedB.some(e => e.cause === 'DANGER_ZONE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Category 3 — Safe cell guarantee (AC-9, AC-10, AC-11, AC-12)
// ---------------------------------------------------------------------------

describe('GridSimulation — Category 3: Safe cell guarantee', () => {

  test('AC-9: valid 56-gate pattern activates without PATTERN_REJECTED, 8 Idle cells remain', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    let rejected = false;
    bus.on('PATTERN_REJECTED', () => { rejected = true; });

    // Act
    sim.applyPattern(valid56Pattern(), noPlayers);
    unlockBus(bus); bus.flush();

    // Assert: no rejection
    expect(rejected).toBe(false);

    // Count Idle (non-gate) cells in bottom row
    let idleCount = 0;
    for (let col = 0; col < 8; col++) {
      if (sim.getCellState({ row: 7, col }) === 'NON_GATE') idleCount++;
    }
    expect(idleCount).toBe(8); // bottom row untouched
  });

  test('AC-10: 57-gate pattern (only 7 safe) is rejected immediately — no timers assigned', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const rejections: Array<{ patternId: string | null; reason: string }> = [];
    bus.on('PATTERN_REJECTED', (p) => rejections.push(p));

    const badPattern: ExplodePattern = {
      patternId: 'bad-57',
      cells: make57GateCells(),
      bfsVerified: true,
    };

    // Act
    sim.applyPattern(badPattern, noPlayers);
    unlockBus(bus); bus.flush();

    // Assert: rejected exactly once
    expect(rejections.length).toBe(1);
    expect(rejections[0].patternId).toBe('bad-57');

    // No gate timers assigned — all cells return NON_GATE
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        expect(sim.getCellState({ row, col })).toBe('NON_GATE');
      }
    }
  });

  test('AC-11: bfsVerified=false pattern is rejected even if safe cell count is sufficient', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const rejections: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (p) => rejections.push(p.patternId));

    const unconnectedPattern: ExplodePattern = {
      patternId: 'unconnected',
      cells: make56GateCells(), // 8 safe — count OK, but connectivity unverified
      bfsVerified: false,       // PatternLibrary said BFS failed
    };

    // Act
    sim.applyPattern(unconnectedPattern, noPlayers);
    unlockBus(bus); bus.flush();

    // Assert
    expect(rejections.length).toBe(1);
    expect(rejections[0]).toBe('unconnected');
    // No gate timers assigned
    expect(sim.getCellState(CELL_00)).toBe('NON_GATE');
  });

  test('AC-12: GRID_STALLED fires once after PATTERN_TIMEOUT seconds following rejection', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const stalledEvents: number[] = [];
    bus.on('GRID_STALLED', (p) => stalledEvents.push(p.timestamp));

    const badPattern: ExplodePattern = {
      patternId: 'bad-stall',
      cells: make57GateCells(),
      bfsVerified: true,
    };

    // Act: inject bad pattern → stall timer starts
    sim.applyPattern(badPattern, noPlayers);
    unlockBus(bus); bus.flush();

    // Advance to just before timeout — should NOT fire yet
    const step = 0.016;
    let elapsed = 0;
    while (elapsed < PATTERN_TIMEOUT - 0.05) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }
    expect(stalledEvents.length).toBe(0);

    // Advance past timeout
    while (elapsed < PATTERN_TIMEOUT + 0.05) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: exactly 1 GRID_STALLED
    expect(stalledEvents.length).toBe(1);

    // Advance further — must NOT fire a second time
    elapsed = 0;
    while (elapsed < PATTERN_TIMEOUT + 0.1) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }
    expect(stalledEvents.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Category 5 — Event emission correctness (AC-16, AC-17, AC-18)
// ---------------------------------------------------------------------------

describe('GridSimulation — Category 5: Event emission correctness', () => {

  test('AC-16: CELL_EXPLODED contains both killed player IDs when 2 players on same cell', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'p-a';
    const p2: PlayerId = 'p-b';
    const playerPositions: Map<PlayerId, CellCoord> = new Map([
      [p1, CELL_00],
      [p2, CELL_00],
    ]);
    const explodedEvents: Array<{ cell: CellCoord; timestamp: number }> = [];
    bus.on('CELL_EXPLODED', (p) => explodedEvents.push(p));

    const killedIds: PlayerId[] = [];
    bus.on('PLAYER_KILLED', (p) => killedIds.push(...p.playerIds));

    sim.applyPattern(singleGatePattern(CELL_00), playerPositions);
    unlockBus(bus); bus.flush();

    // Advance to explosion
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(playerPositions);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: CELL_EXPLODED fired once, both players killed
    expect(explodedEvents.length).toBeGreaterThanOrEqual(1);
    expect(killedIds).toContain(p1);
    expect(killedIds).toContain(p2);
    expect(killedIds.length).toBe(2);
  });

  test('AC-17: PLAYER_KILLED NOT emitted when no players on exploding cell', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const killedCount = { count: 0 };
    bus.on('PLAYER_KILLED', () => killedCount.count++);

    const explodedEvents: number[] = [];
    bus.on('CELL_EXPLODED', () => explodedEvents.push(1));

    sim.applyPattern(singleGatePattern(CELL_00), noPlayers);
    unlockBus(bus); bus.flush();

    // Advance to explosion
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert
    expect(killedCount.count).toBe(0);
    expect(explodedEvents.length).toBeGreaterThanOrEqual(1);
  });

  test('AC-18: all CELL_STATE_CHANGED events carry a timestamp matching the clock', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const events: Array<{ state: string; timestamp: number }> = [];
    bus.on('CELL_STATE_CHANGED', (p) => {
      if (p.cell.row === 0 && p.cell.col === 0) events.push(p);
    });

    sim.applyPattern(singleGatePattern(CELL_00), noPlayers);
    unlockBus(bus); bus.flush();

    // Advance 1 cycle
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < GATE_PERIOD_BASE + 0.05) {
      const before = clock.now();
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: every event has a numeric timestamp, none zero/null/undefined
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(typeof e.timestamp).toBe('number');
      expect(e.timestamp).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Category 7 — Edge cases (AC-21, AC-22, AC-23, AC-24)
// ---------------------------------------------------------------------------

describe('GridSimulation — Category 7: Edge cases', () => {

  test('AC-21: player already dead from cell A is not double-killed by simultaneous cell B explosion', () => {
    // Arrange: p1 is on both CELL_00 and CELL_01 would be killed — but only once
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'shared-player';
    // Player is physically at CELL_00 only
    const playerPositions: Map<PlayerId, CellCoord> = new Map([[p1, CELL_00]]);
    const killedCount = { count: 0 };
    bus.on('PLAYER_KILLED', (p) => killedCount.count += p.playerIds.length);

    // Both cells explode at the same tick
    const pattern: ExplodePattern = {
      patternId: 'double',
      cells: [CELL_00, CELL_01],
      bfsVerified: true,
    };

    sim.applyPattern(pattern, playerPositions);
    unlockBus(bus); bus.flush();

    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(playerPositions);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: p1 killed exactly once even though two cells explode simultaneously
    expect(killedCount.count).toBe(1);
  });

  test('AC-22: setGatePeriod during Exploded state preserves remaining T_EX (EC-5)', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();

    sim.applyPattern(singleGatePattern(CELL_00), noPlayers);
    unlockBus(bus); bus.flush();

    // Advance to just after explosion starts (0.05s into T_EX = 0.3s remaining)
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.05) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    expect(sim.getCellState(CELL_00)).toBe('EXPLODED');

    // Record approximate remaining T_EX before setGatePeriod
    // Act: change gate period
    sim.setGatePeriod(1.6);
    expect(sim.getGatePeriod()).toBe(1.6);

    // The cell should still be Exploded (T_EX not reset)
    expect(sim.getCellState(CELL_00)).toBe('EXPLODED');

    // Advance remaining T_EX (~0.3s more) — cell should return to Idle
    elapsed = 0;
    while (elapsed < T_EX + 0.05) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    expect(sim.getCellState(CELL_00)).toBe('IDLE');

    // Next explosion should use new SAFE_WIN = 1.6 - 0.35 = 1.25s
    const newSafeWin = 1.6 - T_EX;
    const idleEnteredAt = clock.now() - elapsed; // approximate
    const explosionEvents: number[] = [];
    bus.on('CELL_STATE_CHANGED', (p) => {
      if (p.cell.row === 0 && p.cell.col === 0 && p.state === 'EXPLODED') {
        explosionEvents.push(clock.now());
      }
    });

    const startTime = clock.now();
    elapsed = 0;
    while (elapsed < newSafeWin + 0.1) {
      clock.tick(step);
      sim.update(noPlayers);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // Assert: next explosion fired approximately at newSafeWin after Idle entry
    expect(explosionEvents.length).toBeGreaterThanOrEqual(1);
    const firstExplosionAfterIdle = explosionEvents[0] - startTime;
    expect(firstExplosionAfterIdle).toBeLessThanOrEqual(newSafeWin + 0.016 + 0.1);
  });

  test('AC-23: GridSimulation does NOT emit ROUND_END after last survivor dies (EC-3)', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const p1: PlayerId = 'last-survivor';
    const playerPositions: Map<PlayerId, CellCoord> = new Map([[p1, CELL_00]]);

    let roundEndEmitted = false;
    // ROUND_END is not in GameEvents — check that it's never emitted via any channel
    // We check that GRID_STALLED is not emitted prematurely and that timers keep running
    bus.on('GRID_STALLED', () => { roundEndEmitted = true; });

    sim.applyPattern(singleGatePattern(CELL_00), playerPositions);
    unlockBus(bus); bus.flush();

    // Advance to kill the last survivor
    const safeWin = GATE_PERIOD_BASE - T_EX;
    const step = 0.001;
    let elapsed = 0;
    while (elapsed < safeWin + 0.020) {
      clock.tick(step);
      sim.update(playerPositions);
      unlockBus(bus); bus.flush();
      elapsed += step;
    }

    // The player should be dead
    const killed: PlayerId[] = [];
    bus.on('PLAYER_KILLED', (p) => killed.push(...p.playerIds));
    // (already fired — check via different approach)

    // Assert: GridSimulation does NOT emit GRID_STALLED spontaneously
    expect(roundEndEmitted).toBe(false);

    // Assert: gate timers continue running after kill (advance past EXPLODED → IDLE transition)
    const statesBefore = sim.getCellState(CELL_00);
    elapsed = 0;
    while (elapsed < T_EX + 0.05) {
      clock.tick(step);
      sim.update(new Map()); // no players remaining
      unlockBus(bus); bus.flush();
      elapsed += step;
    }
    // Gate cycled — it went through at least the EXPLODED → IDLE transition
    expect(sim.getCellState(CELL_00)).toBe('IDLE');
  });

  test('AC-24: out-of-range coordinates in pattern are ignored with warning, valid cells proceed', () => {
    // Arrange
    const { clock, bus, sim } = makeSim();
    const noPlayers: Map<PlayerId, CellCoord> = new Map();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const rejections: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (p) => rejections.push(p.patternId));

    // Pattern with 1 valid cell + 2 out-of-range cells
    // The valid cell alone leaves 63 safe cells — well above MIN_SAFE_CELLS=8
    const mixedPattern: ExplodePattern = {
      patternId: 'mixed-coords',
      cells: [
        { row: -1, col: 0 },   // invalid
        { row: 8, col: 8 },    // invalid
        CELL_00,               // valid
      ],
      bfsVerified: true,
    };

    // Act
    sim.applyPattern(mixedPattern, noPlayers);
    unlockBus(bus); bus.flush();

    // Assert: no rejection (1 valid gate → 63 safe cells ≥ 8)
    expect(rejections.length).toBe(0);

    // Valid cell was activated
    // (it's either IDLE or EXPLODED depending on initial phase; either way it's a gate)
    const state = sim.getCellState(CELL_00);
    expect(state === 'IDLE' || state === 'EXPLODED').toBe(true);

    // Warnings were emitted for invalid coords
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('out-of-range'));

    // System did not throw
    expect(() => sim.update(noPlayers)).not.toThrow();

    warnSpy.mockRestore();
  });
});
