/**
 * GameSession.ts
 * 단일 세션 (matched group of players)의 게임 진행 호스트.
 *
 * Implements: production/sprints/sprint-7+ (TD-P0-02 확장)
 * Governed by: ADR-0010 (서버 권위 분리), ADR-0014 (Matchmaking 후 게임 진입)
 *
 * 책임:
 *   - ROUND_START broadcast (seed + roundNumber + 초기 위치)
 *   - MOVE 메시지 수신 → PLAYER_MOVE broadcast (발신자 제외)
 *   - 라운드 전환 trigger (Sprint 8+ — 현재 stub)
 *
 * 권위 모델:
 *   - 서버: round seed (deterministic random), 라운드 번호 증가
 *   - 클라이언트: 폭발 타이밍, 패턴 선택, 자기 이동 (예측 후 서버 보정)
 *   - 향후 (Sprint 8+): PLAYER_KILLED 권위적 발행, ROUND_CLEAR 판정
 *
 * Seed 생성:
 *   - 결정론적 PRNG (Mulberry32) — 동일 sessionId + roundNumber 조합 → 동일 seed
 *   - sessionId 해시 + roundNumber로 seed 생성. 클라이언트 동기화 보장.
 */

import type { SessionDispatcher } from './SessionDispatcher';
import type { ClientMessages } from '../core/net/WebSocketProtocol';
import type { PlayerId } from '../core/types/Domain';

/** Mulberry32 — 32-bit deterministic PRNG. 빠르고 충분한 분포. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 단순 string hash (FNV-1a 변형) — sessionId → seed. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 세션 + 라운드 번호 조합으로 결정론적 seed 생성. */
export function generateRoundSeed(sessionId: string, roundNumber: number): number {
  const sessionHash = hashString(sessionId);
  // mulberry32을 한 번 돌려서 sessionHash + roundNumber에서 균일 분포 seed 추출
  const rng = mulberry32(sessionHash ^ (roundNumber * 0x9e3779b9));
  return Math.floor(rng() * 0xffffffff) >>> 0;
}

/** 8×8 그리드의 초기 player 위치 (모서리 + 중앙 분산). 최대 6 player. */
const INITIAL_POSITIONS: number[] = [
  // CellIndex = row * 8 + col
  0,  // (0,0) — top-left
  7,  // (0,7) — top-right
  56, // (7,0) — bottom-left
  63, // (7,7) — bottom-right
  27, // (3,3) — center upper
  36, // (4,4) — center lower
];

export class GameSession {
  private currentRound: number = 0;

  constructor(
    private readonly sessionId: string,
    private readonly playerIds: PlayerId[],
    private readonly dispatcher: SessionDispatcher,
  ) {
    if (playerIds.length < 1 || playerIds.length > INITIAL_POSITIONS.length) {
      throw new Error(
        `GameSession: invalid playerIds.length=${playerIds.length}; must be in [1, ${INITIAL_POSITIONS.length}]`,
      );
    }
  }

  /**
   * 첫 라운드 시작. MATCH_READY 송신 직후 GameSession을 생성하고 본 메서드 호출.
   * 서버가 ROUND_START broadcast.
   */
  startFirstRound(): void {
    this.currentRound = 1;
    this.broadcastRoundStart();
  }

  /**
   * 다음 라운드 진행. ROUND_CLEAR 후 호출 (Sprint 8+ 자동 trigger).
   */
  advanceRound(): void {
    this.currentRound++;
    this.broadcastRoundStart();
  }

  /**
   * 클라이언트의 MOVE 메시지 처리 — PLAYER_MOVE를 다른 client에게 broadcast.
   * 발신자 본인은 자체 예측 결과를 이미 표시하고 있으므로 제외 (ADR-0010).
   */
  handleMove(senderPlayerId: PlayerId, move: ClientMessages['MOVE']): void {
    // 발신자가 본 세션의 player인지 검증
    if (!this.playerIds.includes(senderPlayerId)) return;

    this.dispatcher.broadcastExcept(this.sessionId, senderPlayerId, {
      type: 'PLAYER_MOVE',
      payload: {
        playerId: senderPlayerId,
        from: move.fromCell,
        to: this.computeMoveTarget(move.fromCell, move.direction),
        timestamp: move.timestamp,
      },
    });
  }

  /** Test inspection — 현재 라운드 번호. */
  getCurrentRound(): number {
    return this.currentRound;
  }

  /** Test inspection — 현재 라운드 seed (재계산). */
  getCurrentSeed(): number {
    return generateRoundSeed(this.sessionId, this.currentRound);
  }

  private broadcastRoundStart(): void {
    const seed = generateRoundSeed(this.sessionId, this.currentRound);
    const playerPositions: Record<PlayerId, number> = {};
    for (let i = 0; i < this.playerIds.length; i++) {
      playerPositions[this.playerIds[i]] = INITIAL_POSITIONS[i];
    }

    this.dispatcher.broadcast(this.sessionId, {
      type: 'ROUND_START',
      payload: {
        roundNumber: this.currentRound,
        seed,
        playerPositions,
      },
    });
  }

  /**
   * Direction8 + fromCell → toCell 계산 (서버 측 단순 검증용).
   * 본격 boundary check는 클라이언트 PlayerMovement.executeMove와 일치.
   * 서버 권위 v1: 단순 적용. v2 (Sprint 8+): 진짜 검증.
   */
  private computeMoveTarget(fromCell: number, direction: ClientMessages['MOVE']['direction']): number {
    const row = Math.floor(fromCell / 8);
    const col = fromCell % 8;
    let dRow = 0;
    let dCol = 0;
    switch (direction) {
      case 'UP':         dRow = -1; break;
      case 'DOWN':       dRow = 1;  break;
      case 'LEFT':       dCol = -1; break;
      case 'RIGHT':      dCol = 1;  break;
      case 'UP_LEFT':    dRow = -1; dCol = -1; break;
      case 'UP_RIGHT':   dRow = -1; dCol = 1;  break;
      case 'DOWN_LEFT':  dRow = 1;  dCol = -1; break;
      case 'DOWN_RIGHT': dRow = 1;  dCol = 1;  break;
    }
    const newRow = row + dRow;
    const newCol = col + dCol;
    // 경계 위반 시 fromCell 그대로 (무이동) — 클라이언트 측에서 동일한 boundary check 수행
    if (newRow < 0 || newRow > 7 || newCol < 0 || newCol > 7) return fromCell;
    return newRow * 8 + newCol;
  }
}
