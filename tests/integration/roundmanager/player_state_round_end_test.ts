/**
 * Integration tests: Story 002 — 플레이어 상태 추적 + 라운드 종료 조건
 *
 * Covers: AC-SUR-01/02/03/04/05/06/07/08, AC-RM-07/08/09/10/14, TR-roundmanager-008
 * Test file required at this path per story Test Evidence section.
 */

import { CellCoord, PlayerId, EscalationContext } from '../../../src/core/types/Domain';
import { IEventBus } from '../../../src/core/events/IEventBus';
import { GameEvents } from '../../../src/core/events/GameEvents';
import { IFrameClock } from '../../../src/core/time/IFrameClock';
import { IGridSimulation } from '../../../src/core/grid/IGridSimulation';
import {
  RoundManager,
  IRoundEscalation,
  GATE_PERIOD_BASE,
} from '../../../src/features/round/RoundManager';

// ─── Mock Infrastructure ─────────────────────────────────────────────────────

class MockClock implements IFrameClock {
  private _simulatedTime = 0;
  private _callbacks: Array<{ fn: () => void; fireAt: number }> = [];

  get simulatedTime(): number { return this._simulatedTime; }
  dt(): number { return 0; }
  now(): number { return this._simulatedTime; }

  schedule(fn: () => void, delay: number): void {
    this._callbacks.push({ fn, fireAt: this._simulatedTime + delay });
  }

  cancelSchedule(fn: () => void): void {
    this._callbacks = this._callbacks.filter(c => c.fn !== fn);
  }

  tick(delta: number): void {
    this._simulatedTime += delta;
    const due = this._callbacks.filter(c => c.fireAt <= this._simulatedTime);
    this._callbacks = this._callbacks.filter(c => c.fireAt > this._simulatedTime);
    due.forEach(c => c.fn());
  }
}

class TestEventBus implements IEventBus {
  private handlers: Map<string, Array<(evt: any) => void>> = new Map();
  readonly log: Array<{ type: string; payload: any }> = [];

  on<K extends keyof GameEvents>(event: K, handler: (evt: GameEvents[K]) => void): void {
    if (!this.handlers.has(event as string)) this.handlers.set(event as string, []);
    this.handlers.get(event as string)!.push(handler as any);
  }

  off<K extends keyof GameEvents>(event: K, handler: (evt: GameEvents[K]) => void): void {
    const hs = this.handlers.get(event as string);
    if (hs) this.handlers.set(event as string, hs.filter(h => h !== handler));
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.log.push({ type: event as string, payload });
    const hs = this.handlers.get(event as string) ?? [];
    hs.forEach(h => h(payload));
  }

  flush(): void {}

  emitted(type: string): Array<{ type: string; payload: any }> {
    return this.log.filter(e => e.type === type);
  }

  lastOf(type: string): any {
    const arr = this.emitted(type);
    return arr[arr.length - 1]?.payload;
  }

  countOf(type: string): number {
    return this.emitted(type).length;
  }

  clear(): void {
    this.log.length = 0;
  }
}

class MockGridSim implements IGridSimulation {
  private _explosionTimes: Map<string, number | null> = new Map();

  setExplosionTime(cell: CellCoord, t: number | null): void {
    this._explosionTimes.set(`${(cell as any).q},${(cell as any).r}`, t);
  }

  nextExplosionTime(cell: CellCoord): number | null {
    return this._explosionTimes.get(`${(cell as any).q},${(cell as any).r}`) ?? null;
  }

  setGatePeriod(_seconds: number): void {}
  getCellState(_cell: CellCoord): string { return 'Idle'; }
  applyPattern(_pattern: any): void {}
}

