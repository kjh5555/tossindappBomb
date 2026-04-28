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
  /**
   * 클라이언트가 자기가 사망했음 신고 (cell 폭발 또는 danger zone 착지).
   * 서버는 검증 없이 PLAYER_KILLED를 모든 client에 broadcast — MVP 모델.
   * Sprint 8+: 서버가 GridSimulation으로 자체 검증.
   */
  REPORT_DEATH: {
    cellId: CellIndex;
    cause: 'EXPLOSION' | 'DANGER_ZONE';
    timestamp: number;
  };
  /**
   * 클라이언트가 골 셀 도달 신고 — 첫 신고만 처리 (FIFO race).
   * 서버는 ROUND_CLEAR broadcast 후 다음 라운드 진행.
   */
  REPORT_GOAL_REACHED: {
    roundNumber: number;
    cellId: CellIndex;
    timestamp: number;
  };
}

export type ServerMessage = {
  [K in keyof ServerMessages]: { type: K; payload: ServerMessages[K] };
}[keyof ServerMessages];

export type ClientMessage = {
  [K in keyof ClientMessages]: { type: K; payload: ClientMessages[K] };
}[keyof ClientMessages];
