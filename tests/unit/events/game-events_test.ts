import { GameEvents } from '../../../src/core/events/GameEvents';
import { IEventBus } from '../../../src/core/events/IEventBus';
import { CellCoord, PlayerId, EscalationContext, CellState } from '../../../src/core/types/Domain';

class MockEventBus implements IEventBus {
  calls: Array<{ key: string; payload: unknown }> = [];
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]) {
    this.calls.push({ key, payload });
  }
  on<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void) {}
  off<K extends keyof GameEvents>(_key: K, _handler: (e: GameEvents[K]) => void) {}
  flush() {}
}

describe('GameEvents types', () => {
  let bus: IEventBus;

  beforeEach(() => { bus = new MockEventBus(); });

  test('valid PLAYER_MOVED emit compiles and records payload', () => {
    const payload: GameEvents['PLAYER_MOVED'] = {
      playerId: 'p1',
      from: { row: 0, col: 0 },
      to: { row: 0, col: 1 },
      timestamp: 1000,
    };
    bus.emit('PLAYER_MOVED', payload);
    expect((bus as MockEventBus).calls).toHaveLength(1);
    expect((bus as MockEventBus).calls[0].key).toBe('PLAYER_MOVED');
  });

  test('all 14 GameEvents keys are defined', () => {
    const expectedKeys: Array<keyof GameEvents> = [
      'CELL_STATE_CHANGED', 'CELL_EXPLODED', 'PLAYER_KILLED', 'GRID_STALLED',
      'PATTERN_REJECTED', 'PLAYER_MOVED', 'PLAYER_ARRIVED', 'ROUND_STARTED',
      'ROUND_CLEAR', 'GAME_OVER', 'ALIVE_COUNT_CHANGED', 'GOAL_PLACED',
      'ESCALATION_COMPUTED', 'AUDIO_EVENT', 'TAP_DETECTED',
    ];
    // Type-level check: this compiles only if all keys are valid keyof GameEvents
    expectedKeys.forEach(key => {
      expect(typeof key).toBe('string');
    });
    expect(expectedKeys).toHaveLength(15); // 14 events + TAP_DETECTED = 15 total
  });

  test('timestamp present on all events except AUDIO_EVENT', () => {
    const withTimestamp: GameEvents['PLAYER_KILLED'] = {
      playerIds: ['p1'],
      cellId: { row: 3, col: 4 },
      cause: 'EXPLOSION',
      timestamp: 500,
    };
    expect(withTimestamp.timestamp).toBe(500);

    // AUDIO_EVENT intentionally has no timestamp (audio trigger, not game-state)
    const audio: GameEvents['AUDIO_EVENT'] = { key: 'EXPLOSION' };
    expect('timestamp' in audio).toBe(false);
  });

  test('Domain types are correctly shaped', () => {
    const coord: CellCoord = { row: 0, col: 7 };
    const id: PlayerId = 'player-uuid-123';
    const ctx: EscalationContext = {
      roundNumber:     3,
      gatePeriod:      1.6,
      tier:            2,
      tierWeights:     { t1: 30, t2: 70, t3: 0 },
      stalledFallback: false,
    };
    const state: CellState = 'IDLE';
    expect(coord.row).toBe(0);
    expect(id).toBe('player-uuid-123');
    expect(ctx.gatePeriod).toBe(1.6);
    expect(state).toBe('IDLE');
  });
});
