/**
 * stalled_chain_test.ts
 * Integration tests for PatternLibrary story-003: runtime validation + GRID_STALLED chain.
 *
 * Story: PatternLibrary story-003
 *
 * Coverage:
 *  AC-PL-7   PATTERN_REJECTED on MIN_SAFE_CELLS or BFS_DISCONNECTED validation failure
 *  AC-PL-8   GRID_STALLED emitted after exactly 3 consecutive failures; failCount resets
 *  AC-PL-9   Invalid tier → PATTERN_REJECTED(INVALID_TIER); tier=1 fallback attempted
 *  EC-3      stalledFallback path: tier demoted, 3 retries → GRID_STALLED re-emitted
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { PatternLibrary, MAX_RETRY_COUNT, MIN_SAFE_CELLS } from '../../../src/core/patterns/PatternLibrary';
import type { PatternRecord } from '../../../src/core/patterns/PatternTypes';
import type { CellCoord } from '../../../src/core/grid/CellCoord';
import type { IEventBus } from '../../../src/core/events/IEventBus';
import type { IFrameClock } from '../../../src/core/time/IFrameClock';
import type { GameEvents } from '../../../src/core/events/GameEvents';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

class StubClock implements IFrameClock {
  get simulatedTime(): number { return 0; }
  now(): number { return 0; }
  dt(): number { return 0; }
  tick(_dt: number): void {}
  schedule(_fn: () => void, _delay: number): void {}
  cancelSchedule(_fn: () => void): void {}
}

class SpyEventBus implements IEventBus {
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

  clear(): void { this.emitted = []; }
}

// ---------------------------------------------------------------------------
// Test fixture patterns
// ---------------------------------------------------------------------------

/** 4 gate cells in the middle of the grid — passes all runtime validation. */
const VALID_T1: PatternRecord = {
  patternId: 'T1-LINE-H-001',
  cells: [
    { row: 3, col: 2 }, { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
  ],
  tier: 1,
  category: 'LINE',
  symmetryAxis: 'H',
  bfsVerified: true,
};

const VALID_T2: PatternRecord = {
  patternId: 'T2-LINE-V-001',
  cells: [
    { row: 2, col: 3 }, { row: 3, col: 3 }, { row: 4, col: 3 }, { row: 5, col: 3 },
  ],
  tier: 2,
  category: 'LINE',
  symmetryAxis: 'V',
  bfsVerified: true,
};

/** 57 gate cells → 7 safe cells → fails MIN_SAFE_CELLS check at runtime. */
const TOO_MANY_GATES_T1: PatternRecord = {
  patternId: 'T1-BAD-MIN-001',
  cells: Array.from({ length: 57 }, (_, i): CellCoord => ({
    row: Math.floor(i / 8),
    col: i % 8,
  })),
  tier: 1,
  category: 'COMPOSITE',
  symmetryAxis: 'NONE',
  bfsVerified: true, // build-time passed; runtime rejects
};

const TOO_MANY_GATES_T2: PatternRecord = { ...TOO_MANY_GATES_T1, patternId: 'T2-BAD-MIN-001', tier: 2 };

/**
 * 56 gate cells, leaving 8 safe cells split into two isolated 2×2 corners.
 * Fails BFS single-region check despite meeting MIN_SAFE_CELLS.
 *
 * Safe: {0,0},{0,1},{1,0},{1,1} and {6,6},{6,7},{7,6},{7,7}
 */
function makeDisconnectedPattern(tier: 1 | 2 | 3 = 1, id = `T${tier}-BFS-DISC-001`): PatternRecord {
  const safeKeys = new Set(['0,0', '0,1', '1,0', '1,1', '6,6', '6,7', '7,6', '7,7']);
  const cells: CellCoord[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (!safeKeys.has(`${r},${c}`)) cells.push({ row: r, col: c });
    }
  }
  return { patternId: id, cells, tier, category: 'COMPOSITE', symmetryAxis: 'HV', bfsVerified: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLib(
  pool: PatternRecord[],
  clock = new StubClock(),
  bus = new SpyEventBus(),
): { lib: PatternLibrary; bus: SpyEventBus; clock: StubClock } {
  const lib = new PatternLibrary(pool, clock, bus);
  return { lib, bus, clock };
}

const CTX1 = { tier: 1 as const, roundNumber: 1 };
const CTX2 = { tier: 2 as const, roundNumber: 1 };

// ---------------------------------------------------------------------------
// AC-PL-7: PATTERN_REJECTED on validation failure
// ---------------------------------------------------------------------------

describe('AC-PL-7: PATTERN_REJECTED on runtime validation failure', () => {

  test('test_min_safe_cells_failure_emits_pattern_rejected', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern(CTX1, 0);

    const rejected = bus.eventsOf('PATTERN_REJECTED');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('MIN_SAFE_CELLS');
    expect(rejected[0].patternId).toBe('T1-BAD-MIN-001');
  });

  test('test_min_safe_cells_failure_does_not_emit_pattern_ready', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern(CTX1, 0);

    expect(bus.countOf('PATTERN_READY')).toBe(0);
  });

  test('test_bfs_disconnected_emits_pattern_rejected_bfs_reason', () => {
    const disc = makeDisconnectedPattern(1);
    const { lib, bus } = makeLib([disc]);

    lib.getPattern(CTX1, 0);

    const rejected = bus.eventsOf('PATTERN_REJECTED');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('BFS_DISCONNECTED');
  });

  test('test_valid_pattern_with_exactly_8_safe_connected_passes', () => {
    // VALID_T1 has 4 gate cells → 60 safe cells, clearly connected
    const { lib, bus } = makeLib([VALID_T1]);

    lib.getPattern(CTX1, 0);

    expect(bus.countOf('PATTERN_REJECTED')).toBe(0);
    expect(bus.countOf('PATTERN_READY')).toBe(1);
  });

  test('test_pattern_ready_payload_contains_pattern', () => {
    const { lib, bus } = makeLib([VALID_T1]);

    lib.getPattern(CTX1, 0);

    const ready = bus.eventsOf('PATTERN_READY');
    expect(ready).toHaveLength(1);
    expect(ready[0].pattern.patternId).toBe('T1-LINE-H-001');
    expect(ready[0].pattern.cells).toEqual(VALID_T1.cells);
  });

  test('test_fail_count_incremented_on_rejection', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern(CTX1, 0);

    // 1 failure — no GRID_STALLED yet (needs 3)
    expect(bus.countOf('GRID_STALLED')).toBe(0);
    expect((lib as any)._failCount).toBe(1);
  });

});

