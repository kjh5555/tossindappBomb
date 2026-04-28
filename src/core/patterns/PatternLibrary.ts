/**
 * PatternLibrary.ts
 * Core service for pattern record transformation, deterministic selection,
 * and runtime validation with GRID_STALLED chain.
 *
 * Implements: design/gdd/pattern-library.md § A-3 (PatternLibrary contract)
 * Story: story-001 (toExplodePattern), story-002 (selectPattern + recency window),
 *        story-003 (getPattern, runtime BFS validation, GRID_STALLED chain)
 *
 * Dependency injection: PatternLibrary implements IPatternLibrary so callers
 * depend on the interface, not the concrete class.
 */

import { PatternRecord, ExplodePattern, DifficultyContext } from './PatternTypes';
import { CellCoord, cellEquals } from '../grid/CellCoord';
import { PATTERNS } from './PatternData';
import { GRID_SIZE, GRID_TOTAL, MIN_SAFE_CELLS } from '../grid/GridConstants';
import type { IFrameClock } from '../time/IFrameClock';
import type { IEventBus } from '../events/IEventBus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of recently used patternIds excluded from selection candidates.
 * N_recent per call = min(MAX_RECENT_WINDOW, floor(tier_pool_size / 2)).
 */
export const MAX_RECENT_WINDOW = 3;

/**
 * Number of consecutive validation failures before GRID_STALLED is emitted.
 * ADR-0009: exactly 3 failures trigger the stalled event.
 */
export const MAX_RETRY_COUNT = 3;

// Re-export so callers don't need to import GridConstants separately.
export { MIN_SAFE_CELLS };

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Contract for the pattern library service.
 *
 * @example
 *   const lib: IPatternLibrary = new PatternLibrary();
 *   const pattern = lib.selectPattern({ tier: 1, roundNumber: 3 }, seed);
 */
