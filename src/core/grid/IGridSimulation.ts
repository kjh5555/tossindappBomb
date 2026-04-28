import { CellCoord } from '../types/Domain';
import type { ExplodePattern } from '../patterns/PatternTypes';

/**
 * Simulation interface for grid explosion mechanics.
 * Provides queries for cell explosion timing and pattern application.
 */
export interface IGridSimulation {
  /**
   * Get the time until the next explosion for a given cell, relative to simulatedTime.
   * Used by RoundManager to determine Goal Cell placement (F-RM-1: Goal Cell Fallback).
   * @param cell The cell coordinate to query
   * @returns Seconds until explosion, or null if cell is not scheduled for explosion
   */
  nextExplosionTime(cell: CellCoord): number | null;

  /**
   * Set the gate period (interval between cell state transitions) for the current round.
   * CRITICAL: Must be called BEFORE ROUND_STARTED is emitted (ADR-0006 exception 1).
   * @param seconds Gate period in seconds, must be within [GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]
   */
  setGatePeriod(seconds: number): void;

  /**
   * Get the current state of a cell (used by other systems, not RoundManager).
   * @param cell The cell coordinate to query
   * @returns Current state of the cell
   */
  getCellState(cell: CellCoord): string;

  /**
   * Apply an explosion pattern to the grid.
   * @param pattern The pattern to apply
   */
  applyPattern(pattern: ExplodePattern): void;
}
