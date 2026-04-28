/**
 * pattern_selection_test.ts
 * Unit tests for PatternLibrary.selectPattern — story-002.
 *
 * Story: PatternLibrary story-002 (deterministic selection + recency window)
 *
 * Coverage:
 *  AC-PL-5  Deterministic selection (same ctx + seed → same patternId)
 *  AC-PL-6  Recency window excludes last N_recent used patterns
 *  AC-PL-10 N_recent auto-shrink for small pools
 *  EC-5     First round with empty recentIds → full pool available
 *  EC-2     Progressive N_recent shrink when all candidates excluded
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { PatternLibrary, MAX_RECENT_WINDOW } from '../../../src/core/patterns/PatternLibrary';
import type { PatternRecord, DifficultyContext } from '../../../src/core/patterns/PatternTypes';

// ---------------------------------------------------------------------------
// Test pattern factories
// ---------------------------------------------------------------------------

function makePattern(id: string, tier: 1 | 2 | 3, bfsVerified = true): PatternRecord {
  return {
    patternId: id,
    cells: [{ row: 0, col: 0 }], // minimal valid cell — not relevant for selection tests
    tier,
    category: 'LINE',
    symmetryAxis: 'H',
    bfsVerified,
  };
}

/** Build N patterns for a given tier, IDs: `${prefix}1` .. `${prefix}N` */
function makePool(prefix: string, tier: 1 | 2 | 3, count: number): PatternRecord[] {
  return Array.from({ length: count }, (_, i) => makePattern(`${prefix}${i + 1}`, tier));
}

const CTX_T1: DifficultyContext = { tier: 1, roundNumber: 1 };
const CTX_T2: DifficultyContext = { tier: 2, roundNumber: 1 };
const CTX_T3: DifficultyContext = { tier: 3, roundNumber: 1 };

// ---------------------------------------------------------------------------
// AC-PL-5: Deterministic selection
// ---------------------------------------------------------------------------

describe('AC-PL-5: Deterministic selection', () => {

  test('test_same_seed_same_ctx_returns_same_pattern_id', () => {
    // Arrange — T1 pool of 7
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool);
    const seed = 42;
    const ctx: DifficultyContext = { tier: 1, roundNumber: 5 };

    // Collect 10 results, each with a fresh library (empty recentIds each time)
    const results: string[] = [];
    for (let i = 0; i < 10; i++) {
      const freshLib = new PatternLibrary(pool);
      const result = freshLib.selectPattern(ctx, seed);
      results.push(result!.patternId);
    }

    // Assert — all identical
    expect(new Set(results).size).toBe(1);
  });

  test('test_seed_zero_selects_index_zero_of_candidates', () => {
    // Arrange — 5-pattern pool, no recency
    const pool = makePool('P', 1, 5);
    const lib = new PatternLibrary(pool);

    const result = lib.selectPattern(CTX_T1, 0);

    // seed=0 → candidates[0 % 5] = candidates[0] = P1
    expect(result!.patternId).toBe('P1');
  });

  test('test_seed_equals_pool_size_wraps_to_index_zero', () => {
    // Arrange — pool of 5, seed=5 → 5 % 5 = 0 → first candidate
    const pool = makePool('P', 1, 5);
    const lib = new PatternLibrary(pool);

    const result = lib.selectPattern(CTX_T1, 5);

    expect(result!.patternId).toBe('P1');
  });

  test('test_seed_large_value_gives_deterministic_modulo_result', () => {
    // Arrange — pool of 7, seed=100 → 100 % 7 = 2 → P3
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool);

    const result = lib.selectPattern(CTX_T1, 100);

    expect(result!.patternId).toBe('P' + (100 % 7 + 1)); // 100%7=2, index 2 → P3
  });

  test('test_returns_null_when_pool_is_empty', () => {
    // Arrange — pool has no T1 patterns
    const pool = makePool('P', 2, 5); // all T2
    const lib = new PatternLibrary(pool);

    const result = lib.selectPattern(CTX_T1, 0);

    expect(result).toBeNull();
  });

  test('test_bfs_not_verified_patterns_excluded_from_candidates', () => {
    // Arrange — 3 T1 patterns, one with bfsVerified=false
    const pool: PatternRecord[] = [
      makePattern('P1', 1, true),
      makePattern('P2', 1, false), // should be excluded
      makePattern('P3', 1, true),
    ];
    const lib = new PatternLibrary(pool);

    // With 2 verified candidates, seed=1 → candidates[1] = P3
    const result = lib.selectPattern(CTX_T1, 1);

    expect(result!.patternId).toBe('P3');
  });

});

// ---------------------------------------------------------------------------
// AC-PL-6: Recency window
// ---------------------------------------------------------------------------

