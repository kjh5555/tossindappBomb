import {
  RoundManager,
  IRoundEscalation,
  ROUND_CLEAR_DISPLAY_DURATION,
  ROUND_TIME_LIMIT,
  GATE_PERIOD_BASE,
  placeGoalCell,
  RoundPhase,
} from '../../../src/features/round/RoundManager';
import { CellCoord, EscalationContext } from '../../../src/core/types/Domain';
import { IEventBus } from '../../../src/core/events/IEventBus';
import { GameEvents } from '../../../src/core/events/GameEvents';
import { IFrameClock } from '../../../src/core/time/IFrameClock';
import { IGridSimulation } from '../../../src/core/grid/IGridSimulation';

// ════════════════════════════════════════════════════════════════════════════
// Mock Implementations
// ════════════════════════════════════════════════════════════════════════════

class MockClock implements IFrameClock {
  private _simulatedTime = 0;
  private scheduled: Array<{ fn: () => void; dueTime: number }> = [];

  get simulatedTime(): number {
    return this._simulatedTime;
  }

  now(): number {
    return this._simulatedTime;
  }

  dt(): number {
    return 0; // Not used in RoundManager
  }

  schedule(fn: () => void, delaySecs: number): void {
    this.scheduled.push({ fn, dueTime: this._simulatedTime + delaySecs });
  }

  cancelSchedule(fn: () => void): void {
    this.scheduled = this.scheduled.filter((item) => item.fn !== fn);
  }

  tick(deltaSeconds: number): void {
    this._simulatedTime += deltaSeconds;
    const ready = this.scheduled.filter((item) => item.dueTime <= this._simulatedTime);
    this.scheduled = this.scheduled.filter((item) => item.dueTime > this._simulatedTime);
    ready.forEach((item) => item.fn());
  }

  reset(): void {
    this._simulatedTime = 0;
    this.scheduled = [];
  }
}

class TestEventBus implements IEventBus {
  private recorded: Array<{ key: string; payload: any }> = [];
  private handlers = new Map<string, Array<(e: any) => void>>();

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.recorded.push({ key: key as string, payload });
    const handlers = this.handlers.get(key as string);
    if (handlers) {
      handlers.forEach((h) => h(payload));
    }
  }

  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void {
    const k = key as string;
    if (!this.handlers.has(k)) this.handlers.set(k, []);
    this.handlers.get(k)!.push(handler);
  }

  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void {
    const k = key as string;
    const handlers = this.handlers.get(k);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }
  }

  flush(): void {
    // Synchronous test bus — no-op
  }

  getEmitted(): Array<{ key: string; payload: any }> {
    return this.recorded;
  }

  reset(): void {
    this.recorded = [];
  }
}

class MockGridSim implements IGridSimulation {
  private explosionTimes = new Map<string, number | null>();
  private gatePeriodLog: number[] = [];

  private key(cell: CellCoord): string {
    return `${cell.row},${cell.col}`;
  }

  setExplosionTime(cell: CellCoord, time: number | null): void {
    if (time === null) {
      this.explosionTimes.delete(this.key(cell));
    } else {
      this.explosionTimes.set(this.key(cell), time);
    }
  }

  nextExplosionTime(cell: CellCoord): number | null {
    return this.explosionTimes.get(this.key(cell)) ?? null;
  }

  setGatePeriod(seconds: number): void {
    this.gatePeriodLog.push(seconds);
  }

  getCellState(_cell: CellCoord): string {
    return 'IDLE';
  }

  applyPattern(_pattern: any): void {}

  getGatePeriodLog(): number[] {
    return this.gatePeriodLog;
  }

  reset(): void {
    this.explosionTimes.clear();
    this.gatePeriodLog = [];
  }
}

