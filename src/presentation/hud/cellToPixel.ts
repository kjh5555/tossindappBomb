/**
 * cellToPixel.ts
 * Pure coordinate transform from logical CellCoord to pixel space.
 *
 * Implements: production/epics/hud/story-002-grid-render.md
 * Governed by: ADR-0015 (no absolute pixel hardcoding) + ADR-0016 (HUDLayer-local coords)
 *
 * Convention: row index increases downward (origin top-left in grid space, but
 * caller picks the y direction by choosing gridOrigin and cellSize sign).
 */

export interface PixelOrigin {
  x: number;
  y: number;
}

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Convert a CellCoord to pixel coordinates relative to the grid origin.
 *
 * @param cell        - logical cell coordinate (row, col)
 * @param gridOrigin  - pixel coordinates of grid (0,0) cell — HUDLayer-local
 * @param cellSize    - per-cell pixel size (square cells assumed)
 * @returns pixel position of the cell's anchor point
 *
 * @example
 *   cellToPixel({row: 2, col: 3}, {x: 10, y: 20}, 40) // → {x: 130, y: 100}
 */
export function cellToPixel(
  cell: { row: number; col: number },
  gridOrigin: PixelOrigin,
  cellSize: number,
): PixelPoint {
  return {
    x: gridOrigin.x + cell.col * cellSize,
    y: gridOrigin.y + cell.row * cellSize,
  };
}