describe('AC-PL-6: Recency window excludes recent patterns', () => {

  test('test_t1_pool_7_n_recent_is_3', () => {
    // Arrange — T1 pool of 7: N_recent = min(3, floor(7/2)) = 3
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool);

    // Make 3 selections to fill recentIds
    lib.selectPattern(CTX_T1, 0); // P1
    lib.selectPattern(CTX_T1, 0); // P2 (P1 excluded)
    lib.selectPattern(CTX_T1, 0); // P3 (P1,P2 excluded)

    // 4th selection: last 3 recent = [P1, P2, P3], candidates = [P4..P7]
    const result = lib.selectPattern(CTX_T1, 0);

    // P4 = index 0 of remaining 4 candidates
    expect(result!.patternId).toBe('P4');
    expect(['P1', 'P2', 'P3']).not.toContain(result!.patternId);
  });

  test('test_t3_pool_5_n_recent_is_2', () => {
    // Arrange — T3 pool of 5: N_recent = min(3, floor(5/2)) = 2
    const pool = makePool('Q', 3, 5);
    const lib = new PatternLibrary(pool);

    lib.selectPattern(CTX_T3, 0); // Q1
    lib.selectPattern(CTX_T3, 0); // Q2 (Q1 excluded)

    // 3rd: last 2 recent = [Q1, Q2], candidates = [Q3, Q4, Q5]
    const result = lib.selectPattern(CTX_T3, 0);

    expect(result!.patternId).toBe('Q3');
    expect(['Q1', 'Q2']).not.toContain(result!.patternId);
  });

  test('test_recent_ids_ring_buffer_caps_at_max_window', () => {
    // Arrange
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool) as any;

    // Make MAX_RECENT_WINDOW+2 selections
    for (let i = 0; i < MAX_RECENT_WINDOW + 2; i++) {
      lib.selectPattern(CTX_T1, i);
    }

    // Assert — ring buffer capped at MAX_RECENT_WINDOW
    expect(lib._recentIds.length).toBeLessThanOrEqual(MAX_RECENT_WINDOW);
  });

  test('test_recency_excludes_correctly_across_consecutive_rounds', () => {
    // Arrange — T1 pool of 7, verify no recent repeat across 5 rounds
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool);
    const selected: string[] = [];

    for (let i = 0; i < 5; i++) {
      const result = lib.selectPattern({ tier: 1, roundNumber: i + 1 }, i * 3);
      selected.push(result!.patternId);
    }

    // No consecutive duplicate within a window of 3
    for (let i = MAX_RECENT_WINDOW; i < selected.length; i++) {
      const window = selected.slice(i - MAX_RECENT_WINDOW, i);
      expect(window).not.toContain(selected[i]);
    }
  });

});

// ---------------------------------------------------------------------------
// AC-PL-10: N_recent auto-shrink for small pools
// ---------------------------------------------------------------------------

describe('AC-PL-10: N_recent auto-shrink', () => {

  test('test_pool_size_4_n_recent_is_2', () => {
    // N_recent = min(3, floor(4/2)) = 2
    const pool = makePool('P', 1, 4);
    const lib = new PatternLibrary(pool);

    lib.selectPattern(CTX_T1, 0); // P1 → recent=[P1]
    lib.selectPattern(CTX_T1, 0); // P2 → recent=[P1,P2]

    // 3rd selection: last 2 excluded=[P1,P2], candidates=[P3,P4] → seed=0 → P3
    const result = lib.selectPattern(CTX_T1, 0);

    expect(result).not.toBeNull();
    expect(['P1', 'P2']).not.toContain(result!.patternId);
  });

  test('test_pool_size_4_selection_does_not_throw', () => {
    // Even with 3 entries in recentIds, N_recent=2 so selection always has candidates
    const pool = makePool('P', 1, 4);
    const lib = new PatternLibrary(pool);

    // Fill recentIds beyond N_recent
    expect(() => {
      for (let i = 0; i < 6; i++) {
        lib.selectPattern(CTX_T1, i);
      }
    }).not.toThrow();
  });

  test('test_pool_size_2_n_recent_is_1', () => {
    // N_recent = min(3, floor(2/2)) = 1
    const pool = makePool('P', 1, 2);
    const lib = new PatternLibrary(pool);

    lib.selectPattern(CTX_T1, 0); // P1

    // Only P1 excluded; P2 is available
    const result = lib.selectPattern(CTX_T1, 0);

    expect(result!.patternId).toBe('P2');
  });

  test('test_pool_size_1_n_recent_is_0_always_selects_only_pattern', () => {
    // N_recent = min(3, floor(1/2)) = 0 → no exclusion
    const pool = makePool('P', 1, 1);
    const lib = new PatternLibrary(pool);

    const r1 = lib.selectPattern(CTX_T1, 0);
    const r2 = lib.selectPattern(CTX_T1, 0); // should still work (no exclusion)

    expect(r1!.patternId).toBe('P1');
    expect(r2!.patternId).toBe('P1');
  });

});