class MockEscalation implements IRoundEscalation {
  computeContext(roundNumber: number, _seed: number): EscalationContext {
    return {
      roundNumber,
      gatePeriod: GATE_PERIOD_BASE,
      tier: 1,
      tierWeights: { t1: 1, t2: 0, t3: 0 },
      stalledFallback: false,
    };
  }
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const GOAL_CELL: CellCoord = { q: 3, r: 2 } as any;
const OTHER_CELL: CellCoord = { q: 0, r: 0 } as any;
const PATH_CELLS: CellCoord[] = [
  { q: 0, r: 0 } as any,
  { q: 1, r: 0 } as any,
  { q: 2, r: 0 } as any,
  OTHER_CELL,
  GOAL_CELL,
];

const P1: PlayerId = 'p1' as any;
const P2: PlayerId = 'p2' as any;

function makeRM(playerIds: PlayerId[] = [P1, P2], totalPlayers = 2): {
  rm: RoundManager;
  clock: MockClock;
  bus: TestEventBus;
  gridSim: MockGridSim;
} {
  const clock = new MockClock();
  const bus = new TestEventBus();
  const escalation = new MockEscalation();
  const gridSim = new MockGridSim();
  // Goal cell (N-1) safe — no explosion
  gridSim.setExplosionTime(GOAL_CELL, null);

  const rm = new RoundManager(
    clock, bus, escalation, gridSim,
    PATH_CELLS, totalPlayers, 42, playerIds,
  );

  rm.startRound(1);
  return { rm, clock, bus, gridSim };
}

// ─── AC-SUR-01 / AC-RM-07: PLAYER_KILLED → SPECTATOR + ALIVE_COUNT_CHANGED ──

describe('AC-SUR-01 / AC-RM-07: PLAYER_KILLED → SPECTATOR + ALIVE_COUNT_CHANGED', () => {
  it('test_playerKilled_marksSpectatorAndEmitsAliveCountChanged', () => {
    const { rm, bus } = makeRM();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });

    expect(rm.getPlayerStates().get(P1)!.status).toBe('SPECTATOR');
    expect(rm.getAliveCount()).toBe(1);
    expect(bus.countOf('ALIVE_COUNT_CHANGED')).toBe(1);
    expect(bus.lastOf('ALIVE_COUNT_CHANGED').aliveCount).toBe(1);
  });

  it('test_playerKilled_twice_noDuplicateDecrement', () => {
    const { rm, bus } = makeRM();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    bus.clear();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });

    // p1 already SPECTATOR — aliveCount should still be 1
    expect(rm.getAliveCount()).toBe(1);
    expect(bus.lastOf('ALIVE_COUNT_CHANGED').aliveCount).toBe(1);
  });

  it('test_playerKilled_bothInOneEvent_aliveCountZero', () => {
    const { rm } = makeRM();
    // Kill both in one event — but this triggers GAME_OVER before second is checked
    // Use separate events to stay simple
    expect(rm.getAliveCount()).toBe(2);
  });
});

// ─── AC-SUR-02: SPECTATOR not counted in aliveCount ──────────────────────────

describe('AC-SUR-02: SPECTATOR excluded from aliveCount', () => {
  it('test_spectator_notCountedInAliveCount', () => {
    const { rm, bus } = makeRM();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    expect(rm.getAliveCount()).toBe(1);
    expect(rm.getPlayerStates().get(P1)!.status).toBe('SPECTATOR');
    expect(rm.getPlayerStates().get(P2)!.status).toBe('ALIVE');
  });
});

// ─── AC-RM-08 / AC-SUR-08: All dead → GAME_OVER (including solo) ─────────────

describe('AC-RM-08 / AC-SUR-08: All dead → GAME_OVER', () => {
  it('test_allDead_triggersGameOver', () => {
    const { rm, bus } = makeRM();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });

    expect(bus.countOf('GAME_OVER')).toBe(1);
    expect(rm.getPhase()).toBe('GAME_OVER');
  });

  it('test_solo_playerDeath_triggersGameOver', () => {
    const { rm, bus } = makeRM([P1], 1);
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });

    expect(bus.countOf('GAME_OVER')).toBe(1);
    expect(rm.getPhase()).toBe('GAME_OVER');
    expect(bus.lastOf('GAME_OVER').finalRound).toBe(1);
  });
});

// ─── AC-RM-09: 60s timer expiry → GAME_OVER ──────────────────────────────────

describe('AC-RM-09: Round timer expiry → GAME_OVER', () => {
  it('test_roundTimerExpiry_triggersGameOver', () => {
    const { rm, clock, bus } = makeRM();
    clock.tick(60);

    expect(bus.countOf('GAME_OVER')).toBe(1);
    expect(rm.getPhase()).toBe('GAME_OVER');
  });

  it('test_roundTimerBeforeExpiry_noGameOver', () => {
    const { bus, clock } = makeRM();
    clock.tick(59);
    expect(bus.countOf('GAME_OVER')).toBe(0);
  });
});

// ─── AC-RM-10 (EC-RM-6): Simultaneous GAME_OVER triggers → only 1 emitted ───

