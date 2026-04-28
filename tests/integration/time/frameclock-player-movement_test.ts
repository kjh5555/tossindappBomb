import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { IFrameClock } from '../../../src/core/time/IFrameClock';
import { IEventBus } from '../../../src/core/events/IEventBus';
import { CellCoord } from '../../../src/core/types/Domain';

class PlayerMovementSim {
  private arrivedFn?: () => void;

  constructor(private clock: IFrameClock, private bus: IEventBus) {}

  move(playerId: string, from: CellCoord, to: CellCoord): void {
    this.bus.emit('PLAYER_MOVED', { playerId, from, to, timestamp: this.clock.now() });
    this.arrivedFn = () => {
      this.bus.emit('PLAYER_ARRIVED', { playerId, cell: to, timestamp: this.clock.now() });
    };
    this.clock.schedule(this.arrivedFn, 0.1);
  }

  cancelArrival(): void {
    if (this.arrivedFn) this.clock.cancelSchedule(this.arrivedFn);
  }
}

describe('FrameClock — PLAYER_ARRIVED 0.1s pattern (ADR-0008)', () => {
  let bus: EventBus;
  let clock: MockFrameClock;
  let sim: PlayerMovementSim;

  beforeEach(() => {
    bus = new EventBus();
    clock = new MockFrameClock();
    sim = new PlayerMovementSim(clock, bus);
  });

  test('AC-1: advanceBy(0.05) x2 fires PLAYER_ARRIVED once', () => {
    const arrivals: string[] = [];
    bus.on('PLAYER_ARRIVED', (e) => arrivals.push(e.playerId));

    sim.move('p1', { row: 0, col: 0 }, { row: 0, col: 1 });

    clock.advanceBy(0.05, bus);
    expect(arrivals).toHaveLength(0); // 0.05 < 0.1

    clock.advanceBy(0.05, bus);
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]).toBe('p1');
  });

  test('AC-2: single advanceBy(0.05) — PLAYER_ARRIVED not fired', () => {
    let fired = false;
    bus.on('PLAYER_ARRIVED', () => { fired = true; });

    sim.move('p1', { row: 1, col: 1 }, { row: 1, col: 2 });
    clock.advanceBy(0.05, bus);

    expect(fired).toBe(false);
  });

  test('AC-3: cancelArrival prevents PLAYER_ARRIVED after PLAYER_KILLED', () => {
    let fired = false;
    bus.on('PLAYER_ARRIVED', () => { fired = true; });

    sim.move('p1', { row: 2, col: 2 }, { row: 2, col: 3 });
    sim.cancelArrival(); // simulates PLAYER_KILLED cancellation

    clock.advanceBy(0.15, bus);
    expect(fired).toBe(false);
  });

  test('AC-4: PLAYER_ARRIVED payload matches PLAYER_MOVED destination', () => {
    const from: CellCoord = { row: 3, col: 3 };
    const to: CellCoord = { row: 3, col: 4 };
    let arrivedCell: CellCoord | null = null;
    let arrivedId: string | null = null;

    bus.on('PLAYER_ARRIVED', (e) => {
      arrivedId = e.playerId;
      arrivedCell = e.cell;
    });

    sim.move('p2', from, to);
    clock.advanceBy(0.12, bus); // past 0.1s threshold

    expect(arrivedId).toBe('p2');
    expect(arrivedCell).toEqual(to);
  });
});
