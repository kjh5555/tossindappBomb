/**
 * Direction8.ts
 * 8-directional movement constants and angle-to-direction conversion.
 *
 * Implements: design/gdd/player-movement.md § F-2 (direction delta table)
 * Story: story-001 (player movement — validation + position update)
 *
 * Direction encoding (clockwise from East, 0-indexed):
 *   0=right  1=down-right  2=down  3=down-left
 *   4=left   5=up-left     6=up    7=up-right
 */

// ---------------------------------------------------------------------------
// Tuning knobs (data-driven — config loader overrides these at runtime)
// ---------------------------------------------------------------------------

/**
 * Minimum joystick displacement (px) required to register a move.
 * Below this threshold, tryMove() returns false without updating position.
 * Tuning knob for story-001. Safe range: 10–30 px.
 */
export const JOY_THRESHOLD = 18; // px

/**
 * Minimum interval (seconds) between repeated moves when joystick is held.
 * Used by story-002 auto-repeat logic. Exported here as canonical default.
 * Tuning knob. Safe range: 0.15–0.35 s.
 */
export const MOVE_REPEAT = 0.22; // seconds

// ---------------------------------------------------------------------------
// Direction type
// ---------------------------------------------------------------------------

/**
 * Integer in [0, 7] encoding one of the 8 movement directions.
 * 0=right, 1=down-right, 2=down, 3=down-left,
 * 4=left, 5=up-left, 6=up, 7=up-right (clockwise from East).
 */
export type Direction8 = number;

// ---------------------------------------------------------------------------
// Delta table — F-2
// ---------------------------------------------------------------------------

/**
 * Per-direction grid delta (dRow, dCol).
 * Row increases downward (screen space). Col increases rightward.
 *
 * F-2 (player-movement.md):
 *   direction 0 (right):      dRow= 0, dCol=+1
 *   direction 1 (down-right): dRow=+1, dCol=+1
 *   direction 2 (down):       dRow=+1, dCol= 0
 *   direction 3 (down-left):  dRow=+1, dCol=-1
 *   direction 4 (left):       dRow= 0, dCol=-1
 *   direction 5 (up-left):    dRow=-1, dCol=-1
 *   direction 6 (up):         dRow=-1, dCol= 0
 *   direction 7 (up-right):   dRow=-1, dCol=+1
 *
 * @example
 *   const { dRow, dCol } = DELTA[direction];
 *   const target = { row: current.row + dRow, col: current.col + dCol };
 */
export const DELTA: Record<number, { dRow: number; dCol: number }> = {
  0: { dRow:  0, dCol:  1 }, // right
  1: { dRow:  1, dCol:  1 }, // down-right
  2: { dRow:  1, dCol:  0 }, // down
  3: { dRow:  1, dCol: -1 }, // down-left
  4: { dRow:  0, dCol: -1 }, // left
  5: { dRow: -1, dCol: -1 }, // up-left
  6: { dRow: -1, dCol:  0 }, // up
  7: { dRow: -1, dCol:  1 }, // up-right
};

// ---------------------------------------------------------------------------
// Angle → Direction8 conversion
// ---------------------------------------------------------------------------

/**
 * Convert a joystick angle (degrees, any range) to a Direction8 integer.
 *
 * Normalizes the input angle to [0, 360) then maps to the nearest
 * 45-degree sector. Negative angles and angles ≥ 360 are handled correctly.
 *
 * Formula (player-movement.md § F-2):
 *   normalized = ((angleDeg % 360) + 360) % 360
 *   direction  = round(normalized / 45) % 8
 *
 * @param angleDeg - Joystick angle in degrees. May be negative or > 360.
 * @returns Direction8 integer in [0, 7].
 *
 * @example
 *   angleToDirection8(0)    // → 0  (right)
 *   angleToDirection8(90)   // → 2  (down)
 *   angleToDirection8(-90)  // → 6  (up, normalizes to 270°)
 *   angleToDirection8(360)  // → 0  (right, wraps to 0°)
 */
export function angleToDirection8(angleDeg: number): Direction8 {
  const normalized = ((angleDeg % 360) + 360) % 360;
  return Math.round(normalized / 45) % 8;
}
