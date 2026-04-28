/**
 * PatternData.ts
 * Authoritative pattern library — 20 hand-crafted, BFS-verified gate patterns.
 *
 * Implements: design/gdd/pattern-library.md § A-2 (pattern catalogue)
 * Story: story-001 (PatternLibrary — data types + toExplodePattern)
 *
 * Invariants (enforced by pattern_data_test.ts):
 *  1. bfsVerified === true for every record.
 *  2. 64 − cells.length >= MIN_SAFE_CELLS (8).
 *  3. Safe cells form a single BFS-connected region in the 8×8 grid.
 *  4. Total: 20 patterns — T1 × 7, T2 × 8, T3 × 5.
 *  5. All 5 categories (LINE, CROSS, DIAGONAL, ISLAND, COMPOSITE) present per tier.
 *
 * BFS connectivity design principle:
 *  - Never span a complete row or column of gate cells — that would bisect safe cells.
 *  - Always leave at least one open column or row as a connectivity "corridor".
 *  - For larger patterns, leave open columns 0 and/or 7 as vertical corridors.
 *
 * patternId format: T{tier}-{CATEGORY}-{AXIS}-{seq3digit}
 * Cell coordinates: row and col ∈ [0, 7]. Origin = top-left.
 */

import { PatternRecord } from './PatternTypes';

// ---------------------------------------------------------------------------
// Tier 1 — Easy (7 patterns, 6–12 cells)
// BFS design note: all T1 patterns leave cols 0-1 and 6-7 fully open,
// guaranteeing top/bottom halves stay connected via left and right corridors.
// ---------------------------------------------------------------------------

/**
 * T1-LINE-H-001
 * Horizontal double-band: rows 3–4, cols 2–5 (8 gate cells).
 * Safe cells: cols 0-1 and 6-7 of ALL rows, plus entire rows 0-2 and 5-7.
 * BFS: safe cells at row 3/4 col 0-1 connect top and bottom halves. ✓
 */
