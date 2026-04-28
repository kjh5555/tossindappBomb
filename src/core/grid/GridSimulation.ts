/**
 * GridSimulation.ts
 * Core cell state machine for the Grid Explosion System (Cyclic v4 model).
 *
 * Implements: design/gdd/grid-explosion.md
 *   § A-1 (grid structure), A-2 (gate assignment), A-3 (cyclic 2-state),
 *   § A-4 (explosion judgment), A-5 (hazard window), A-6 (simultaneous),
 *   § A-7 (safe-cell contract), A-8 (setGatePeriod API)
 *   § F-1 (gate cycle formula), F-4 (hazard cell ratio)
 *   § EC-1–EC-7
 *
 * Governed by:
 *   docs/architecture/adr-0005-cell-coord.md  — CellCoord canonical type
 *   docs/architecture/adr-0006-gate-period.md — setGatePeriod contract + F-RE-1
 *   docs/architecture/adr-0003-layer-boundaries.md — Exception 1 (direct call from RoundManager)
 *
 * State machine (per gate cell):
 *   IDLE ──(phase ≥ SAFE_WIN)──▶ EXPLODED ──(T_EX elapsed)──▶ IDLE
 *   Non-gate cells: always IDLE, no transitions.
 *
 * Thread-safety: single-threaded (Cocos Creator main thread only).
 */

import { CellCoord, CellState, PlayerId } from '../types/Domain';
import { IEventBus } from '../events/IEventBus';
import { IFrameClock } from '../time/IFrameClock';
import { cellEquals, isValidCell, cellToIndex } from './CellCoord';
import {
  GATE_PERIOD_BASE,
  GATE_PERIOD_FLOOR,
  T_EX,
  MIN_SAFE_CELLS,
  PATTERN_TIMEOUT,
  GRID_TOTAL,
} from './GridConstants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Pattern injected by the PatternLibrary at round start.
 * bfsVerified=true means PatternLibrary already ran the BFS connectivity check.
 */
export interface ExplodePattern {
  patternId: string;
  cells: CellCoord[];
  /** PatternLibrary BFS connectivity pre-check result (A-7, F-5). */
  bfsVerified: boolean;
}

/**
 * Extended CellState that includes NON_GATE for cells outside the current pattern.
 * Used only by the public query API getCellState().
 */
export type QueryCellState = CellState | 'NON_GATE';

// ---------------------------------------------------------------------------
// Internal per-cell state record
// ---------------------------------------------------------------------------

interface GateCell {
  coord: CellCoord;
  /** Phase offset (seconds). Each gate starts with a unique phase so gates stagger. */
  offset: number;
  state: CellState;
  /**
   * Absolute simulatedTime at which the current state expires and the next
   * transition should fire.
   *
   * - IDLE:     nextTransitionAt = stateEnteredAt + SAFE_WIN
   * - EXPLODED: nextTransitionAt = stateEnteredAt + T_EX
   */
  nextTransitionAt: number;
  /** Absolute time when the current state was entered (used for T_EX preservation on setGatePeriod). */
  stateEnteredAt: number;
}

// ---------------------------------------------------------------------------
// GridSimulation
// ---------------------------------------------------------------------------

export class GridSimulation {
  // Map from cellToIndex(coord) → GateCell for O(1) lookup
  private readonly gateCells = new Map<number, GateCell>();

  private currentGatePeriod: number = GATE_PERIOD_BASE;

  /**
   * Absolute simulatedTime after which GRID_STALLED fires if no valid pattern
   * has arrived.  null means the stall timer is not running.
   */
  private stalledFireAt: number | null = null;
  private stalledFired = false;

  /**
   * Set of player IDs that are already DEAD this frame — prevents double-kill
   * across simultaneous explosions (EC-1, AC-21).
   */
  private deadThisFrame = new Set<PlayerId>();

  constructor(
    private readonly bus: IEventBus,
    private readonly clock: IFrameClock,
  ) {}

  // --------------------------------------------------------------------------
  // Public API — pattern injection
  // --------------------------------------------------------------------------

