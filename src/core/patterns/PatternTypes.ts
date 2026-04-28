/**
 * PatternTypes.ts
 * Canonical type definitions for the PatternLibrary system.
 *
 * Implements: design/gdd/pattern-library.md § A-1 (pattern record contract)
 * Story: story-001 (PatternLibrary — data types + toExplodePattern)
 *
 * Invariants:
 *  1. PatternRecord is immutable (all fields readonly).
 *  2. ExplodePattern exposes only the fields needed by the explosion engine.
 *  3. DifficultyContext carries the minimum data required for tier selection.
 */

import { CellCoord } from '../grid/CellCoord';

export type { CellCoord };

// ---------------------------------------------------------------------------
// Pattern classification
// ---------------------------------------------------------------------------

/**
 * Shape family of a gate pattern.
 *
 * - LINE      : cells arranged in one or two parallel rows/columns
 * - CROSS     : cells form a + or × shape
 * - DIAGONAL  : cells run along a diagonal axis
 * - ISLAND    : isolated cluster with no row/column dominance
 * - COMPOSITE : combination of two or more shape families
 */
export type PatternCategory = 'LINE' | 'CROSS' | 'DIAGONAL' | 'ISLAND' | 'COMPOSITE';

/**
 * Axis along which the pattern has reflective symmetry.
 *
 * - H    : horizontal (top/bottom mirror)
 * - V    : vertical (left/right mirror)
 * - HV   : both axes (4-fold symmetry)
 * - NONE : no reflective symmetry
 */
export type PatternSymmetry = 'H' | 'V' | 'HV' | 'NONE';

// ---------------------------------------------------------------------------
// Core records
// ---------------------------------------------------------------------------

/**
 * Immutable descriptor for a single gate pattern stored in the library.
 *
 * Contract (enforced by PatternData tests):
 *  - bfsVerified MUST be true for all production records.
 *  - 64 − cells.length MUST be ≥ MIN_SAFE_CELLS (8).
 *  - Safe cells (64 − cells.length cells not in cells) must form a
 *    single BFS-connected region in the 8×8 grid.
 */
export interface PatternRecord {
  /** Unique identifier. Format: T{tier}-{CATEGORY}-{AXIS}-{seq3digit} */
  readonly patternId: string;

  /** Ordered list of gate cells that will be set to EXPLODED state. */
  readonly cells: CellCoord[];

  /** Difficulty tier: 1 = easy, 2 = medium, 3 = hard. */
  readonly tier: 1 | 2 | 3;

  /** Shape family classification. */
  readonly category: PatternCategory;

  /** Symmetry axis of the pattern. */
  readonly symmetryAxis: PatternSymmetry;

  /**
   * True iff the safe-cell region has been verified to be a single
   * BFS-connected component. Must be true for all production patterns.
   */
  readonly bfsVerified: boolean;
}

/**
 * Stripped-down view of a pattern passed to the explosion engine.
 * Contains only the fields the engine needs — no metadata.
 *
 * Produced exclusively by PatternLibrary.toExplodePattern().
 */
export interface ExplodePattern {
  /** Gate cells to explode. */
  readonly cells: CellCoord[];

  /** Originating pattern identifier, forwarded for analytics. */
  readonly patternId: string;
}

/**
 * Contextual data passed to pattern selection logic.
 * Carries the minimum information needed for tier-based filtering.
 */
export interface DifficultyContext {
  /** Current difficulty tier (1–3). */
  readonly tier: 1 | 2 | 3;

  /** Current round number (1-based). */
  readonly roundNumber: number;
}