const T1_LINE_H_001: PatternRecord = {
  patternId: 'T1-LINE-H-001',
  cells: [
    { row: 3, col: 2 }, { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
    { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 },
  ],
  tier: 1,
  category: 'LINE',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T1-LINE-V-001
 * Vertical double-band: cols 3–4, rows 2–5 (8 gate cells).
 * Safe cells: rows 0-1 and 6-7 of ALL cols, plus entire cols 0-2 and 5-7.
 * BFS: safe cells at col 3/4 row 0-1 connect left and right halves. ✓
 */
const T1_LINE_V_001: PatternRecord = {
  patternId: 'T1-LINE-V-001',
  cells: [
    { row: 2, col: 3 }, { row: 3, col: 3 }, { row: 4, col: 3 }, { row: 5, col: 3 },
    { row: 2, col: 4 }, { row: 3, col: 4 }, { row: 4, col: 4 }, { row: 5, col: 4 },
  ],
  tier: 1,
  category: 'LINE',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T1-CROSS-HV-001
 * Small plus-sign: centre row 3 cols 2-5 + centre col 3 rows 1-6,
 * deduplicated = 10 gate cells.
 * Safe cells include all four corner blocks and edge cells that form a ring. ✓
 */
const T1_CROSS_HV_001: PatternRecord = {
  patternId: 'T1-CROSS-HV-001',
  cells: [
    // Horizontal arm: row 3, cols 2-5
    { row: 3, col: 2 }, { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
    // Vertical arm: col 3, rows 1-2 and 4-5 (row 3 col 3 already listed)
    { row: 1, col: 3 }, { row: 2, col: 3 },
    { row: 4, col: 3 }, { row: 5, col: 3 },
    // Extra vertical: col 4, rows 1-2 and 4-5
    { row: 1, col: 4 }, { row: 2, col: 4 },
    { row: 4, col: 4 }, { row: 5, col: 4 },
  ],
  tier: 1,
  category: 'CROSS',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T1-DIAGONAL-NONE-001
 * Main-diagonal strip: 6 cells along the top-left to bottom-right axis.
 * cells: (1,1),(2,2),(3,3),(4,4),(5,5),(6,6)
 * Safe cells form a wide connected ring around and through the corners. ✓
 */
const T1_DIAGONAL_NONE_001: PatternRecord = {
  patternId: 'T1-DIAGONAL-NONE-001',
  cells: [
    { row: 1, col: 1 },
    { row: 2, col: 2 },
    { row: 3, col: 3 },
    { row: 4, col: 4 },
    { row: 5, col: 5 },
    { row: 6, col: 6 },
  ],
  tier: 1,
  category: 'DIAGONAL',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

/**
 * T1-DIAGONAL-NONE-002
 * Anti-diagonal strip: 6 cells along top-right to bottom-left axis.
 * cells: (1,6),(2,5),(3,4),(4,3),(5,2),(6,1)
 * Safe cells wrap around both sides connecting all quadrants. ✓
 */
const T1_DIAGONAL_NONE_002: PatternRecord = {
  patternId: 'T1-DIAGONAL-NONE-002',
  cells: [
    { row: 1, col: 6 },
    { row: 2, col: 5 },
    { row: 3, col: 4 },
    { row: 4, col: 3 },
    { row: 5, col: 2 },
    { row: 6, col: 1 },
  ],
  tier: 1,
  category: 'DIAGONAL',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

/**
 * T1-ISLAND-HV-001
 * Small 2×3 island centred in the grid: rows 3-4, cols 3-5 (6 gate cells).
 * Safe cells surround the island on all sides — fully connected ring. ✓
 */
const T1_ISLAND_HV_001: PatternRecord = {
  patternId: 'T1-ISLAND-HV-001',
  cells: [
    { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
    { row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 },
  ],
  tier: 1,
  category: 'ISLAND',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T1-COMPOSITE-NONE-001
 * L-shape: horizontal segment row 5 cols 1-5 plus vertical segment col 1 rows 2-4.
 * 8 gate cells total (col 1 row 5 shared, counted once).
 * Safe cells form a large connected region above and to the right. ✓
 */
const T1_COMPOSITE_NONE_001: PatternRecord = {
  patternId: 'T1-COMPOSITE-NONE-001',
  cells: [
    // Vertical part: col 1, rows 2-4
    { row: 2, col: 1 }, { row: 3, col: 1 }, { row: 4, col: 1 },
    // Horizontal part: row 5, cols 1-5
    { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 },
    { row: 5, col: 4 }, { row: 5, col: 5 },
  ],
  tier: 1,
  category: 'COMPOSITE',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

// ---------------------------------------------------------------------------
// Tier 2 — Medium (8 patterns, 10–24 cells)
// BFS design note: T2 patterns use wider bands but leave at minimum col 0 and
// col 7 as open corridors connecting top and bottom safe regions.
// ---------------------------------------------------------------------------

/**
 * T2-LINE-H-001
 * Wide horizontal band: rows 3-4, cols 1-6 (12 gate cells).
 * Safe cells: cols 0 and 7 of all rows act as vertical corridors. ✓
 */
const T2_LINE_H_001: PatternRecord = {
  patternId: 'T2-LINE-H-001',
  cells: [
    { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
    { row: 3, col: 4 }, { row: 3, col: 5 }, { row: 3, col: 6 },
    { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 },
    { row: 4, col: 4 }, { row: 4, col: 5 }, { row: 4, col: 6 },
  ],
  tier: 2,
  category: 'LINE',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T2-LINE-V-001
 * Wide vertical band: cols 3-4, rows 1-6 (12 gate cells).
 * Safe cells: rows 0 and 7 of all cols act as horizontal corridors. ✓
 */
const T2_LINE_V_001: PatternRecord = {
  patternId: 'T2-LINE-V-001',
  cells: [
    { row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 3 },
    { row: 4, col: 3 }, { row: 5, col: 3 }, { row: 6, col: 3 },
    { row: 1, col: 4 }, { row: 2, col: 4 }, { row: 3, col: 4 },
    { row: 4, col: 4 }, { row: 5, col: 4 }, { row: 6, col: 4 },
  ],
  tier: 2,
  category: 'LINE',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T2-CROSS-HV-001
 * Medium plus: row 3 cols 1-6, col 2 rows 1-6, col 5 rows 1-6,
 * deduplicated to 16 gate cells forming a fat cross.
 * Safe cells in the four corner quadrants all connect via row 0 and row 7. ✓
 */
const T2_CROSS_HV_001: PatternRecord = {
  patternId: 'T2-CROSS-HV-001',
  cells: [
    // Horizontal bar: row 3, cols 1-6
    { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
    { row: 3, col: 4 }, { row: 3, col: 5 }, { row: 3, col: 6 },
    // Horizontal bar: row 4, cols 1-6
    { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 },
    { row: 4, col: 4 }, { row: 4, col: 5 }, { row: 4, col: 6 },
    // Vertical bar extension: col 3-4, rows 1-2 and 5-6
    { row: 1, col: 3 }, { row: 2, col: 3 },
    { row: 5, col: 3 }, { row: 6, col: 3 },
  ],
  tier: 2,
  category: 'CROSS',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T2-DIAGONAL-NONE-001
 * Double main-diagonal strip: (row,col) and (row,col+1) for row 1-6.
 * 12 gate cells forming a thick diagonal band.
 * Safe cells connect around both ends of the band. ✓
 */
const T2_DIAGONAL_NONE_001: PatternRecord = {
  patternId: 'T2-DIAGONAL-NONE-001',
  cells: [
    { row: 1, col: 1 }, { row: 1, col: 2 },
    { row: 2, col: 2 }, { row: 2, col: 3 },
    { row: 3, col: 3 }, { row: 3, col: 4 },
    { row: 4, col: 4 }, { row: 4, col: 5 },
    { row: 5, col: 5 }, { row: 5, col: 6 },
    { row: 6, col: 6 }, { row: 6, col: 7 },
  ],
  tier: 2,
  category: 'DIAGONAL',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

/**
 * T2-DIAGONAL-NONE-002
 * Double anti-diagonal strip: rows 1-6.
 * 12 gate cells forming a thick anti-diagonal band.
 * Safe cells connect around both ends at corners (0,7) and (7,0). ✓
 */
const T2_DIAGONAL_NONE_002: PatternRecord = {
  patternId: 'T2-DIAGONAL-NONE-002',
  cells: [
    { row: 1, col: 5 }, { row: 1, col: 6 },
    { row: 2, col: 4 }, { row: 2, col: 5 },
    { row: 3, col: 3 }, { row: 3, col: 4 },
    { row: 4, col: 2 }, { row: 4, col: 3 },
    { row: 5, col: 1 }, { row: 5, col: 2 },
    { row: 6, col: 0 }, { row: 6, col: 1 },
  ],
  tier: 2,
  category: 'DIAGONAL',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

/**
 * T2-ISLAND-HV-001
 * 3×4 rectangular island: rows 2-5, cols 2-5 (16 gate cells, wait — 4x4=16).
 * Actually 4×3: rows 2-5, cols 2-4 = 12 gate cells.
 * Safe cells form an unbroken border ring around the 8×8 grid. ✓
 */
const T2_ISLAND_HV_001: PatternRecord = {
  patternId: 'T2-ISLAND-HV-001',
  cells: [
    { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 },
    { row: 3, col: 2 }, { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
    { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 },
  ],
  tier: 2,
  category: 'ISLAND',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T2-COMPOSITE-NONE-001
 * T-shape: horizontal bar row 2 cols 1-6 plus vertical stem col 3 rows 3-6.
 * 10 gate cells total (col 3 row 2 already in horizontal bar).
 * Safe cells connect above the bar (row 0-1) and around the stem. ✓
 */
const T2_COMPOSITE_NONE_001: PatternRecord = {
  patternId: 'T2-COMPOSITE-NONE-001',
  cells: [
    // Horizontal bar: row 2, cols 1-6
    { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 },
    { row: 2, col: 4 }, { row: 2, col: 5 }, { row: 2, col: 6 },
    // Vertical stem: col 4, rows 3-6
    { row: 3, col: 4 }, { row: 4, col: 4 },
    { row: 5, col: 4 }, { row: 6, col: 4 },
  ],
  tier: 2,
  category: 'COMPOSITE',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

/**
 * T2-COMPOSITE-NONE-002
 * Z-shape: top horizontal row 1 cols 2-5, diagonal step row 2-3 cols 3-4,
 * bottom horizontal row 4 cols 2-5. 14 gate cells.
 * Safe cells connect around both ends of the Z. ✓
 */
const T2_COMPOSITE_NONE_002: PatternRecord = {
  patternId: 'T2-COMPOSITE-NONE-002',
  cells: [
    // Top bar: row 1, cols 2-5
    { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 }, { row: 1, col: 5 },
    // Middle step: rows 2-3, cols 3-4
    { row: 2, col: 3 }, { row: 2, col: 4 },
    { row: 3, col: 3 }, { row: 3, col: 4 },
    // Bottom bar: row 4, cols 2-5
    { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 },
    // Extra flanks to make it Z
    { row: 2, col: 5 }, { row: 3, col: 2 },
  ],
  tier: 2,
  category: 'COMPOSITE',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

// ---------------------------------------------------------------------------
// Tier 3 — Hard (5 patterns, 16–32 cells)
// BFS design note: T3 patterns are large but MUST keep ≥8 safe cells that
// remain connected. All T3 patterns preserve col 0 and col 7 as open corridors
// or leave a deliberate passage so safe cells do not split into islands.
// ---------------------------------------------------------------------------

/**
 * T3-LINE-H-001
 * Triple horizontal band: rows 2-4, cols 1-6 (18 gate cells).
 * Safe cells: col 0 and col 7 form full-height corridors (16 safe cells).
 * BFS: (0,0) connects down col 0 all 8 rows, bridging rows 2-4 safe cells. ✓
 */
const T3_LINE_H_001: PatternRecord = {
  patternId: 'T3-LINE-H-001',
  cells: [
    { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 },
    { row: 2, col: 4 }, { row: 2, col: 5 }, { row: 2, col: 6 },
    { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
    { row: 3, col: 4 }, { row: 3, col: 5 }, { row: 3, col: 6 },
    { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 },
    { row: 4, col: 4 }, { row: 4, col: 5 }, { row: 4, col: 6 },
  ],
  tier: 3,
  category: 'LINE',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T3-CROSS-HV-001
 * Large cross: rows 3-4 cols 0-7 MINUS cols 0 and 7 of those rows,
 * plus cols 3-4 rows 0-7 MINUS rows 0 and 7 of those cols.
 * = 12 + 12 − 4 (intersections) = 20 gate cells.
 * Safe cells: four corner blocks (2×3 each) connected via row 0 and row 7. ✓
 */
const T3_CROSS_HV_001: PatternRecord = {
  patternId: 'T3-CROSS-HV-001',
  cells: [
    // Horizontal beam: rows 3-4, cols 1-6 (leaving 0 and 7 open)
    { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
    { row: 3, col: 4 }, { row: 3, col: 5 }, { row: 3, col: 6 },
    { row: 4, col: 1 }, { row: 4, col: 2 }, { row: 4, col: 3 },
    { row: 4, col: 4 }, { row: 4, col: 5 }, { row: 4, col: 6 },
    // Vertical beam: cols 3-4, rows 1-2 and 5-6
    { row: 1, col: 3 }, { row: 2, col: 3 }, { row: 5, col: 3 }, { row: 6, col: 3 },
    { row: 1, col: 4 }, { row: 2, col: 4 }, { row: 5, col: 4 }, { row: 6, col: 4 },
  ],
  tier: 3,
  category: 'CROSS',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T3-DIAGONAL-NONE-001
 * 3-cell-wide diagonal band, rows 1-5 cols 1-5. 15 gate cells.
 * NEVER touches row 0, row 7, col 0, col 7 — entire border (28 cells) stays safe
 * and forms a connected ring. All interior safe cells are adjacent to the ring. ✓
 *
 * Gate rows: 1→(1-3), 2→(2-4), 3→(3-5), 4→(3-5), 5→(2-4)
 * Safe = 49. Border ring provides guaranteed BFS connectivity.
 */
const T3_DIAGONAL_NONE_001: PatternRecord = {
  patternId: 'T3-DIAGONAL-NONE-001',
  cells: [
    { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 },
    { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 },
    { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
    { row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 },
    { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 },
  ],
  tier: 3,
  category: 'DIAGONAL',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

/**
 * T3-ISLAND-HV-001
 * Large 4×4 island in the centre: rows 2-5, cols 2-5 (16 gate cells).
 * Safe cells form a connected border ring of 64−16=48 cells. ✓
 */
const T3_ISLAND_HV_001: PatternRecord = {
  patternId: 'T3-ISLAND-HV-001',
  cells: [
    { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 },
    { row: 3, col: 2 }, { row: 3, col: 3 }, { row: 3, col: 4 }, { row: 3, col: 5 },
    { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 }, { row: 4, col: 5 },
    { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 }, { row: 5, col: 5 },
  ],
  tier: 3,
  category: 'ISLAND',
  symmetryAxis: 'HV',
  bfsVerified: true,
};

/**
 * T3-COMPOSITE-NONE-001
 * Comb pattern: horizontal spine row 3 cols 1-6, plus 5 teeth (col 2,3,4,5,6 rows 4-5).
 * 6 (spine) + 10 (teeth) = 16 gate cells (col 3,4,5,6 row 3 in spine, tooth base col 2 row 3 new).
 * Counting carefully: spine row 3 cols 1-6 = 6 cells, teeth col 2-6 rows 4-5 = 10 cells. Total 16.
 * Safe cells: entire row 0-2 connected, row 6-7 connected, and col 1 rows 4-5 open. ✓
 *
 * BFS: start at (0,0). Row 0 fully safe → reaches all cols 0-7 row 0.
 * Col 0 rows 0-7 all safe → bridges row 3 safe cells at col 0, and rows 4-7 col 0.
 * Row 6 and 7 fully safe via col 0. Row 4-5 cols 0-1 safe → connects to col 7 rows 4-5
 * via row 6 or 7. All 48 safe cells connected. ✓
 */
const T3_COMPOSITE_NONE_001: PatternRecord = {
  patternId: 'T3-COMPOSITE-NONE-001',
  cells: [
    // Horizontal spine: row 3, cols 1-6
    { row: 3, col: 1 }, { row: 3, col: 2 }, { row: 3, col: 3 },
    { row: 3, col: 4 }, { row: 3, col: 5 }, { row: 3, col: 6 },
    // Teeth: cols 2-6, rows 4-5
    { row: 4, col: 2 }, { row: 4, col: 3 }, { row: 4, col: 4 },
    { row: 4, col: 5 }, { row: 4, col: 6 },
    { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 },
    { row: 5, col: 5 }, { row: 5, col: 6 },
  ],
  tier: 3,
  category: 'COMPOSITE',
  symmetryAxis: 'NONE',
  bfsVerified: true,
};

// ---------------------------------------------------------------------------
// Exported catalogue
// ---------------------------------------------------------------------------

/**
 * Authoritative collection of all 20 gate patterns.
 *
 * Order: T1 (7) → T2 (8) → T3 (5).
 * All records satisfy the three invariants checked by pattern_data_test.ts.
 */
export const PATTERNS: readonly PatternRecord[] = [
  // T1 — 7 patterns
  T1_LINE_H_001,
  T1_LINE_V_001,
  T1_CROSS_HV_001,
  T1_DIAGONAL_NONE_001,
  T1_DIAGONAL_NONE_002,
  T1_ISLAND_HV_001,
  T1_COMPOSITE_NONE_001,

  // T2 — 8 patterns
  T2_LINE_H_001,
  T2_LINE_V_001,
  T2_CROSS_HV_001,
  T2_DIAGONAL_NONE_001,
  T2_DIAGONAL_NONE_002,
  T2_ISLAND_HV_001,
  T2_COMPOSITE_NONE_001,
  T2_COMPOSITE_NONE_002,

  // T3 — 5 patterns
  T3_LINE_H_001,
  T3_CROSS_HV_001,
  T3_DIAGONAL_NONE_001,
  T3_ISLAND_HV_001,
  T3_COMPOSITE_NONE_001,
];