  /**
   * Receive a pattern from the PatternLibrary and activate gate timers.
   * Validates A-7 safety contract; emits PATTERN_REJECTED on failure.
   * On success, resets the stall timer.
   *
   * @param pattern  - ExplodePattern from PatternLibrary
   * @param playerPositions - current live player positions for explosion judgment
   */
  applyPattern(pattern: ExplodePattern, playerPositions: Map<PlayerId, CellCoord>): void {
    // --- A-7: validate safe-cell count ---
    const gateCellCount = pattern.cells.filter(isValidCell).length;
    const safeCellCount = GRID_TOTAL - gateCellCount;

    if (safeCellCount < MIN_SAFE_CELLS) {
      this.bus.emit('PATTERN_REJECTED', {
        patternId: pattern.patternId,
        reason: `Safe cell count ${safeCellCount} < MIN_SAFE_CELLS ${MIN_SAFE_CELLS}`,
        timestamp: this.clock.now(),
      });
      this.startStallTimer();
      return;
    }

    // --- A-7: validate BFS connectivity (patternLibrary pre-check) ---
    if (!pattern.bfsVerified) {
      this.bus.emit('PATTERN_REJECTED', {
        patternId: pattern.patternId,
        reason: 'bfsVerified=false — safe cells not connected (F-5)',
        timestamp: this.clock.now(),
      });
      this.startStallTimer();
      return;
    }

    // --- A-7: validate cell coordinates (EC-7) ---
    for (const cell of pattern.cells) {
      if (!isValidCell(cell)) {
        console.warn(
          `[GridSimulation] applyPattern: out-of-range coord {row:${cell.row},col:${cell.col}} ignored`,
        );
      }
    }

    // --- Clear previous gates (new pattern supersedes old one) ---
    this.gateCells.clear();

    // --- Assign cyclic timers to valid gate cells ---
    const now = this.clock.now();
    const safeWin = this.currentGatePeriod - T_EX;

    let offsetIndex = 0;
    for (const cell of pattern.cells) {
      if (!isValidCell(cell)) continue;

      const idx = cellToIndex(cell);
      // Preserve existing offset if this cell was already a gate (A-2-4 — rhythm continuity)
      const existing = this.gateCells.get(idx);
      const offset = existing ? existing.offset : offsetIndex * (this.currentGatePeriod / Math.max(1, pattern.cells.length));
      offsetIndex++;

      // Compute phase at current time to determine initial state
      const phase = this.computePhase(now, offset);
      const isExploded = phase >= safeWin;

      const stateEnteredAt = isExploded
        ? now - (phase - safeWin)        // entered Exploded some time ago
        : now - phase;                    // entered Idle some time ago

      const nextTransitionAt = isExploded
        ? stateEnteredAt + T_EX
        : stateEnteredAt + safeWin;

      this.gateCells.set(idx, {
        coord: cell,
        offset,
        state: isExploded ? 'EXPLODED' : 'IDLE',
        nextTransitionAt,
        stateEnteredAt,
      });
    }

    // --- Cancel stall timer — valid pattern received ---
    this.stalledFireAt = null;
    this.stalledFired = false;

    // --- Broadcast initial state for each gate cell ---
    for (const gate of this.gateCells.values()) {
      this.bus.emit('CELL_STATE_CHANGED', {
        cell: gate.coord,
        state: gate.state,
        timestamp: now,
      });

      // If a gate starts in Exploded, run explosion judgment immediately (A-4)
      if (gate.state === 'EXPLODED') {
        this.runExplosionJudgment(gate, playerPositions, now);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Public API — setGatePeriod (ADR-0003 Exception 1)
  // --------------------------------------------------------------------------

  /**
   * Update the gate period for all active gates.
   * MUST only be called from RoundManager.startRound() (ADR-0003 Exception 1).
   *
   * Precondition: seconds ∈ [GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]
   * Effect: all gate cell periods updated immediately; each cell's cyclic offset
   *         is preserved (rhythm continuity, A-8, EC-5).
   * T_EX is NOT changed by this call.
   *
   * @param seconds - new gate period in seconds
   */
  setGatePeriod(seconds: number): void {
    if (seconds < GATE_PERIOD_FLOOR || seconds > GATE_PERIOD_BASE) {
      console.warn(
        `[GridSimulation] setGatePeriod: ${seconds}s outside valid range ` +
          `[${GATE_PERIOD_FLOOR}, ${GATE_PERIOD_BASE}]. Rejected.`,
      );
      return;
    }

    this.currentGatePeriod = seconds;
    const now = this.clock.now();
    const newSafeWin = seconds - T_EX;

    // Update each gate cell: recalculate nextTransitionAt with new period,
    // preserve offset and current state (EC-5).
    for (const gate of this.gateCells.values()) {
      if (gate.state === 'IDLE') {
        // Recalculate remaining Idle time with new SAFE_WIN
        // Preserve phase continuity: keep offset, recalculate from stateEnteredAt
        gate.nextTransitionAt = gate.stateEnteredAt + newSafeWin;
        // If the new transition time is already in the past, fire immediately next tick
        if (gate.nextTransitionAt <= now) {
          gate.nextTransitionAt = now; // will fire on next update()
        }
      }
      // If EXPLODED: T_EX is independent — nextTransitionAt stays unchanged (EC-5)
    }
  }

  // --------------------------------------------------------------------------
  // Public API — update (called each frame by FrameClock / tick integration)
  // --------------------------------------------------------------------------

  /**
   * Advance the simulation by dt seconds.
   * Fires state transitions for all gate cells whose timer has expired.
   * Must be called once per game tick (frame-rate independent via delta time).
   *
   * @param playerPositions - live player positions map for explosion judgment
   */
  update(playerPositions: Map<PlayerId, CellCoord>): void {
    const now = this.clock.now();

    // Reset per-frame dead set so duplicate-kill guard is frame-scoped (AC-21)
    this.deadThisFrame.clear();

    // --- Check stall timer ---
    if (
      this.stalledFireAt !== null &&
      !this.stalledFired &&
      now >= this.stalledFireAt
    ) {
      this.stalledFired = true;
      this.bus.emit('GRID_STALLED', { roundNumber: 0, timestamp: now });
    }

    // --- Process gate cell transitions ---
    for (const gate of this.gateCells.values()) {
      if (now < gate.nextTransitionAt) continue;

      if (gate.state === 'IDLE') {
        this.transitionToExploded(gate, playerPositions, now);
      } else {
        this.transitionToIdle(gate, now);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Public API — landing judgment (called by PlayerMovement on PLAYER_ARRIVED)
  // --------------------------------------------------------------------------

  /**
   * Check if a player has landed on an Exploded cell (A-5 hazard window).
   * Emits PLAYER_KILLED with cause=DANGER_ZONE if so.
   *
   * @param playerId - the arriving player
   * @param cell     - the cell the player just landed on
   */
  onPlayerArrived(playerId: PlayerId, cell: CellCoord): void {
    if (!isValidCell(cell)) {
      console.warn(
        `[GridSimulation] onPlayerArrived: out-of-range coord ` +
          `{row:${cell.row},col:${cell.col}}`,
      );
      return;
    }

    const gate = this.gateCells.get(cellToIndex(cell));
    if (!gate || gate.state !== 'EXPLODED') return;
    if (this.deadThisFrame.has(playerId)) return;

    this.deadThisFrame.add(playerId);
    this.bus.emit('PLAYER_KILLED', {
      playerIds: [playerId],
      cellId: cell,
      cause: 'DANGER_ZONE',
      timestamp: this.clock.now(),
    });
  }

  // --------------------------------------------------------------------------
  // Public query API (pull-based, for RoundManager / HUD)
  // --------------------------------------------------------------------------

  /**
   * Query the current state of a cell.
   * Returns 'NON_GATE' for cells not in the active pattern.
   * Returns 'IDLE' or 'EXPLODED' for active gate cells.
   * Out-of-range coords always return 'NON_GATE' with a warning.
   */
  getCellState(cell: CellCoord): QueryCellState {
    if (!isValidCell(cell)) {
      console.warn(
        `[GridSimulation] getCellState: out-of-range coord ` +
          `{row:${cell.row},col:${cell.col}}`,
      );
      return 'NON_GATE';
    }
    const gate = this.gateCells.get(cellToIndex(cell));
    if (!gate) return 'NON_GATE';
    return gate.state;
  }

  /**
   * Time (seconds) until the next Idle→Exploded transition for a gate cell.
   * Returns null for non-gate cells or cells currently Exploded.
   * Used by RoundManager for Goal Cell preview (GDD § Interactions).
   */
  nextExplosionTime(cell: CellCoord): number | null {
    if (!isValidCell(cell)) return null;
    const gate = this.gateCells.get(cellToIndex(cell));
    if (!gate) return null;
    if (gate.state === 'EXPLODED') return null;
    const remaining = gate.nextTransitionAt - this.clock.now();
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Returns the current gate period in seconds.
   * Used by HUD / debug overlays.
   */
  getGatePeriod(): number {
    return this.currentGatePeriod;
  }

  // --------------------------------------------------------------------------
  // Private — state transition helpers
  // --------------------------------------------------------------------------

  private transitionToExploded(
    gate: GateCell,
    playerPositions: Map<PlayerId, CellCoord>,
    now: number,
  ): void {
    gate.state = 'EXPLODED';
    gate.stateEnteredAt = now;
    gate.nextTransitionAt = now + T_EX;

    // Emit state change first (AC-4)
    this.bus.emit('CELL_STATE_CHANGED', {
      cell: gate.coord,
      state: 'EXPLODED',
      timestamp: now,
    });

    // Explosion judgment (A-4)
    this.runExplosionJudgment(gate, playerPositions, now);

    // Audio fire-and-forget (GDD § Interactions → audio system)
    this.bus.emit('AUDIO_EVENT', { key: 'EXPLOSION', cellId: gate.coord });
  }

  private transitionToIdle(gate: GateCell, now: number): void {
    gate.state = 'IDLE';
    gate.stateEnteredAt = now;
    gate.nextTransitionAt = now + (this.currentGatePeriod - T_EX);

    this.bus.emit('CELL_STATE_CHANGED', {
      cell: gate.coord,
      state: 'IDLE',
      timestamp: now,
    });

    // Optional audio: gate-safe tick
    this.bus.emit('AUDIO_EVENT', { key: 'GATE_SAFE', cellId: gate.coord });
  }

  /**
   * Run explosion kill judgment for a cell that just became Exploded (A-4).
   * Collects all players on this cell; emits PLAYER_KILLED and CELL_EXPLODED.
   * Already-dead players (deadThisFrame) are excluded (AC-21, EC-1).
   */
  private runExplosionJudgment(
    gate: GateCell,
    playerPositions: Map<PlayerId, CellCoord>,
    now: number,
  ): void {
    const killedIds: PlayerId[] = [];

    for (const [playerId, pos] of playerPositions) {
      if (this.deadThisFrame.has(playerId)) continue;
      if (cellEquals(pos, gate.coord)) {
        killedIds.push(playerId);
        this.deadThisFrame.add(playerId);
      }
    }

    if (killedIds.length > 0) {
      this.bus.emit('PLAYER_KILLED', {
        playerIds: killedIds,
        cellId: gate.coord,
        cause: 'EXPLOSION',
        timestamp: now,
      });
    }

    // Always emit CELL_EXPLODED (even with no kills — AC-17)
    this.bus.emit('CELL_EXPLODED', {
      cell: gate.coord,
      timestamp: now,
    });
  }

  // --------------------------------------------------------------------------
  // Private — stall timer
  // --------------------------------------------------------------------------

  private startStallTimer(): void {
    if (this.stalledFireAt !== null) return; // already running
    this.stalledFireAt = this.clock.now() + PATTERN_TIMEOUT;
    this.stalledFired = false;
  }

  // --------------------------------------------------------------------------
  // Private — phase formula (F-1)
  // --------------------------------------------------------------------------

  /**
   * Computes the cyclic phase of a gate at time `t` with the given `offset`.
   * F-1: phase(t) = ((t + offset) mod GATE_PERIOD + GATE_PERIOD) mod GATE_PERIOD
   */
  private computePhase(t: number, offset: number): number {
    const p = this.currentGatePeriod;
    return ((t + offset) % p + p) % p;
  }
}