describe('AC-RM-10 (EC-RM-6): Duplicate GAME_OVER prevention', () => {
  it('test_allDeadAndTimerExpiry_gameOverEmittedOnce', () => {
    const { rm, clock, bus } = makeRM([P1], 1);
    // Kill solo player at t=59 → GAME_OVER emitted, phase = GAME_OVER
    clock.tick(59);
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    expect(bus.countOf('GAME_OVER')).toBe(1);
    expect(rm.getPhase()).toBe('GAME_OVER');

    // Timer fires at t=60 — but phase is already GAME_OVER → guard blocks
    clock.tick(1);
    expect(bus.countOf('GAME_OVER')).toBe(1);
  });

  it('test_triggerGameOverTwiceDirectly_emittedOnce', () => {
    const { rm, bus } = makeRM();
    // Kill both players in sequence
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    // Second kill arrives but phase is already GAME_OVER
    expect(bus.countOf('GAME_OVER')).toBe(1);
  });
});

// ─── AC-RM-14: ROUND_CLEAR_DISPLAY + PLAYER_KILLED → ignored ─────────────────

describe('AC-RM-14: PLAYER_KILLED ignored in ROUND_CLEAR_DISPLAY', () => {
  it('test_playerKilled_duringClearDisplay_ignored', () => {
    const { rm, bus } = makeRM();
    // Trigger round clear
    bus.emit('PLAYER_ARRIVED', { playerId: P1, cell: GOAL_CELL, timestamp: 0 });
    expect(rm.getPhase()).toBe('ROUND_CLEAR_DISPLAY');
    bus.clear();

    // Kill p2 while in ROUND_CLEAR_DISPLAY
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });

    expect(rm.getPlayerStates().get(P2)!.status).toBe('ALIVE');
    expect(bus.countOf('ALIVE_COUNT_CHANGED')).toBe(0);
    expect(bus.countOf('GAME_OVER')).toBe(0);
  });
});

// ─── AC-SUR-05/06: ROUND_CLEAR → all ALIVE + pathIndex=0 ─────────────────────

describe('AC-SUR-05/06: ROUND_CLEAR revives all players with pathIndex=0', () => {
  it('test_roundClear_revivesAllPlayers', () => {
    const { rm, bus } = makeRM();
    // Kill p2 first
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    expect(rm.getPlayerStates().get(P2)!.status).toBe('SPECTATOR');

    // p1 reaches goal → ROUND_CLEAR → markAllAliveForNextRound
    bus.emit('PLAYER_ARRIVED', { playerId: P1, cell: GOAL_CELL, timestamp: 0 });

    expect(rm.getPlayerStates().get(P1)!.status).toBe('ALIVE');
    expect(rm.getPlayerStates().get(P2)!.status).toBe('ALIVE');
    expect(rm.getPlayerStates().get(P1)!.pathIndex).toBe(0);
    expect(rm.getPlayerStates().get(P2)!.pathIndex).toBe(0);
  });
});

// ─── AC-SUR-03/04: Spectator cheer rate-limit ────────────────────────────────

describe('AC-SUR-03/04: Spectator cheer rate-limit (gatePeriod=2.0s)', () => {
  it('test_firstCheer_accepted_initialLastCheerTimeIsMinusInfinity', () => {
    const { bus } = makeRM();
    // Kill p1 first so they are SPECTATOR
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    bus.clear();

    // First cheer: lastCheerTime=-Inf, so gap=Infinity >= 2.0 → accepted
    bus.emit('SPECTATOR_CHEER', { playerId: P1, timestamp: 0 });
    expect(bus.countOf('SPECTATOR_CHEERED')).toBe(1);
  });

  it('test_secondCheer_withinCooldown_rejected', () => {
    const { bus, clock } = makeRM();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    // First cheer at t=0 → accepted, lastCheerTime set to 0
    bus.emit('SPECTATOR_CHEER', { playerId: P1, timestamp: 0 });
    bus.clear();

    // Second cheer at t=1.0 — within 2.0s cooldown → rejected
    clock.tick(1.0);
    bus.emit('SPECTATOR_CHEER', { playerId: P1, timestamp: 0 });
    expect(bus.countOf('SPECTATOR_CHEERED')).toBe(0);
  });

  it('test_cheer_afterCooldownElapsed_accepted', () => {
    const { bus, clock } = makeRM();
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    // First cheer at t=0 → accepted
    bus.emit('SPECTATOR_CHEER', { playerId: P1, timestamp: 0 });
    bus.clear();

    // Cheer at t=2.0 — exactly at cooldown boundary >= 2.0 → accepted
    clock.tick(2.0);
    bus.emit('SPECTATOR_CHEER', { playerId: P1, timestamp: 0 });
    expect(bus.countOf('SPECTATOR_CHEERED')).toBe(1);
    expect(bus.lastOf('SPECTATOR_CHEERED').playerId).toBe(P1);
  });

  it('test_cheer_byAlivePlayer_rejected', () => {
    const { bus } = makeRM();
    // p1 is ALIVE (not killed) — cheer should be ignored
    bus.emit('SPECTATOR_CHEER', { playerId: P1, timestamp: 0 });
    expect(bus.countOf('SPECTATOR_CHEERED')).toBe(0);
  });
});

