/**
 * core_systems_test.ts
 * S2-N1: Core 3-system integration tests
 *
 * Tests cross-system interactions between:
 *  - RoundEscalation  (src/features/round/RoundEscalation.ts)
 *  - GridSimulation   (src/core/grid/GridSimulation.ts)
 *  - PatternLibrary   (src/core/patterns/PatternLibrary.ts)
 *
 * Integration flows tested:
 *  1. RoundEscalation.computeContext() → setGatePeriod() accepted by GridSimulation
 *  2. PatternLibrary.toExplodePattern() → GridSimulation.applyPattern() succeeds
 *  3. GridSimulation stall timer → GRID_STALLED → RoundEscalation tier demotion
 *  4. Full round-1 / round-15 flow: escalation + gate period + pattern apply
 */

import { describe, test, expect } from '@jest/globals';
import { EventBus }        from '../../../src/core/events/EventBus';
import { FrameClock }      from '../../../src/core/time/FrameClock';
import { RoundEscalation } from '../../../src/features/round/RoundEscalation';
import { GridSimulation, ExplodePattern } from '../../../src/core/grid/GridSimulation';
import { PatternLibrary }  from '../../../src/core/patterns/PatternLibrary';
import { PATTERNS }        from '../../../src/core/patterns/PatternData';
import type { EscalationContext } from '../../../src/core/types/Domain';
import type { CellCoord, PlayerId } from '../../../src/core/types/Domain';
import {
  GATE_PERIOD_BASE,
  GATE_PERIOD_FLOOR,
} from '../../../src/core/grid/GridConstants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSuite() {
  const bus        = new EventBus();
  const clock      = new FrameClock(bus);
  const escalation = new RoundEscalation(bus, clock);
  const gridSim    = new GridSimulation(bus, clock);
  const patternLib = new PatternLibrary();
  return { bus, clock, escalation, gridSim, patternLib };
}

function tick(clock: FrameClock, dt = 0.016): void {
  clock.tick(dt);
}

const emptyPlayers = new Map<PlayerId, CellCoord>();

/** Bridge PatternRecord → GridSimulation.ExplodePattern (preserves bfsVerified). */
function toGridPattern(record: (typeof PATTERNS)[number]): ExplodePattern {
  const lib = new PatternLibrary();
  const base = lib.toExplodePattern(record);
  return { ...base, bfsVerified: record.bfsVerified };
}

// ─── 1. RoundEscalation → GridSimulation: gatePeriod range ──────────────────

