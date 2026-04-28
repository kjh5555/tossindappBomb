/**
 * CellCoord.ts
 * Canonical cell coordinate type and serialization utilities.
 *
 * Implements: docs/architecture/adr-0005-cell-coord.md
 * Design doc: design/gdd/grid-explosion.md § A-1 (grid structure)
 *
 * Invariants (adr-0005):
 *  1. ALL game-logic cell references use CellCoord. CellIndex is serialization-only.
 *  2. row, col ∈ [0, GRID_SIZE−1]. Out-of-range values caught by isValidCell().
 *  3. Round-trip: cellToIndex(indexToCell(n)) === n for all n ∈ [0, GRID_TOTAL−1].
 */

import { CellCoord } from '../types/Domain';
import { GRID_SIZE } from './GridConstants';

export { CellCoord };

/**
 * Serialization-only integer representation of a cell (0–63, row*8+col).
 * Must NOT appear in game logic — only at WebSocket send/receive boundaries.
 */
export type CellIndex = number;

/**
 * Convert a CellCoord to its compact integer serialization index.
 * @example cellToIndex({ row: 3, col: 5 }) // → 29
 */
export function cellToIndex(c: CellCoord): CellIndex {
  return c.row * GRID_SIZE + c.col;
}

/**
 * Convert a serialization index back to a CellCoord.
 * @example indexToCell(29) // → { row: 3, col: 5 }
 */
export function indexToCell(index: CellIndex): CellCoord {
  return { row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE };
}

/**
 * Guard: returns true iff both row and col are within [0, GRID_SIZE−1].
 * Use this before any operation that assumes a valid cell.
 */
export function isValidCell(c: CellCoord): boolean {
  return c.row >= 0 && c.row < GRID_SIZE && c.col >= 0 && c.col < GRID_SIZE;
}

/**
 * Value equality for two CellCoords.
 * Required because CellCoord is a plain object — `===` compares references.
 * @example cellEquals({ row: 1, col: 2 }, { row: 1, col: 2 }) // → true
 */
export function cellEquals(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}