class MockEscalation implements IRoundEscalation {
  computeContext(roundNumber: number, seed: number): EscalationContext {
    return {
      roundNumber,
      gatePeriod: Math.max(1.4, GATE_PERIOD_BASE - (roundNumber - 1) * 0.05),
      tier: roundNumber <= 3 ? 1 : roundNumber <= 10 ? 2 : 3,
      tierWeights: { t1: 1, t2: 0, t3: 0 },
      stalledFallback: false,
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Test Setup
// ════════════════════════════════════════════════════════════════════════════

const PATH_CELLS: CellCoord[] = [
  { row: 0, col: 0 },
  { row: 1, col: 0 },
  { row: 2, col: 0 },
  { row: 3, col: 0 }, // N-2 (index 3)
  { row: 4, col: 0 }, // N-1 (index 4, last)
];

const TOTAL_PLAYERS = 6;
const TEST_SEED = 12345;

describe('RoundManager — Story-001: Round Lifecycle + Goal Cell Placement', () => {
  let clock: MockClock;
  let bus: TestEventBus;
  let gridSim: MockGridSim;
  let escalation: MockEscalation;
  let rm: RoundManager;

  beforeEach(() => {
    clock = new MockClock();
    bus = new TestEventBus();
    gridSim = new MockGridSim();
    escalation = new MockEscalation();

    rm = new RoundManager(clock, bus, escalation, gridSim, PATH_CELLS, TOTAL_PLAYERS, TEST_SEED);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AC-RM-01: startRound(N) emits ROUND_STARTED + GOAL_PLACED same flush
  // ══════════════════════════════════════════════════════════════════════════

  it('AC-RM-01: startRound emits ROUND_STARTED then GOAL_PLACED in the same synchronous call', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0); // N-1 safe

    rm.startRound(1);

    const emitted = bus.getEmitted();
    expect(emitted.length).toBe(2);
    expect(emitted[0].key).toBe('ROUND_STARTED');
    expect(emitted[1].key).toBe('GOAL_PLACED');
  });

  it('AC-RM-01: ROUND_STARTED payload contains correct roundNumber', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);

    rm.startRound(3);

    const startedPayload = bus.getEmitted()[0].payload;
    expect(startedPayload.roundNumber).toBe(3);
    expect(startedPayload.ctx).toBeDefined();
  });

  it('AC-RM-01: startRound while ROUND_ACTIVE is a no-op (guard)', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);
    bus.reset();

    rm.startRound(2); // Should be ignored — phase is ROUND_ACTIVE

    expect(bus.getEmitted().length).toBe(0);
    expect(rm.getRoundNumber()).toBe(1); // Round number unchanged
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AC-RM-02: goalCell = N-1 when nextExplosionTime(N-1) >= GATE_PERIOD_BASE
  // ══════════════════════════════════════════════════════════════════════════

  it('AC-RM-02: Goal Cell is N-1 when explosion time is 3.0 (>= 2.0)', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 3.0);

    rm.startRound(1);

    const goalPlaced = bus.getEmitted().find((e) => e.key === 'GOAL_PLACED')!;
    expect(goalPlaced.payload.cell).toEqual(PATH_CELLS[4]);
  });

  it('AC-RM-02: Goal Cell is N-1 when explosion time is exactly 2.0 (boundary)', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 2.0);

    rm.startRound(1);

