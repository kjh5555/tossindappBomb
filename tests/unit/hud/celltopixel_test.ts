/**
 * cellToPixel unit test — Sprint 5 S5-M3 / Story 002 (AC-GRID-99)
 *
 * Pure utility: logical CellCoord → pixel position relative to a grid origin.
 */

import { cellToPixel } from '../../../src/presentation/hud/cellToPixel';

describe('cellToPixel — pure coord transform', () => {
  test('AC-GRID-99: row=2, col=3 with origin {10,20} and cellSize 40 → {130, 100}', () => {
    const result = cellToPixel({ row: 2, col: 3 }, { x: 10, y: 20 }, 40);
    expect(result).toEqual({ x: 130, y: 100 });
  });

  test('origin (0,0) with cellSize 1 returns (col, row)', () => {
    expect(cellToPixel({ row: 5, col: 7 }, { x: 0, y: 0 }, 1)).toEqual({ x: 7, y: 5 });
  });

  test('cell (0,0) returns the grid origin verbatim', () => {
    expect(cellToPixel({ row: 0, col: 0 }, { x: 100, y: 200 }, 50)).toEqual({ x: 100, y: 200 });
  });

  test('non-integer cellSize is supported (no rounding applied)', () => {
    expect(cellToPixel({ row: 1, col: 1 }, { x: 0, y: 0 }, 12.5)).toEqual({ x: 12.5, y: 12.5 });
  });

  test('negative cellSize flips axis (caller may use this for screen-space y-down)', () => {
    expect(cellToPixel({ row: 1, col: 0 }, { x: 0, y: 100 }, -20)).toEqual({ x: 0, y: 80 });
  });

  test('does not mutate inputs', () => {
    const cell = { row: 3, col: 4 };
    const origin = { x: 5, y: 5 };
    cellToPixel(cell, origin, 10);
    expect(cell).toEqual({ row: 3, col: 4 });
    expect(origin).toEqual({ x: 5, y: 5 });
  });
});