export interface IPatternLibrary {
  toExplodePattern(record: PatternRecord): ExplodePattern;
  selectPattern(ctx: DifficultyContext, seed: number): ExplodePattern | null;
  resetSession(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * PatternLibrary
 * Deterministic pattern selection with recency-window exclusion and
 * runtime BFS validation (story-003).
 *
 * Construct with clock + eventBus to enable getPattern(). The story-001/002
 * methods (selectPattern, toExplodePattern) work without them.
 *
 * @example
 *   const lib = new PatternLibrary(PATTERNS, clock, eventBus);
 *   lib.getPattern({ tier: 1, roundNumber: 1 }, serverSeed);
 */
export class PatternLibrary implements IPatternLibrary {
  /** Ring buffer of recently selected patternIds. Capped at MAX_RECENT_WINDOW. */
  private recentIds: string[] = [];

  /** Consecutive validation failure count. Resets on ROUND_STARTED or success. */
  private failCount = 0;

  /** All 64 grid coordinates, pre-computed once. */
  private static readonly ALL_COORDS: readonly CellCoord[] = Array.from(
    { length: GRID_TOTAL },
    (_, i): CellCoord => ({ row: Math.floor(i / GRID_SIZE), col: i % GRID_SIZE }),
  );

  /**
   * @param patternPool - Pattern pool (defaults to PATTERNS; override for testing).
   * @param clock       - Frame clock for timestamps in story-003 events.
   * @param eventBus    - Event bus for PATTERN_REJECTED / PATTERN_READY / GRID_STALLED.
   */
  constructor(
    private readonly patternPool: readonly PatternRecord[] = PATTERNS,
    private readonly clock?: IFrameClock,
    private readonly eventBus?: IEventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Story-001
  // ---------------------------------------------------------------------------

  /**
   * Convert a PatternRecord to an ExplodePattern.
   * Metadata (tier, category, symmetryAxis, bfsVerified) is intentionally stripped.
   *
   * @example lib.toExplodePattern(PATTERNS[0]);
   */
  toExplodePattern(record: PatternRecord): ExplodePattern {
    return {
      cells: record.cells,
      patternId: record.patternId,
    };
  }

  // ---------------------------------------------------------------------------
  // Story-002
  // ---------------------------------------------------------------------------

  /**
   * Select a pattern deterministically (story-002 algorithm).
   * Returns null when no candidates exist → caller emits GRID_STALLED.
   *
   * @param ctx  - Difficulty context.
   * @param seed - Non-negative integer from server; same seed + pool → same result.
   *
   * @example const p = lib.selectPattern({ tier: 2, roundNumber: 5 }, 42);
   */
  selectPattern(ctx: DifficultyContext, seed: number): ExplodePattern | null {
    const tierPool = this.patternPool.filter(p => p.tier === ctx.tier && p.bfsVerified);
    if (tierPool.length === 0) return null;

    const nRecent = Math.min(MAX_RECENT_WINDOW, Math.floor(tierPool.length / 2));

    let window = nRecent;
    let candidates: PatternRecord[] = [];
    while (window >= 0) {
      const excluded = window > 0 ? this.recentIds.slice(-window) : [];
      candidates = tierPool.filter(p => !excluded.includes(p.patternId));
      if (candidates.length > 0) break;
      window--;
    }

    if (candidates.length === 0) return null;

    const record = candidates[seed % candidates.length];
    this.recentIds.push(record.patternId);
    if (this.recentIds.length > MAX_RECENT_WINDOW) {
      this.recentIds.shift();
    }

    return this.toExplodePattern(record);
  }

  /**
   * Reset the recency ring buffer for a new game session.
   *
   * @example lib.resetSession();
   */
  resetSession(): void {
    this.recentIds = [];
  }

  // ---------------------------------------------------------------------------
  // Story-003: runtime validation + GRID_STALLED chain
  // ---------------------------------------------------------------------------

  /**
   * Select, validate, and emit a pattern (ADR-0009 primary path).
   *
   * Steps:
   *  0. Guard invalid tier → emit PATTERN_REJECTED(INVALID_TIER), fallback to tier=1.
   *  1. selectPattern() → null → handleFailure().
   *  2. Runtime secondary BFS: MIN_SAFE_CELLS check + single-region BFS.
   *     Failure → emit PATTERN_REJECTED, handleFailure().
   *  3. Valid → emit PATTERN_READY, reset failCount.
   *
   * GRID_STALLED is emitted by handleFailure() after MAX_RETRY_COUNT consecutive
   * failures. The stalledFallback caller (RoundEscalation, Feature layer) demotes
   * tier by 1 and calls getPattern again.
   *
   * Requires clock and eventBus to be provided to the constructor.
   *
   * @param ctx             - Difficulty context (tier may be invalid — guarded at runtime).
   * @param seed            - Server seed for deterministic selection.
   * @param stalledFallback - True when called from the GRID_STALLED recovery path.
   *
   * @example lib.getPattern({ tier: 2, roundNumber: 3 }, serverSeed);
   */
  getPattern(ctx: DifficultyContext, seed: number, stalledFallback = false): void {
    if (!this.clock || !this.eventBus) {
      throw new Error('PatternLibrary.getPattern requires clock and eventBus in constructor');
    }

    // Step 0: invalid tier guard (AC-PL-9)
    let effectiveCtx: DifficultyContext = ctx;
    if ((ctx.tier as number) < 1 || (ctx.tier as number) > 3) {
      this.eventBus.emit('PATTERN_REJECTED', {
        patternId: null,
        reason: 'INVALID_TIER',
        timestamp: this.clock.now(),
      });
      effectiveCtx = { ...ctx, tier: 1 };
    }

    // Step 1: candidate selection
    const pattern = this.selectPattern(effectiveCtx, seed);
    if (pattern === null) {
      this.handleFailure(ctx.roundNumber);
      return;
    }

    // Step 2a: MIN_SAFE_CELLS check
    const safeCells = PatternLibrary.ALL_COORDS.filter(
      c => !pattern.cells.some(g => cellEquals(g, c)),
    );
    if (safeCells.length < MIN_SAFE_CELLS) {
      this.eventBus.emit('PATTERN_REJECTED', {
        patternId: pattern.patternId,
        reason: 'MIN_SAFE_CELLS',
        timestamp: this.clock.now(),
      });
      this.handleFailure(ctx.roundNumber);
      return;
    }

    // Step 2b: BFS single connected-region check
    const bfsReached = PatternLibrary.bfs4(safeCells);
    if (bfsReached !== safeCells.length) {
      this.eventBus.emit('PATTERN_REJECTED', {
        patternId: pattern.patternId,
        reason: 'BFS_DISCONNECTED',
        timestamp: this.clock.now(),
      });
      this.handleFailure(ctx.roundNumber);
      return;
    }

    // Step 3: valid — hand off to GridSimulation via EventBus
    this.failCount = 0;
    this.eventBus.emit('PATTERN_READY', {
      pattern,
      timestamp: this.clock.now(),
    });
  }

  /**
   * Reset fail counter and recency buffer at the start of each round.
   * Call when ROUND_STARTED is received.
   */
  onRoundStarted(): void {
    this.failCount = 0;
    this.recentIds = [];
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Increment failCount; emit GRID_STALLED and reset after MAX_RETRY_COUNT. */
  private handleFailure(roundNumber: number): void {
    this.failCount++;
    if (this.failCount >= MAX_RETRY_COUNT) {
      this.eventBus!.emit('GRID_STALLED', {
        roundNumber,
        timestamp: this.clock!.now(),
      });
      this.failCount = 0;
    }
  }

  /**
   * BFS 4-connectivity check over a set of cells.
   * Returns the number of cells reachable from the first cell via 4-directional
   * adjacency. If all cells are connected, returns cells.length.
   */
  private static bfs4(cells: readonly CellCoord[]): number {
    if (cells.length === 0) return 0;

    const key = (c: CellCoord) => c.row * GRID_SIZE + c.col;
    const cellSet = new Set(cells.map(key));
    const visited = new Set<number>();
    const queue: CellCoord[] = [{ ...cells[0] }];
    visited.add(key(cells[0]));

    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const [dr, dc] of DIRS) {
        const next = { row: curr.row + dr, col: curr.col + dc };
        const k = key(next);
        if (cellSet.has(k) && !visited.has(k)) {
          visited.add(k);
          queue.push(next);
        }
      }
    }

    return visited.size;
  }

  // ---------------------------------------------------------------------------
  // Package-private helpers (accessible via (lib as any) in unit tests)
  // ---------------------------------------------------------------------------

  get _recentIds(): readonly string[] { return this.recentIds; }
  get _failCount(): number { return this.failCount; }
}
