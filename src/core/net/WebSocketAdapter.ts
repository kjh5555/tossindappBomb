import { IWebSocketClient } from './IWebSocketClient';
import { IEventBus } from '../events/IEventBus';
import { IFrameClock } from '../time/IFrameClock';
import { indexToCell } from '../grid/CellCoord';

export class WebSocketAdapter {
  constructor(
    private ws: IWebSocketClient,
    private bus: IEventBus,
    private clock: IFrameClock,
  ) {}

  mount(): void {
    this.ws.on('PLAYER_KILLED', (payload) => {
      this.bus.emit('PLAYER_KILLED', {
        playerIds: payload.playerIds,
        cellId: indexToCell(payload.cellId),
        cause: payload.cause,
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('ROUND_START', (payload) => {
      this.bus.emit('ROUND_STARTED', {
        roundNumber: payload.roundNumber,
        seed: payload.seed,
        ctx: {
          roundNumber:     payload.roundNumber,
          gatePeriod:      2.0,
          tier:            1 as const,
          tierWeights:     { t1: 100, t2: 0, t3: 0 },
          stalledFallback: false,
        },
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('PLAYER_MOVE', (payload) => {
      this.bus.emit('PLAYER_MOVED', {
        playerId: payload.playerId,
        from: indexToCell(payload.from),
        to: indexToCell(payload.to),
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('ROUND_CLEAR', (payload) => {
      this.bus.emit('ROUND_CLEAR', {
        roundNumber: payload.roundNumber,
        survivors: payload.survivors,
        timestamp: this.clock.now(),
      });
    });

    this.ws.on('GAME_OVER', (payload) => {
      this.bus.emit('GAME_OVER', {
        finalRound: payload.finalRound,
        rankings: payload.rankings,
        timestamp: this.clock.now(),
      });
    });
  }
}