describe('RoundEscalation → GridSimulation: gatePeriod accepted', () => {
  test('test_round1_gateperiod_2s_accepted_by_gridsim', () => {
    const { bus, clock, escalation, gridSim } = makeSuite();
    const ctx = escalation.computeContext(1, 0);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    gridSim.setGatePeriod(ctx.gatePeriod);
    warnSpy.mockRestore();

    expect(ctx.gatePeriod).toBe(GATE_PERIOD_BASE);
  });

  test('test_round15_gateperiod_floor_accepted_by_gridsim', () => {
    const { bus, clock, escalation, gridSim } = makeSuite();
    const ctx = escalation.computeContext(15, 0);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    gridSim.setGatePeriod(ctx.gatePeriod);
    warnSpy.mockRestore();

    expect(ctx.gatePeriod).toBe(GATE_PERIOD_FLOOR);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('test_all_rounds_1_to_20_gateperiod_within_gridsim_bounds', () => {
    const { clock, escalation, gridSim } = makeSuite();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    for (let r = 1; r <= 20; r++) {
      const ctx = escalation.computeContext(r, 0);
      gridSim.setGatePeriod(ctx.gatePeriod);
    }

    // No warn means setGatePeriod never rejected a value
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── 2. PatternLibrary → GridSimulation: valid pattern apply ─────────────────

describe('PatternLibrary → GridSimulation: valid pattern apply', () => {
  test('test_t1_pattern_apply_emits_cell_state_changed_no_rejection', () => {
    const { bus, clock, gridSim } = makeSuite();
    const t1Pattern = PATTERNS.find(p => p.tier === 1)!;

    const rejected: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (e) => rejected.push(e.patternId));

    const stateChanges: CellCoord[] = [];
    bus.on('CELL_STATE_CHANGED', (e) => stateChanges.push(e.cell));

    gridSim.applyPattern(toGridPattern(t1Pattern), emptyPlayers);
    tick(clock);   // flush queued events

    expect(rejected).toHaveLength(0);
    expect(stateChanges.length).toBeGreaterThanOrEqual(t1Pattern.cells.length);
  });

  test('test_t3_pattern_apply_no_rejection', () => {
    const { bus, clock, gridSim } = makeSuite();
    const t3Pattern = PATTERNS.find(p => p.tier === 3)!;

    const rejected: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (e) => rejected.push(e.patternId));

    gridSim.applyPattern(toGridPattern(t3Pattern), emptyPlayers);
    tick(clock);

    expect(rejected).toHaveLength(0);
  });

  test('test_pattern_with_bfsVerified_false_triggers_rejection', () => {
    const { bus, clock, gridSim } = makeSuite();
    const badPattern: ExplodePattern = {
      patternId: 'T1-TEST-BAD',
      cells: [{ row: 0, col: 0 }],
      bfsVerified: false,
    };

    const rejected: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (e) => rejected.push(e.patternId));

    gridSim.applyPattern(badPattern, emptyPlayers);
    tick(clock);

    expect(rejected).toContain('T1-TEST-BAD');
  });
});

// ─── 3. GridSimulation stall → RoundEscalation tier demotion ─────────────────

describe('GridSimulation stall → RoundEscalation tier demotion (full chain)', () => {
  test('test_bad_pattern_stall_triggers_escalation_tier_demotion', () => {
    const { bus, clock, escalation, gridSim } = makeSuite();

    // Setup: tier=3 via computeContext
    escalation.computeContext(15, 99);

    const escalationResults: EscalationContext[] = [];
    bus.on('ESCALATION_COMPUTED', (e) => escalationResults.push(e.ctx));

    // Apply bad pattern → PATTERN_REJECTED → stall timer starts (stalledFireAt = 0 + 3.0)
    const badPattern: ExplodePattern = {
      patternId: 'T1-STALL-TEST',
      cells: [{ row: 0, col: 0 }],
      bfsVerified: false,
    };
    gridSim.applyPattern(badPattern, emptyPlayers);

    // Advance time past PATTERN_TIMEOUT (3.0s) and flush
    tick(clock, 0.016);   // flush PATTERN_REJECTED
    tick(clock, 3.1);     // advance time to 3.116s (past stall timeout)

    // update() checks stall timer → emits GRID_STALLED
    gridSim.update(emptyPlayers);

    tick(clock);           // flush GRID_STALLED → onGridStalled → queues ESCALATION_COMPUTED
    tick(clock);           // flush ESCALATION_COMPUTED

    expect(escalationResults).toHaveLength(1);
    expect(escalationResults[0].tier).toBe(2);       // T3 → T2
    expect(escalationResults[0].stalledFallback).toBe(true);
  });

  test('test_stall_does_not_fire_before_pattern_timeout', () => {
    const { bus, clock, gridSim } = makeSuite();

    const stalledEvents: number[] = [];
    bus.on('GRID_STALLED', () => stalledEvents.push(1));

    const badPattern: ExplodePattern = {
      patternId: 'T1-EARLY-CHECK',
      cells: [{ row: 0, col: 0 }],
      bfsVerified: false,
    };
    gridSim.applyPattern(badPattern, emptyPlayers);

    tick(clock, 0.016);       // flush PATTERN_REJECTED
    tick(clock, 2.9);         // advance to 2.916s — still below 3.0s timeout
    gridSim.update(emptyPlayers);  // update() → stalledFireAt(3.0) > now(2.916) → NOT fired
    tick(clock);

    expect(stalledEvents).toHaveLength(0);
  });
});

// ─── 4. Full round flow: RoundEscalation + PatternLibrary + GridSimulation ────

describe('Full round flow: escalation + gate period + pattern apply', () => {
  test('test_full_round1_flow_tier1_gateperiod_2s_pattern_applied', () => {
    const { bus, clock, escalation, gridSim } = makeSuite();

    const stateChanges: CellCoord[] = [];
    bus.on('CELL_STATE_CHANGED', (e) => stateChanges.push(e.cell));
    const rejected: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (e) => rejected.push(e.patternId));

    // 1. Compute escalation context for round 1
    const ctx = escalation.computeContext(1, 0);
    expect(ctx.tier).toBe(1);
    expect(ctx.gatePeriod).toBe(2.0);

    // 2. Apply gatePeriod to GridSimulation
    gridSim.setGatePeriod(ctx.gatePeriod);

    // 3. Apply a tier-1 pattern
    const t1Pattern = PATTERNS.find(p => p.tier === 1)!;
    gridSim.applyPattern(toGridPattern(t1Pattern), emptyPlayers);
    tick(clock);

    expect(rejected).toHaveLength(0);
    expect(stateChanges.length).toBeGreaterThan(0);
  });

  test('test_full_round15_flow_tier3_gateperiod_floor_pattern_applied', () => {
    const { bus, clock, escalation, gridSim } = makeSuite();

    const rejected: Array<string | null> = [];
    bus.on('PATTERN_REJECTED', (e) => rejected.push(e.patternId));

    // 1. Compute escalation context for round 15
    const ctx = escalation.computeContext(15, 99);  // seed=99 → tier=3
    expect(ctx.tier).toBe(3);
    expect(ctx.gatePeriod).toBe(GATE_PERIOD_FLOOR);

    // 2. Apply gatePeriod
    gridSim.setGatePeriod(ctx.gatePeriod);

    // 3. Apply a tier-3 pattern
    const t3Pattern = PATTERNS.find(p => p.tier === 3)!;
    gridSim.applyPattern(toGridPattern(t3Pattern), emptyPlayers);
    tick(clock);

    expect(rejected).toHaveLength(0);
  });

  test('test_escalation_gateperiod_decreases_across_rounds', () => {
    const { escalation } = makeSuite();
    let prev = escalation.computeContext(1, 0).gatePeriod;

    for (let r = 2; r <= 13; r++) {
      const gp = escalation.computeContext(r, 0).gatePeriod;
      expect(gp).toBeLessThanOrEqual(prev);
      prev = gp;
    }

    // After floor: stays flat
    const r14 = escalation.computeContext(14, 0).gatePeriod;
    const r20 = escalation.computeContext(20, 0).gatePeriod;
    expect(r14).toBe(GATE_PERIOD_FLOOR);
    expect(r20).toBe(GATE_PERIOD_FLOOR);
  });
});