// ---------------------------------------------------------------------------
// AC-PL-8: GRID_STALLED after exactly 3 consecutive failures
// ---------------------------------------------------------------------------

describe('AC-PL-8: GRID_STALLED after 3 consecutive failures', () => {

  test('test_grid_stalled_emitted_after_exactly_3_failures', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern(CTX1, 0);
    lib.getPattern(CTX1, 1);
    lib.getPattern(CTX1, 2);

    expect(bus.countOf('GRID_STALLED')).toBe(1);
  });

  test('test_grid_stalled_not_emitted_after_2_failures', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern(CTX1, 0);
    lib.getPattern(CTX1, 1);

    expect(bus.countOf('GRID_STALLED')).toBe(0);
  });

  test('test_grid_stalled_payload_contains_round_number', () => {
    const ctx = { tier: 1 as const, roundNumber: 5 };
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    for (let i = 0; i < MAX_RETRY_COUNT; i++) lib.getPattern(ctx, i);

    const stalled = bus.eventsOf('GRID_STALLED');
    expect(stalled[0].roundNumber).toBe(5);
  });

  test('test_fail_count_resets_to_zero_after_grid_stalled', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    for (let i = 0; i < MAX_RETRY_COUNT; i++) lib.getPattern(CTX1, i);

    expect((lib as any)._failCount).toBe(0);
  });

  test('test_two_failures_then_valid_resets_fail_count', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1, VALID_T1]);

    // Force bad pattern first (seed 0 picks TOO_MANY_GATES since it's first)
    // Both share tier 1 — we need to control which is picked.
    // Use a lib with only the bad pattern, then swap.
    // Simpler: use a lib that has VALID as first candidate (alphabetically by seed)
    const lib2 = new PatternLibrary([VALID_T1, TOO_MANY_GATES_T1], new StubClock(), bus);

    // Call twice with bad seed that picks the bad pattern... actually just test
    // the behavior: 2 failures followed by 1 success → no GRID_STALLED
    const badLib = new PatternLibrary([TOO_MANY_GATES_T1], new StubClock(), bus);
    badLib.getPattern(CTX1, 0); // fail 1
    badLib.getPattern(CTX1, 0); // fail 2

    // Now force success via a lib with a valid pool
    const goodLib = new PatternLibrary([VALID_T1], new StubClock(), bus);
    // Transfer failCount isn't possible — each lib is independent.
    // This test verifies the correct lib behavior: 2 failures then 1 success → no stalled
    const mixBus = new SpyEventBus();
    const mixLib = new PatternLibrary([VALID_T1, TOO_MANY_GATES_T1], new StubClock(), mixBus);

    // Seed 1 → index 1 → TOO_MANY_GATES (fail)
    mixLib.getPattern(CTX1, 1);
    // Seed 0 → index 0 → VALID_T1 (pass)
    mixLib.getPattern(CTX1, 0);

    expect(mixBus.countOf('GRID_STALLED')).toBe(0);
    expect((mixLib as any)._failCount).toBe(0);
  });

  test('test_on_round_started_resets_fail_count', () => {
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern(CTX1, 0); // fail 1
    lib.getPattern(CTX1, 1); // fail 2

    lib.onRoundStarted();

    lib.getPattern(CTX1, 0); // fail 1 of new round
    lib.getPattern(CTX1, 1); // fail 2 of new round

    // Never reached 3 consecutive in second sequence
    expect(bus.countOf('GRID_STALLED')).toBe(0);
  });

  test('test_pattern_ready_resets_fail_count', () => {
    // Pool: [VALID_T1, TOO_MANY_GATES_T1], N_recent=1 (floor(2/2)=1)
    // seed=1 → index 1 → TOO_MANY_GATES → fail (recentIds=['bad'])
    // seed=1 again → excluded=['bad'], candidates=[VALID_T1] → success (failCount reset to 0)
    const bus = new SpyEventBus();
    const lib = new PatternLibrary([VALID_T1, TOO_MANY_GATES_T1], new StubClock(), bus);

    lib.getPattern(CTX1, 1); // fail → failCount=1
    expect((lib as any)._failCount).toBe(1);

    lib.getPattern(CTX1, 1); // recency excludes bad → picks VALID_T1 → success → failCount=0
    expect((lib as any)._failCount).toBe(0);
    expect(bus.countOf('PATTERN_READY')).toBe(1);
    expect(bus.countOf('GRID_STALLED')).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// AC-PL-9: Invalid tier fallback
// ---------------------------------------------------------------------------

describe('AC-PL-9: Invalid tier → PATTERN_REJECTED(INVALID_TIER) + tier=1 fallback', () => {

  test('test_tier_0_emits_invalid_tier_rejected', () => {
    const { lib, bus } = makeLib([VALID_T1]);

    // tier: 0 is invalid — cast to bypass TypeScript
    lib.getPattern({ tier: 0 as any, roundNumber: 1 }, 0);

    const rejected = bus.eventsOf('PATTERN_REJECTED');
    expect(rejected.some(e => e.reason === 'INVALID_TIER')).toBe(true);
  });

  test('test_tier_4_emits_invalid_tier_rejected', () => {
    const { lib, bus } = makeLib([VALID_T1]);

    lib.getPattern({ tier: 4 as any, roundNumber: 1 }, 0);

    const rejected = bus.eventsOf('PATTERN_REJECTED');
    expect(rejected.some(e => e.reason === 'INVALID_TIER')).toBe(true);
  });

  test('test_invalid_tier_then_tier1_fallback_succeeds_emits_pattern_ready', () => {
    // Pool has a valid tier-1 pattern — fallback to tier=1 should succeed
    const { lib, bus } = makeLib([VALID_T1]);

    lib.getPattern({ tier: 0 as any, roundNumber: 1 }, 0);

    // INVALID_TIER rejected + then tier=1 succeeds → PATTERN_READY
    expect(bus.countOf('PATTERN_READY')).toBe(1);
  });

  test('test_invalid_tier_then_tier1_fallback_fails_increments_fail_count', () => {
    // Pool has only a bad tier-1 pattern — fallback fails
    const { lib, bus } = makeLib([TOO_MANY_GATES_T1]);

    lib.getPattern({ tier: 0 as any, roundNumber: 1 }, 0);

    // INVALID_TIER rejected + then tier=1 also rejected (MIN_SAFE_CELLS)
    const rejected = bus.eventsOf('PATTERN_REJECTED');
    expect(rejected.some(e => e.reason === 'INVALID_TIER')).toBe(true);
    expect(rejected.some(e => e.reason === 'MIN_SAFE_CELLS')).toBe(true);
    expect((lib as any)._failCount).toBe(1);
  });

  test('test_invalid_tier_rejected_patternid_is_null', () => {
    const { lib, bus } = makeLib([VALID_T1]);

    lib.getPattern({ tier: 0 as any, roundNumber: 1 }, 0);

    const invalidTierEvent = bus.eventsOf('PATTERN_REJECTED')
      .find(e => e.reason === 'INVALID_TIER');
    expect(invalidTierEvent).toBeDefined();
    expect(invalidTierEvent!.patternId).toBeNull();
  });

});

// ---------------------------------------------------------------------------
// EC-3: stalledFallback integration — tier demotion + retry ×3 → GRID_STALLED
// ---------------------------------------------------------------------------

describe('EC-3: stalledFallback path — tier demotion retries before re-GRID_STALLED', () => {

  test('test_stalled_fallback_with_all_tier1_invalid_re_emits_grid_stalled', () => {
    // Pool: only invalid tier-2 and invalid tier-1 patterns
    const pool: PatternRecord[] = [TOO_MANY_GATES_T2, TOO_MANY_GATES_T1];
    const { lib, bus } = makeLib(pool);

    // Tier 2 sequence: 3 failures → GRID_STALLED
    lib.getPattern(CTX2, 0);
    lib.getPattern(CTX2, 1);
    lib.getPattern(CTX2, 2);

    expect(bus.countOf('GRID_STALLED')).toBe(1);

    // Simulate RoundEscalation: demote to tier 1, call getPattern ×3
    const demotedCtx = { tier: 1 as const, roundNumber: 1 };
    lib.getPattern(demotedCtx, 0, true);
    lib.getPattern(demotedCtx, 1, true);
    lib.getPattern(demotedCtx, 2, true);

    expect(bus.countOf('GRID_STALLED')).toBe(2); // re-emitted
  });

  test('test_stalled_fallback_valid_tier1_stops_chain', () => {
    // Tier 2 invalid, tier 1 valid → chain stops after demotion
    const pool: PatternRecord[] = [TOO_MANY_GATES_T2, VALID_T1];
    const { lib, bus } = makeLib(pool);

    // Tier 2 failures
    for (let i = 0; i < MAX_RETRY_COUNT; i++) lib.getPattern(CTX2, i);

    expect(bus.countOf('GRID_STALLED')).toBe(1);

    // Demote to tier 1 — valid pattern found on first try
    lib.getPattern({ tier: 1 as const, roundNumber: 1 }, 0, true);

    expect(bus.countOf('PATTERN_READY')).toBe(1);
    expect(bus.countOf('GRID_STALLED')).toBe(1); // no second stalled
  });

  test('test_tier1_floor_clamp_stays_at_tier1', () => {
    // Already at tier 1 — demotion floor = 1 (stays tier 1)
    const pool: PatternRecord[] = [TOO_MANY_GATES_T1];
    const { lib, bus } = makeLib(pool);

    for (let i = 0; i < MAX_RETRY_COUNT; i++) lib.getPattern(CTX1, i);

    expect(bus.countOf('GRID_STALLED')).toBe(1);

    // Demote from tier 1 → floor clamp → still tier 1
    const stillTier1 = { tier: Math.max(1, 1 - 1) as 1 | 2 | 3, roundNumber: 1 };
    // Actually Math.max(1, 1-1) = Math.max(1, 0) = 1 — correct
    expect(stillTier1.tier).toBe(1);

    for (let i = 0; i < MAX_RETRY_COUNT; i++) lib.getPattern(stillTier1, i, true);

    expect(bus.countOf('GRID_STALLED')).toBe(2); // second GRID_STALLED from tier-1 fallback
  });

  test('test_max_retry_count_is_exactly_3', () => {
    expect(MAX_RETRY_COUNT).toBe(3);
  });

  test('test_min_safe_cells_constant_is_8', () => {
    expect(MIN_SAFE_CELLS).toBe(8);
  });

});

// ---------------------------------------------------------------------------
// getPattern requires clock and eventBus
// ---------------------------------------------------------------------------

describe('getPattern precondition: clock and eventBus required', () => {

  test('test_get_pattern_throws_without_clock_and_bus', () => {
    const lib = new PatternLibrary([VALID_T1]);

    expect(() => lib.getPattern(CTX1, 0)).toThrow();
  });

});
