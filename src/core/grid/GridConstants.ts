/**
 * GridConstants.ts
 * Gate-period and safety constants for the Grid Explosion System.
 *
 * Implements: design/gdd/grid-explosion.md § Tuning Knobs, § Formulas F-1–F-4
 * Governed by: docs/architecture/adr-0006-gate-period.md (F-RE-1 formula)
 *
 * ALL values must be loaded from external config at runtime.
 * These exports serve as the canonical defaults referenced by config loaders.
 * Never hardcode these values in gameplay logic — always read from config.
 */

// ---------------------------------------------------------------------------
// Grid dimensions
// ---------------------------------------------------------------------------

/** Total number of rows (and columns) in the 8×8 grid. */
export const GRID_SIZE = 8;

/** Total cells in the grid: GRID_SIZE × GRID_SIZE. */
export const GRID_TOTAL = GRID_SIZE * GRID_SIZE; // 64

// ---------------------------------------------------------------------------
// Gate cycle timing (F-1, F-RE-1 — adr-0006)
// ---------------------------------------------------------------------------

/**
 * Base gate period (seconds) — Round 1 default.
 * F-RE-1: GATE_PERIOD(R) = max(GATE_PERIOD_FLOOR, GATE_PERIOD_BASE − (R−1) × GATE_PERIOD_STEP)
 * Confirmed value: 2.0 s (prototypes/grid-core v4)
 */
export const GATE_PERIOD_BASE = 2.0;

/**
 * Minimum gate period floor (seconds).
 * MUST be ≥ 1.2 s to preserve SAFE_WIN_MIN = 0.45 s invariant.
 * adr-0006: GATE_PERIOD_FLOOR ≥ 1.2 s is a hard constraint.
 * Confirmed value: 1.4 s
 */
export const GATE_PERIOD_FLOOR = 1.4;

/**
 * Per-round gate period decrement (seconds/round).
 * Safe tuning range: 0.03–0.08 s.
 * Confirmed value: 0.05 s
 */
export const GATE_PERIOD_STEP = 0.05;

/**
 * Explosion duration (seconds) — Exploded state hold time.
 * Independent of GATE_PERIOD changes (adr-0006 § EC-5).
 * Confirmed value: 0.35 s (prototypes/grid-core v4)
 */
export const T_EX = 0.35;

/**
 * Minimum safe window the player must always have.
 * Invariant: GATE_PERIOD(R) − T_EX ≥ SAFE_WIN_MIN for all R.
 * With defaults: GATE_PERIOD_FLOOR(1.4) − T_EX(0.35) = 1.05 ≥ 0.45 ✓
 */
export const SAFE_WIN_MIN = 0.45;

// ---------------------------------------------------------------------------
// Pattern safety contract (A-7 — grid-explosion.md)
// ---------------------------------------------------------------------------

/**
 * Minimum number of non-gate (always-Idle) cells that must remain
 * after a pattern is applied.
 * Default: 8 (12.5% of 64 cells). Safe range: 4–16.
 */
export const MIN_SAFE_CELLS = 8;

// ---------------------------------------------------------------------------
// System stability (EC-6 / GRID_STALLED — grid-explosion.md)
// ---------------------------------------------------------------------------

/**
 * Maximum time (seconds) GridSimulation waits for a valid pattern
 * before emitting GRID_STALLED.
 * Default: 3.0 s. Safe range: 1.0–5.0 s.
 */
export const PATTERN_TIMEOUT = 3.0;

// ---------------------------------------------------------------------------
// Wave stagger (F-1 offset guidance)
// ---------------------------------------------------------------------------

/**
 * Default stagger interval (seconds) between gate offsets when assigning
 * wave phases to multiple gates.
 * Default: 0.5 s. Safe range: 0.2–1.0 s.
 */
export const GATE_STAGGER = 0.5;