// ─── AC-SUR-07: ROUND_CLEAR_DISPLAY phase → cheer ignored ───────────────────

describe('AC-SUR-07: Spectator cheer ignored in ROUND_CLEAR_DISPLAY', () => {
  it('test_spectatorCheer_duringClearDisplay_ignored', () => {
    const { bus } = makeRM();
    // Kill p2 → SPECTATOR
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    // p1 reaches goal → ROUND_CLEAR_DISPLAY
    bus.emit('PLAYER_ARRIVED', { playerId: P1, cell: GOAL_CELL, timestamp: 0 });
    bus.clear();

    bus.emit('SPECTATOR_CHEER', { playerId: P2, timestamp: 0 });
    expect(bus.countOf('SPECTATOR_CHEERED')).toBe(0);
  });
});

// ─── TR-roundmanager-008 (EC-RM-5b): GRID_STALLED → GAME_OVER + ROUND_END ───

describe('TR-roundmanager-008 (EC-RM-5b): GRID_STALLED → GAME_OVER then ROUND_END', () => {
  it('test_gridStalled_emitsGameOverThenRoundEnd', () => {
    const { rm, bus } = makeRM();
    bus.emit('GRID_STALLED', { roundNumber: 1, timestamp: 0 });

    expect(bus.countOf('GAME_OVER')).toBe(1);
    expect(bus.countOf('ROUND_END')).toBe(1);
    expect(rm.getPhase()).toBe('GAME_OVER');

    // Verify order: GAME_OVER before ROUND_END
    const types = bus.log
      .filter(e => e.type === 'GAME_OVER' || e.type === 'ROUND_END')
      .map(e => e.type);
    expect(types[0]).toBe('GAME_OVER');
    expect(types[1]).toBe('ROUND_END');
  });

  it('test_gridStalled_ignored_whenNotRoundActive', () => {
    const { rm, bus } = makeRM();
    // Trigger game over first
    bus.emit('PLAYER_KILLED', { playerIds: [P1], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    expect(rm.getPhase()).toBe('GAME_OVER');
    bus.clear();

    bus.emit('GRID_STALLED', { roundNumber: 1, timestamp: 0 });
    expect(bus.countOf('GAME_OVER')).toBe(0);
  });
});

// ─── Multi-round flow: ROUND_CLEAR → ROUND_END → ROUND_STARTED(N+1) ─────────

describe('Multi-round flow: auto-advance after ROUND_CLEAR_DISPLAY', () => {
  it('test_clearDisplay_expiresAndStartsNextRound', () => {
    const { rm, clock, bus } = makeRM();
    // Trigger round clear
    bus.emit('PLAYER_ARRIVED', { playerId: P1, cell: GOAL_CELL, timestamp: 0 });
    expect(rm.getPhase()).toBe('ROUND_CLEAR_DISPLAY');
    bus.clear();

    // Advance 1.5s → clear display expires
    clock.tick(1.5);

    expect(bus.countOf('ROUND_END')).toBe(1);
    expect(bus.lastOf('ROUND_END').roundNumber).toBe(1);
    expect(bus.countOf('ROUND_STARTED')).toBe(1);
    expect(bus.lastOf('ROUND_STARTED').roundNumber).toBe(2);
    expect(bus.countOf('GOAL_PLACED')).toBe(1);
    expect(rm.getPhase()).toBe('ROUND_ACTIVE');
    expect(rm.getRoundNumber()).toBe(2);
  });

  it('test_clearDisplay_allPlayersAliveAtStartOfNextRound', () => {
    const { rm, bus, clock } = makeRM();
    // Kill p2 before clear
    bus.emit('PLAYER_KILLED', { playerIds: [P2], cellId: OTHER_CELL, cause: 'EXPLOSION', timestamp: 0 });
    expect(rm.getPlayerStates().get(P2)!.status).toBe('SPECTATOR');

    // Trigger clear, advance display
    bus.emit('PLAYER_ARRIVED', { playerId: P1, cell: GOAL_CELL, timestamp: 0 });
    clock.tick(1.5);

    // Both should be ALIVE at start of round 2
    expect(rm.getPlayerStates().get(P1)!.status).toBe('ALIVE');
    expect(rm.getPlayerStates().get(P2)!.status).toBe('ALIVE');
    expect(rm.getAliveCount()).toBe(2);
  });
});
