import { PlayerId } from '../types/Domain';

export type CellIndex = number;

export type Direction8 = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'UP_LEFT' | 'UP_RIGHT' | 'DOWN_LEFT' | 'DOWN_RIGHT';

export interface ServerMessages {
  MATCH_READY: {
    sessionId: string;
    playerIds: PlayerId[];
    localPlayerId: PlayerId;
    serverTime: number;
  };
  ROUND_START: {
    roundNumber: number;
    seed: number;
    playerPositions: Record<PlayerId, CellIndex>;
  };
  PLAYER_MOVE: {
    playerId: PlayerId;
    from: CellIndex;
    to: CellIndex;
    timestamp: number;
  };
  PLAYER_KILLED: {
    playerIds: PlayerId[];
    cellId: CellIndex;
    cause: 'EXPLOSION' | 'DANGER_ZONE';
    timestamp: number;
  };
  ROUND_CLEAR: {
    roundNumber: number;
    survivors: PlayerId[];
  };
  GAME_OVER: {
    finalRound: number;
    rankings: PlayerId[];
  };
}

export interface ClientMessages {
  AUTH: {
    token: string;
    sessionId?: string;
  };
  MOVE: {
    direction: Direction8;
    fromCell: CellIndex;
    timestamp: number;
  };
}

export type ServerMessage = {
  [K in keyof ServerMessages]: { type: K; payload: ServerMessages[K] };
}[keyof ServerMessages];

export type ClientMessage = {
  [K in keyof ClientMessages]: { type: K; payload: ClientMessages[K] };
}[keyof ClientMessages];
