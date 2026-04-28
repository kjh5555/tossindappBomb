/**
 * pattern_data_test.ts
 * Unit tests for PatternData catalogue and PatternLibrary.toExplodePattern().
 *
 * Implements acceptance criteria:
 *   AC-PL-1  — All records have bfsVerified === true
 *   AC-PL-2  — Safe cells ≥ 8 and form a single BFS-connected region
 *   AC-PL-3  — Total 20 patterns (T1×7, T2×8, T3×5)
 *   AC-PL-4  — All 5 categories present in all 3 tiers
 *   AC-PL-11 — toExplodePattern() returns only cells and patternId
 *
 * Story: story-001 (PatternLibrary — data types + toExplodePattern)
 */

import { PATTERNS } from '../../../src/core/patterns/PatternData';
import { PatternRecord } from '../../../src/core/patterns/PatternTypes';
import { PatternLibrary } from '../../../src/core/patterns/PatternLibrary';

// ---------------------------------------------------------------------------
// BFS helper
// ---------------------------------------------------------------------------

/**
 * Returns true iff the safe cells (all 8×8 cells NOT in record.cells) form a
 * single BFS-connected region using 4-directional adjacency.
 *
 * Algorithm:
 *  1. Build a Set of gate cell indices (row*8+col).
 *  2. Find the first safe cell as BFS seed.
 *  3. BFS-flood all safe cells reachable from the seed.
 *  4. Pass iff visited count === 64 − record.cells.length.
 */
function safeRegionIsConnected(record: PatternRecord): boolean {
  const GRID = 8;
  const gateSet = new Set(record.cells.map(c => c.row * GRID + c.col));

  // Find first safe cell as BFS seed
  const safeStart = (() => {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!gateSet.has(r * GRID + c)) return { row: r, col: c };
      }
    }
    return null;
  })();

  if (!safeStart) return false;

  const visited = new Set<number>();
  const queue: Array<{ row: number; col: number }> = [safeStart];
  visited.add(safeStart.row * GRID + safeStart.col);

  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) continue;
      const idx = nr * GRID + nc;
      if (gateSet.has(idx) || visited.has(idx)) continue;
      visited.add(idx);
      queue.push({ row: nr, col: nc });
    }
  }

  return visited.size === 64 - record.cells.length;
}

// ---------------------------------------------------------------------------
// AC-PL-1: bfsVerified flag
// ---------------------------------------------------------------------------

describe('PatternData — AC-PL-1: bfsVerified 불변 조건', () => {
  test('test_patterndata_all_records_bfs_verified_true', () => {
    // Arrange: full PATTERNS catalogue
    // Act + Assert: every record declares bfsVerified === true
    for (const record of PATTERNS) {
      expect(record.bfsVerified).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-PL-2: safe cell count and connectivity
// ---------------------------------------------------------------------------

describe('PatternData — AC-PL-2: 안전 셀 최소 8개 보장', () => {
  test('test_patterndata_all_records_safe_cell_count_at_least_8', () => {
    // Arrange: full PATTERNS catalogue
    // Act + Assert: 64 − gate_count ≥ 8 for every pattern
    for (const record of PATTERNS) {
      const safeCells = 64 - record.cells.length;
      expect(safeCells).toBeGreaterThanOrEqual(8);
    }
  });

  test('test_patterndata_safe_cells_form_single_connected_region', () => {
    // Arrange: full PATTERNS catalogue
    // Act + Assert: BFS flood from any safe cell reaches all safe cells
    for (const record of PATTERNS) {
      const connected = safeRegionIsConnected(record);
      expect(connected).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// AC-PL-3: pattern counts
// ---------------------------------------------------------------------------

describe('PatternData — AC-PL-3: MVP 패턴 수', () => {
  test('test_patterndata_total_count_is_20', () => {
    // Arrange + Act: PATTERNS array length
    // Assert
    expect(PATTERNS).toHaveLength(20);
  });

  test('test_patterndata_tier1_count_is_7', () => {
    // Arrange
    const tier1 = PATTERNS.filter(p => p.tier === 1);
    // Assert
    expect(tier1).toHaveLength(7);
  });

  test('test_patterndata_tier2_count_is_8', () => {
    // Arrange
    const tier2 = PATTERNS.filter(p => p.tier === 2);
    // Assert
    expect(tier2).toHaveLength(8);
  });

  test('test_patterndata_tier3_count_is_5', () => {
    // Arrange
    const tier3 = PATTERNS.filter(p => p.tier === 3);
    // Assert
    expect(tier3).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// AC-PL-4: category coverage
// ---------------------------------------------------------------------------

describe('PatternData — AC-PL-4: 카테고리 커버리지', () => {
  test('test_patterndata_all_5_categories_present_in_all_3_tiers', () => {
    // Arrange
    const categories = ['LINE', 'CROSS', 'DIAGONAL', 'ISLAND', 'COMPOSITE'] as const;
    const tiers = [1, 2, 3] as const;

    // Act + Assert: each (tier, category) pair has at least one pattern
    for (const tier of tiers) {
      for (const category of categories) {
        const count = PATTERNS.filter(p => p.tier === tier && p.category === category).length;
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AC-PL-11: ExplodePattern contract
// ---------------------------------------------------------------------------

describe('PatternLibrary — AC-PL-11: ExplodePattern 계약', () => {
  const lib = new PatternLibrary();

  test('test_toExplodePattern_output_contains_only_cells_and_patternId', () => {
    // Arrange
    const record = PATTERNS[0];

    // Act
    const result = lib.toExplodePattern(record);

    // Assert: cells and patternId are present and correct
    expect(result.cells).toBe(record.cells);
    expect(result.patternId).toBe(record.patternId);

    // Assert: metadata fields are NOT present
    const asAny = result as unknown as Record<string, unknown>;
    expect(asAny['tier']).toBeUndefined();
    expect(asAny['category']).toBeUndefined();
    expect(asAny['symmetryAxis']).toBeUndefined();
    expect(asAny['bfsVerified']).toBeUndefined();
  });

  test('test_toExplodePattern_all_cells_have_valid_coordinates', () => {
    // Arrange + Act + Assert: all cells in all converted patterns are in [0,7]×[0,7]
    for (const record of PATTERNS) {
      const result = lib.toExplodePattern(record);
      for (const cell of result.cells) {
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThanOrEqual(7);
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThanOrEqual(7);
      }
    }
  });

  test('test_toExplodePattern_bfsVerified_false_record_still_strips_metadata', () => {
    // Arrange: a record that deliberately has bfsVerified=false (e.g. prototype/test data)
    const invalidRecord: PatternRecord = {
      patternId: 'TEST-INVALID',
      cells: [{ row: 0, col: 0 }],
      tier: 1,
      category: 'LINE',
      symmetryAxis: 'H',
      bfsVerified: false,
    };

    // Act
    const result = lib.toExplodePattern(invalidRecord);

    // Assert: metadata stripping is unconditional — bfsVerified must not leak
    expect((result as unknown as Record<string, unknown>)['bfsVerified']).toBeUndefined();
    expect(result.patternId).toBe('TEST-INVALID');
    expect(result.cells).toBe(invalidRecord.cells);
  });
});
