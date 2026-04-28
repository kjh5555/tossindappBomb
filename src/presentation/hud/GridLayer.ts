/**
 * GridLayer.ts
 * Presentation-layer grid renderer. Maintains 64 pre-allocated cell visuals and
 * syncs them to GridSimulation state via CELL_STATE_CHANGED + GOAL_PLACED events.
 *
 * Implements: production/epics/hud/story-002-grid-render.md
 * Governed by:
 *   ADR-0016 (HUD Safe Area + Audio): GridLayer z-order = 10, HUDLayer-local coords
 *   ADR-0015 (DeathReplay Rendering):  z-order contract (GridLayer z:10)
 *   ADR-0006 (Gate Period):            CELL_STATE_CHANGED contract
 *   ADR-0011 (Round Phase FSM):        GOAL_PLACED contract
 *
 * Design:
 *  - 64 CellVisual records pre-allocated at construction. Never reallocated —
 *    state mutated in place to maintain zero-alloc hot path.
 *  - The CellVisual model is Cocos-agnostic (`{ state, highlighted }`). The Cocos
 *    integration script observes these flags and applies cc.Sprite color/material.
 *  - Events are subscribed once at construction; dispose() unsubscribes all.
 */

import type { IEventBus } from '../../core/events/IEventBus';
import type { CellCoord, CellState } from '../../core/types/Domain';
import { cellToIndex, isValidCell } from '../../core/grid/CellCoord';
import { GRID_TOTAL } from '../../core/grid/GridConstants';

/**
 * Cell visual state model. Cocos-agnostic — the integration script wires
 * `state` and `highlighted` to a `cc.Sprite` color and `cc.Node` overlay.
 */
export interface CellVisual {
  state: CellState;        // 'IDLE' | 'EXPLODED'
  highlighted: boolean;    // GOAL_PLACED puts the active goal cell in this state
}

/**
 * GridLayer subscribes to grid + round events and reflects state on 64 cell visuals.
 *
 * @example
 *   const grid = new GridLayer(eventBus);
 *   const visual = grid.getCellVisual({ row: 3, col: 4 });
 *   // visual.state === 'IDLE', visual.highlighted === false
 */
export class GridLayer {
  private readonly cells: CellVisual[] = new Array(GRID_TOTAL);
  private subscriptions: Array<() => void> = [];
  private currentGoalIndex: number | null = null;

  constructor(bus: IEventBus) {
    // Pre-allocate 64 cell visuals — never reallocated.
    for (let i = 0; i < GRID_TOTAL; i++) {
      this.cells[i] = { state: 'IDLE', highlighted: false };
    }

    const onCellStateChanged = (e: { cell: CellCoord; state: CellState }): void => {
      if (!isValidCell(e.cell)) {
        console.warn(
          `[GridLayer] CELL_STATE_CHANGED out-of-range coord {row:${e.cell.row}, col:${e.cell.col}} — ignored`,
        );
        return;
      }
      this.cells[cellToIndex(e.cell)].state = e.state;
    };

    const onGoalPlaced = (e: { cell: CellCoord }): void => {
      if (!isValidCell(e.cell)) {
        console.warn(
          `[GridLayer] GOAL_PLACED out-of-range coord {row:${e.cell.row}, col:${e.cell.col}} — ignored`,
        );
        return;
      }
      // Clear previous goal highlight before applying the new one.
      if (this.currentGoalIndex !== null) {
        this.cells[this.currentGoalIndex].highlighted = false;
      }
      const idx = cellToIndex(e.cell);
      this.cells[idx].highlighted = true;
      this.currentGoalIndex = idx;
    };

    const onRoundStarted = (): void => {
      // Round boundary clears any active highlight; the next GOAL_PLACED re-applies one.
      if (this.currentGoalIndex !== null) {
        this.cells[this.currentGoalIndex].highlighted = false;
        this.currentGoalIndex = null;
      }
    };

    bus.on('CELL_STATE_CHANGED', onCellStateChanged);
    bus.on('GOAL_PLACED', onGoalPlaced);
    bus.on('ROUND_STARTED', onRoundStarted);

    this.subscriptions = [
      () => bus.off('CELL_STATE_CHANGED', onCellStateChanged),
      () => bus.off('GOAL_PLACED', onGoalPlaced),
      () => bus.off('ROUND_STARTED', onRoundStarted),
    ];
  }

  /**
   * Inspection accessor. Returns a shallow copy of the cell visual at the given
   * coord, or `null` for out-of-range coords.
   *
   * @param cell - cell coordinate to inspect
   *
   * @example
   *   const v = grid.getCellVisual({ row: 0, col: 0 });
   *   if (v?.state === 'EXPLODED') { /* render danger sprite *\/ }
   */
  getCellVisual(cell: CellCoord): CellVisual | null {
    if (!isValidCell(cell)) return null;
    return { ...this.cells[cellToIndex(cell)] };
  }

  /**
   * Cleanup all event subscriptions. Idempotent — safe to call multiple times.
   * Called on scene unload or GridLayer destruction.
   */
  dispose(): void {
    for (const off of this.subscriptions) off();
    this.subscriptions = [];
  }
}