    const goalPlaced = bus.getEmitted().find((e) => e.key === 'GOAL_PLACED')!;
    expect(goalPlaced.payload.cell).toEqual(PATH_CELLS[4]);
  });

  it('AC-RM-02: Goal Cell is N-1 when explosion time is null (cell not scheduled)', () => {
    // null means no explosion scheduled → N-1 is safe

    rm.startRound(1);

    const goalPlaced = bus.getEmitted().find((e) => e.key === 'GOAL_PLACED')!;
    expect(goalPlaced.payload.cell).toEqual(PATH_CELLS[4]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AC-RM-03: goalCell = N-2 when N-1 unsafe. EC-RM-1: no further fallback
  // ══════════════════════════════════════════════════════════════════════════

  it('AC-RM-03: Goal Cell falls back to N-2 when N-1 explosion time < 2.0', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 1.5); // N-1 unsafe

    rm.startRound(1);

    const goalPlaced = bus.getEmitted().find((e) => e.key === 'GOAL_PLACED')!;
    expect(goalPlaced.payload.cell).toEqual(PATH_CELLS[3]); // N-2
  });

  it('AC-RM-03 + EC-RM-1: Goal Cell stays at N-2 even if N-2 is also unsafe (no further fallback)', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 1.5); // N-1 unsafe
    gridSim.setExplosionTime(PATH_CELLS[3], 0.5); // N-2 also unsafe

    rm.startRound(1);

    const goalPlaced = bus.getEmitted().find((e) => e.key === 'GOAL_PLACED')!;
    expect(goalPlaced.payload.cell).toEqual(PATH_CELLS[3]); // Still N-2, NOT N-3
  });

  it('AC-RM-03: Goal Cell falls back with N-1 explosion at 1.99 (just below boundary)', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 1.99);

    rm.startRound(1);

    const goalPlaced = bus.getEmitted().find((e) => e.key === 'GOAL_PLACED')!;
    expect(goalPlaced.payload.cell).toEqual(PATH_CELLS[3]);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AC-RM-04: PLAYER_ARRIVED at goalCell in ROUND_ACTIVE → ROUND_CLEAR
  // ══════════════════════════════════════════════════════════════════════════

  it('AC-RM-04: PLAYER_ARRIVED at Goal Cell emits ROUND_CLEAR with correct roundNumber', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);
    bus.reset();

    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[4], timestamp: clock.now() });

    const roundClear = bus.getEmitted().find((e) => e.key === 'ROUND_CLEAR');
    expect(roundClear).toBeDefined();
    expect(roundClear!.payload.roundNumber).toBe(1);
  });

  it('AC-RM-04: PLAYER_ARRIVED at non-Goal Cell is ignored', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);
    bus.reset();

    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[0], timestamp: clock.now() });

    expect(bus.getEmitted().length).toBe(0);
  });

  it('AC-RM-04: PLAYER_ARRIVED before startRound (IDLE phase) is ignored', () => {
    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[4], timestamp: clock.now() });

    expect(bus.getEmitted().length).toBe(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AC-RM-06: ROUND_END emitted after exactly 1500ms
  // ══════════════════════════════════════════════════════════════════════════

  it('AC-RM-06: ROUND_END emitted after 1500ms following ROUND_CLEAR', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);
    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[4], timestamp: clock.now() });
    bus.reset();

    clock.tick(ROUND_CLEAR_DISPLAY_DURATION); // 1500ms

    const roundEnd = bus.getEmitted().find((e) => e.key === 'ROUND_END');
    expect(roundEnd).toBeDefined();
    expect(roundEnd!.payload.roundNumber).toBe(1);
  });

  it('AC-RM-06: ROUND_END NOT emitted before 1500ms (tick 1.4s)', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);
    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[4], timestamp: clock.now() });
    bus.reset();

    clock.tick(1.4); // Below 1500ms

    const roundEnd = bus.getEmitted().find((e) => e.key === 'ROUND_END');
    expect(roundEnd).toBeUndefined();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AC-TIE-01/02: Two simultaneous PLAYER_ARRIVED → ROUND_CLEAR emitted once
  // ══════════════════════════════════════════════════════════════════════════

  it('AC-TIE-01/02: Two PLAYER_ARRIVED at Goal Cell → ROUND_CLEAR emitted once only', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);
    bus.reset();

    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[4], timestamp: clock.now() });
    // Phase is now ROUND_CLEAR_DISPLAY — second arrival blocked by guard
    rm.onPlayerArrived({ playerId: 'p2', cell: PATH_CELLS[4], timestamp: clock.now() });

    const roundClears = bus.getEmitted().filter((e) => e.key === 'ROUND_CLEAR');
    expect(roundClears.length).toBe(1);
  });

  it('AC-TIE-01/02: Phase transitions to ROUND_CLEAR_DISPLAY after first arrival', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);
    rm.startRound(1);

    rm.onPlayerArrived({ playerId: 'p1', cell: PATH_CELLS[4], timestamp: clock.now() });

    expect(rm.getPhase()).toBe<RoundPhase>('ROUND_CLEAR_DISPLAY');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADR-0006 Exception 1: setGatePeriod called BEFORE ROUND_STARTED
  // ══════════════════════════════════════════════════════════════════════════

  it('ADR-0006: setGatePeriod is called before any ROUND_STARTED event is recorded', () => {
    gridSim.setExplosionTime(PATH_CELLS[4], 5.0);

    // Intercept: check gate period log was populated before emit
    let gatePeriodCallCountAtEmit = 0;
    const origEmit = bus.emit.bind(bus);
    (bus as any).emit = (key: any, payload: any) => {
      if (key === 'ROUND_STARTED') {
        gatePeriodCallCountAtEmit = gridSim.getGatePeriodLog().length;
      }
      origEmit(key, payload);
    };

    rm.startRound(1);

    expect(gatePeriodCallCountAtEmit).toBeGreaterThan(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Phase helper — placeGoalCell unit tests
  // ══════════════════════════════════════════════════════════════════════════

  describe('placeGoalCell (F-RM-1 helper)', () => {
    it('returns N-1 when nextExplosionTime returns null (no explosion scheduled)', () => {
      const result = placeGoalCell(PATH_CELLS, gridSim);
      expect(result).toEqual(PATH_CELLS[4]);
    });

    it('returns N-1 when explosion time >= GATE_PERIOD_BASE', () => {
      gridSim.setExplosionTime(PATH_CELLS[4], GATE_PERIOD_BASE + 0.1);
      const result = placeGoalCell(PATH_CELLS, gridSim);
      expect(result).toEqual(PATH_CELLS[4]);
    });

    it('returns N-2 when explosion time < GATE_PERIOD_BASE', () => {
      gridSim.setExplosionTime(PATH_CELLS[4], GATE_PERIOD_BASE - 0.1);
      const result = placeGoalCell(PATH_CELLS, gridSim);
      expect(result).toEqual(PATH_CELLS[3]);
    });
  });
});
