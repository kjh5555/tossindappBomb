/**
 * GridLayer integration test — Sprint 5 S5-M3 / Story 002
 *
 * Story: production/epics/hud/story-002-grid-render.md
 * Tests: AC-GRID-01 through AC-GRID-08
 *
 * Verifies GridLayer event-driven cell visual sync without Cocos.
 * Cocos integration is verified by manual evidence (AC-GRID-09).
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { GridLayer } from '../../../src/presentation/hud/GridLayer';
import type { EscalationContext, CellCoord } from '../../../src/core/types/Domain';

const ESCALATION_CTX: EscalationContext = {
  roundNumber: 1,
  gatePeriod: 2.0,
  tier: 1,
  tierWeights: { t1: 1, t2: 0, t3: 0 },
  stalledFallback: false,
};

function makeEnv() {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const grid = new GridLayer(bus);
  const flush = () => clock.advanceBy(0, bus);
  return { bus, clock, grid, flush };
}

describe('GridLayer — Grid render + Goal cell highlight (AC-GRID-01 to AC-GRID-08)', () => {
  test('AC-GRID-01/02: 64 cells initialized to IDLE + not highlighted', () => {
    const { grid } = makeEnv();

    let countChecked = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const v = grid.getCellVisual({ row, col });
        expect(v).not.toBeNull();
        expect(v!.state).toBe('IDLE');
        expect(v!.highlighted).toBe(false);
        countChecked++;
      }
    }
    expect(countChecked).toBe(64);
  });

  test('AC-GRID-03: CELL_STATE_CHANGED with EXPLODED reflects on the target cell only', () => {
    const { bus, grid, flush } = makeEnv();

    bus.emit('CELL_STATE_CHANGED', { cell: { row: 3, col: 4 }, state: 'EXPLODED', timestamp: 0 });
    flush();

    expect(grid.getCellVisual({ row: 3, col: 4 })!.state).toBe('EXPLODED');
    // neighbors unchanged
    expect(grid.getCellVisual({ row: 3, col: 3 })!.state).toBe('IDLE');
    expect(grid.getCellVisual({ row: 4, col: 4 })!.state).toBe('IDLE');
    expect(grid.getCellVisual({ row: 0, col: 0 })!.state).toBe('IDLE');
  });

  test('AC-GRID-04: CELL_STATE_CHANGED with IDLE reverts an EXPLODED cell', () => {
    const { bus, grid, flush } = makeEnv();
    bus.emit('CELL_STATE_CHANGED', { cell: { row: 3, col: 4 }, state: 'EXPLODED', timestamp: 0 });
    flush();
    expect(grid.getCellVisual({ row: 3, col: 4 })!.state).toBe('EXPLODED');

    bus.emit('CELL_STATE_CHANGED', { cell: { row: 3, col: 4 }, state: 'IDLE', timestamp: 1 });
    flush();

    expect(grid.getCellVisual({ row: 3, col: 4 })!.state).toBe('IDLE');
  });

  test('AC-GRID-05: GOAL_PLACED highlights the target cell', () => {
    const { bus, grid, flush } = makeEnv();

    bus.emit('GOAL_PLACED', { cell: { row: 5, col: 5 }, timestamp: 0 });
    flush();

    expect(grid.getCellVisual({ row: 5, col: 5 })!.highlighted).toBe(true);
  });

  test('AC-GRID-06: ROUND_STARTED clears the active goal highlight', () => {
    const { bus, grid, flush } = makeEnv();
    bus.emit('GOAL_PLACED', { cell: { row: 5, col: 5 }, timestamp: 0 });
    flush();
    expect(grid.getCellVisual({ row: 5, col: 5 })!.highlighted).toBe(true);

    bus.emit('ROUND_STARTED', { roundNumber: 2, ctx: ESCALATION_CTX, timestamp: 0 });
    flush();

    expect(grid.getCellVisual({ row: 5, col: 5 })!.highlighted).toBe(false);
  });

  test('AC-GRID-06b: a new GOAL_PLACED clears the previous highlight automatically', () => {
    const { bus, grid, flush } = makeEnv();
    bus.emit('GOAL_PLACED', { cell: { row: 5, col: 5 }, timestamp: 0 });
    flush();

    bus.emit('GOAL_PLACED', { cell: { row: 0, col: 0 }, timestamp: 1 });
    flush();

    expect(grid.getCellVisual({ row: 5, col: 5 })!.highlighted).toBe(false);
    expect(grid.getCellVisual({ row: 0, col: 0 })!.highlighted).toBe(true);
  });

  test('AC-GRID-07: out-of-range CellCoord — warning logged, no crash, no state change', () => {
    const { bus, grid, flush } = makeEnv();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    bus.emit('CELL_STATE_CHANGED', { cell: { row: -1, col: 0 } as CellCoord, state: 'EXPLODED', timestamp: 0 });
    bus.emit('CELL_STATE_CHANGED', { cell: { row: 8, col: 0 } as CellCoord, state: 'EXPLODED', timestamp: 0 });
    bus.emit('GOAL_PLACED', { cell: { row: 0, col: 8 } as CellCoord, timestamp: 0 });
    flush();

    expect(warnSpy).toHaveBeenCalled(); // at least once
    // No valid cell affected
    expect(grid.getCellVisual({ row: 0, col: 0 })!.state).toBe('IDLE');
    expect(grid.getCellVisual({ row: 0, col: 0 })!.highlighted).toBe(false);

    warnSpy.mockRestore();
  });

  test('AC-GRID-07b: getCellVisual on out-of-range returns null', () => {
    const { grid } = makeEnv();

    expect(grid.getCellVisual({ row: -1, col: 0 } as CellCoord)).toBeNull();
    expect(grid.getCellVisual({ row: 8, col: 0 } as CellCoord)).toBeNull();
    expect(grid.getCellVisual({ row: 0, col: 8 } as CellCoord)).toBeNull();
  });

  test('AC-GRID-08: dispose() unsubscribes — events after dispose have no effect', () => {
    const { bus, grid, flush } = makeEnv();

    grid.dispose();
    bus.emit('CELL_STATE_CHANGED', { cell: { row: 0, col: 0 }, state: 'EXPLODED', timestamp: 0 });
    bus.emit('GOAL_PLACED', { cell: { row: 1, col: 1 }, timestamp: 0 });
    flush();

    expect(grid.getCellVisual({ row: 0, col: 0 })!.state).toBe('IDLE');
    expect(grid.getCellVisual({ row: 1, col: 1 })!.highlighted).toBe(false);
  });

  test('Edge: many CELL_STATE_CHANGED events in same flush all apply', () => {
    const { bus, grid, flush } = makeEnv();

    // emit a 56-cell EXPLODED storm in one flush
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 8; col++) {
        bus.emit('CELL_STATE_CHANGED', { cell: { row, col }, state: 'EXPLODED', timestamp: 0 });
      }
    }
    flush();

    let explodedCount = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (grid.getCellVisual({ row, col })!.state === 'EXPLODED') explodedCount++;
      }
    }
    expect(explodedCount).toBe(56);
  });

  test('Edge: GOAL_PLACED is independent of cell state — exploded cells can also be the goal', () => {
    const { bus, grid, flush } = makeEnv();
    bus.emit('CELL_STATE_CHANGED', { cell: { row: 4, col: 4 }, state: 'EXPLODED', timestamp: 0 });
    flush();

    bus.emit('GOAL_PLACED', { cell: { row: 4, col: 4 }, timestamp: 0 });
    flush();

    const v = grid.getCellVisual({ row: 4, col: 4 })!;
    expect(v.state).toBe('EXPLODED');
    expect(v.highlighted).toBe(true);
  });
});