// ---------------------------------------------------------------------------
// EC-5: First round with empty recentIds
// ---------------------------------------------------------------------------

describe('EC-5: First round empty recency', () => {

  test('test_fresh_library_has_empty_recent_ids', () => {
    const pool = makePool('P', 2, 8);
    const lib = new PatternLibrary(pool) as any;

    expect(lib._recentIds).toHaveLength(0);
  });

  test('test_first_selection_uses_full_tier_pool', () => {
    // T2 pool of 8; no exclusions; seed=3 → candidates[3] = P4
    const pool = makePool('P', 2, 8);
    const lib = new PatternLibrary(pool);

    const result = lib.selectPattern(CTX_T2, 3);

    expect(result!.patternId).toBe('P4');
  });

  test('test_round_number_does_not_affect_selection_only_recent_ids_matter', () => {
    // same pool, same seed, different roundNumber — result should be identical
    const pool = makePool('P', 1, 7);
    const seed = 5;

    const lib1 = new PatternLibrary(pool);
    const lib2 = new PatternLibrary(pool);

    const r1 = lib1.selectPattern({ tier: 1, roundNumber: 1 }, seed);
    const r2 = lib2.selectPattern({ tier: 1, roundNumber: 99 }, seed);

    expect(r1!.patternId).toBe(r2!.patternId);
  });

  test('test_reset_session_clears_recent_ids', () => {
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool) as any;

    lib.selectPattern(CTX_T1, 0);
    lib.selectPattern(CTX_T1, 0);
    expect(lib._recentIds.length).toBeGreaterThan(0);

    lib.resetSession();

    expect(lib._recentIds).toHaveLength(0);
  });

  test('test_after_reset_selection_uses_full_pool_again', () => {
    const pool = makePool('P', 1, 7);
    const lib = new PatternLibrary(pool);

    // First pass — fill recentIds so next would be excluded
    lib.selectPattern(CTX_T1, 0); // P1
    lib.selectPattern(CTX_T1, 0); // P2

    lib.resetSession();

    // After reset, P1 and P2 are available again
    const result = lib.selectPattern(CTX_T1, 0); // seed=0 → first of full pool = P1
    expect(result!.patternId).toBe('P1');
  });

});

// ---------------------------------------------------------------------------
// EC-2: Progressive N_recent shrink when all candidates excluded
// ---------------------------------------------------------------------------

describe('EC-2: Progressive N_recent shrink', () => {

  test('test_pool_3_all_recent_triggers_shrink_to_1', () => {
    // Pool of 3: N_recent = min(3, floor(3/2)) = 1
    // recentIds might have [P1, P2, P3] but only last 1 is excluded
    const pool = makePool('P', 1, 3);
    const lib = new PatternLibrary(pool);

    // Fill recentIds manually via 3 selections
    lib.selectPattern(CTX_T1, 0); // P1 → recent=[P1]
    lib.selectPattern(CTX_T1, 0); // P2 → recent=[P1,P2]
    lib.selectPattern(CTX_T1, 0); // P3 → recent=[P1,P2,P3] (capped at 3)

    // Next: N_recent=1, excluded=[P3], candidates=[P1,P2] → seed=0 → P1
    const result = lib.selectPattern(CTX_T1, 0);

    expect(result).not.toBeNull();
    expect(result!.patternId).not.toBe('P3'); // P3 is excluded
  });

  test('test_forced_all_excluded_shrinks_window_until_candidate_found', () => {
    // Manually inject a scenario where initial window would exclude everything:
    // Pool of 2 patterns; recentIds = [P1, P2]
    // N_recent = min(3, floor(2/2)) = 1 → exclude last 1 = [P2] → candidates = [P1]
    const pool = makePool('P', 1, 2);
    const lib = new PatternLibrary(pool);

    lib.selectPattern(CTX_T1, 0); // P1
    lib.selectPattern(CTX_T1, 0); // P2

    // recent=[P1,P2] (capped at 3, but only 2 exist); N_recent=1; exclude P2 → candidates=[P1]
    const result = lib.selectPattern(CTX_T1, 0);

    expect(result).not.toBeNull();
    expect(result!.patternId).toBe('P1');
  });

  test('test_pool_0_bfs_verified_returns_null', () => {
    // All patterns fail bfsVerified filter → null (not shrink scenario)
    const pool: PatternRecord[] = [
      makePattern('P1', 1, false),
      makePattern('P2', 1, false),
    ];
    const lib = new PatternLibrary(pool);

    const result = lib.selectPattern(CTX_T1, 0);

    expect(result).toBeNull();
  });

});
