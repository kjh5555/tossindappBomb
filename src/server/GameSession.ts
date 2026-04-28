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

/** 라운드 phase — 클라이언트 보고 처리에 따라 전환. */
export type RoundPhase =
  | 'PRE_ROUND'           // 매치 시작 직후 또는 ROUND_START 직전
  | 'ROUND_ACTIVE'        // ROUND_START 후, 첫 클리어 보고 전
  | 'ROUND_CLEAR_DISPLAY' // ROUND_CLEAR 후 advanceRound 직전 (대기)
  | 'GAME_OVER';          // 게임 종료 — 이후 모든 보고 무시

/**
 * 본 게임 단일 세션 host. 라운드 진입 + MOVE relay + 사망/클리어 보고 처리.
 *
 * MVP 모델: PLAYER_KILLED는 client REPORT_DEATH 신고 → 서버 broadcast.
 * Sprint 8+: 서버가 GridSimulation으로 자체 검증 → 권위적 발행.
 */
export class GameSession {
  private currentRound: number = 0;
  private phase: RoundPhase = 'PRE_ROUND';
  /** 현재 라운드 생존자 — 라운드 시작 시 모든 player로 reset. */
  private readonly alivePlayerIds: Set<PlayerId> = new Set();
  /** 라운드별 ROUND_CLEAR 발행 guard — race condition 방지. */
  private roundClearedThisRound: boolean = false;

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
    this.beginRound();
  }

  /**
   * 다음 라운드 진행. ROUND_CLEAR 후 호출 (또는 외부 trigger).
   * GAME_OVER 상태에서는 no-op.
   */
  advanceRound(): void {
    if (this.phase === 'GAME_OVER') return;
    this.currentRound++;
    this.beginRound();
  }

  /**
   * 클라이언트의 MOVE 메시지 처리 — PLAYER_MOVE를 다른 client에게 broadcast.
   * 발신자 본인은 자체 예측 결과를 이미 표시하고 있으므로 제외 (ADR-0010).
   * GAME_OVER 또는 ROUND_CLEAR_DISPLAY 중에는 무시.
   */
  handleMove(senderPlayerId: PlayerId, move: ClientMessages['MOVE']): void {
    if (this.phase !== 'ROUND_ACTIVE') return;
    if (!this.playerIds.includes(senderPlayerId)) return;
    if (!this.alivePlayerIds.has(senderPlayerId)) return; // 사망한 player의 MOVE 무시

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

  /**
   * REPORT_DEATH — 클라이언트가 자기 사망 신고 (cell 폭발 또는 danger zone).
   * MVP: 검증 없이 PLAYER_KILLED broadcast. 생존자 0명 시 GAME_OVER.
   */
  handleReportDeath(
    senderPlayerId: PlayerId,
    report: ClientMessages['REPORT_DEATH'],
  ): void {
    if (this.phase !== 'ROUND_ACTIVE') return;
    if (!this.alivePlayerIds.has(senderPlayerId)) return; // 이미 사망 — 중복 무시

    this.alivePlayerIds.delete(senderPlayerId);

    this.dispatcher.broadcast(this.sessionId, {
      type: 'PLAYER_KILLED',
      payload: {
        playerIds: [senderPlayerId],
        cellId: report.cellId,
        cause: report.cause,
        timestamp: report.timestamp,
      },
    });

    // 모두 사망 시 GAME_OVER
    if (this.alivePlayerIds.size === 0) {
      this.triggerGameOver();
    }
  }

  /**
   * REPORT_GOAL_REACHED — 클라이언트가 골 셀 도달 신고.
   * 첫 신고만 처리 (FIFO race). ROUND_CLEAR broadcast + ROUND_CLEAR_DISPLAY phase.
   * 외부 trigger (예: 1.5s timer)로 advanceRound 호출 권장.
   */
  handleReportGoalReached(
    senderPlayerId: PlayerId,
    report: ClientMessages['REPORT_GOAL_REACHED'],
  ): void {
    if (this.phase !== 'ROUND_ACTIVE') return;
    if (this.roundClearedThisRound) return; // 첫 신고만
    if (!this.alivePlayerIds.has(senderPlayerId)) return; // 사망자 신고 무시
    if (report.roundNumber !== this.currentRound) return; // stale report

    this.roundClearedThisRound = true;
    this.phase = 'ROUND_CLEAR_DISPLAY';

    const survivors = Array.from(this.alivePlayerIds);
    this.dispatcher.broadcast(this.sessionId, {
      type: 'ROUND_CLEAR',
      payload: {
        roundNumber: this.currentRound,
        survivors,
      },
    });
  }

  /** Test inspection — 현재 라운드 번호. */
  getCurrentRound(): number {
    return this.currentRound;
  }

  /** Test inspection — 현재 phase. */
  getPhase(): RoundPhase {
    return this.phase;
  }

  /** Test inspection — 현재 생존자. */
  getAlivePlayerIds(): PlayerId[] {
    return Array.from(this.alivePlayerIds);
  }

  /** Test inspection — 현재 라운드 seed (재계산). */
  getCurrentSeed(): number {
    return generateRoundSeed(this.sessionId, this.currentRound);
  }

  /**
   * 라운드 시작 — alivePlayerIds 리셋, ROUND_START broadcast, ROUND_ACTIVE phase.
   */
  private beginRound(): void {
    this.alivePlayerIds.clear();
    for (const p of this.playerIds) this.alivePlayerIds.add(p);
    this.roundClearedThisRound = false;
    this.phase = 'ROUND_ACTIVE';

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
   * GAME_OVER 발행 — phase 전환 + 모든 player에게 broadcast.
   * 중복 호출 방지 (phase guard).
   */
  private triggerGameOver(): void {
    if (this.phase === 'GAME_OVER') return;
    this.phase = 'GAME_OVER';
    // 생존자 → rankings 우선 (간단히 alivePlayerIds + 사망 순서 무시 v1)
    const rankings = Array.from(this.alivePlayerIds).concat(
      this.playerIds.filter((p) => !this.alivePlayerIds.has(p)),
    );
    this.dispatcher.broadcast(this.sessionId, {
      type: 'GAME_OVER',
      payload: {
        finalRound: this.currentRound,
        rankings,
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
