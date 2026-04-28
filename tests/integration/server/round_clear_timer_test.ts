/**
 * ROUND_CLEAR_DISPLAY → 1.5s → advanceRound 자동 timer 검증.
 *
 * Sprint 7+ TD-P0-02 확장. ADR-0011 ROUND_CLEAR_DISPLAY → ROUND_END 1500ms 등가.
 *
 * MockServerScheduler로 deterministic 검증:
 *   - ROUND_CLEAR 발생 → schedule 1개 등록
 *   - 1500ms 미만 advance → 라운드 변화 없음
 *   - 1500ms 이상 advance → advanceRound 자동 호출 → ROUND_START broadcast
 */

import {
  IServerSocket,
  ServerMessage,
  IncomingClientMessage,
} from '../../../src/server/IServerSocket';
import { SessionDispatcher } from '../../../src/server/SessionDispatcher';
import {
  GameSession,
  ROUND_CLEAR_DISPLAY_MS,
} from '../../../src/server/GameSession';
import { MockServerScheduler } from '../../../src/server/IServerScheduler';

class FakeSocket implements IServerSocket {
  readonly sentMessages: ServerMessage[] = [];
  constructor(public readonly id: string) {}
  send(m: ServerMessage): void {
    this.sentMessages.push(m);
  }
  disconnect(): void {}
  onMessage(_h: (m: IncomingClientMessage) => void): void {}
  onClose(_h: () => void): void {}
}

function makeWorld(playerCount = 2) {
  const dispatcher = new SessionDispatcher();
  const scheduler = new MockServerScheduler();
  const sockets: FakeSocket[] = [];
  const players = [];
  for (let i = 1; i <= playerCount; i++) {
    const s = new FakeSocket(`s${i}`);
    sockets.push(s);
    players.push({ socket: s, playerId: `p${i}` });
  }
  dispatcher.registerSession('sess', players);
  const game = new GameSession(
    'sess',
    players.map((p) => p.playerId),
    dispatcher,
    scheduler,
  );
  return { dispatcher, scheduler, sockets, game };
}

describe('GameSession ROUND_CLEAR_DISPLAY auto timer', () => {
  test('ROUND_CLEAR 발생 시 schedule 1개 등록', () => {
    const w = makeWorld(2);
    w.game.startFirstRound();
    expect(w.scheduler.getPendingCount()).toBe(0);

    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 0 });

    expect(w.scheduler.getPendingCount()).toBe(1);
    expect(w.game.getPhase()).toBe('ROUND_CLEAR_DISPLAY');
  });

  test('1.5s 미만 advance — 라운드 변화 없음', () => {
    const w = makeWorld(2);
    w.game.startFirstRound();
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 0 });

    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS - 1);

    expect(w.game.getCurrentRound()).toBe(1);
    expect(w.game.getPhase()).toBe('ROUND_CLEAR_DISPLAY');
  });

  test('1.5s 초과 advance — advanceRound 자동 호출 + 다음 ROUND_START', () => {
    const w = makeWorld(2);
    w.game.startFirstRound();
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 0 });

    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS);

    expect(w.game.getCurrentRound()).toBe(2);
    expect(w.game.getPhase()).toBe('ROUND_ACTIVE');
    expect(w.game.getAlivePlayerIds()).toHaveLength(2); // 부활

    // 두 번째 ROUND_START broadcast 확인
    const roundStarts = w.sockets[0].sentMessages.filter((m) => m.type === 'ROUND_START');
    expect(roundStarts).toHaveLength(2);
  });

  test('GAME_OVER 시 timer 취소 — advance 후 라운드 진행 안 됨', () => {
    const w = makeWorld(2);
    w.game.startFirstRound();
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 0 });
    expect(w.scheduler.getPendingCount()).toBe(1);

    // ROUND_CLEAR_DISPLAY 중에 어떻게든 GAME_OVER 발생 (예: 모든 player disconnect)
    // 시뮬레이션 위해 직접 player kill 시도 — 단, ROUND_CLEAR_DISPLAY 상태에서는
    // handleReportDeath가 무시됨. 대신 새 라운드로 넘어간 후 양 player kill 테스트.
    // 여기서는 dispose() 호출로 timer 취소 검증.
    w.game.dispose();

    expect(w.scheduler.getPendingCount()).toBe(0);

    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS * 2);
    expect(w.game.getCurrentRound()).toBe(1); // dispose 후 advance 안 함
  });

  test('연속 라운드 — 매 라운드마다 새 timer 등록 + 자동 advance', () => {
    const w = makeWorld(2);
    w.game.startFirstRound();

    // 라운드 1 클리어
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 0 });
    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS);
    expect(w.game.getCurrentRound()).toBe(2);

    // 라운드 2 클리어
    w.game.handleReportGoalReached('p2', { roundNumber: 2, cellId: 36, timestamp: 1 });
    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS);
    expect(w.game.getCurrentRound()).toBe(3);

    // 라운드 3 클리어
    w.game.handleReportGoalReached('p1', { roundNumber: 3, cellId: 36, timestamp: 2 });
    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS);
    expect(w.game.getCurrentRound()).toBe(4);

    const roundStarts = w.sockets[0].sentMessages.filter((m) => m.type === 'ROUND_START');
    expect(roundStarts).toHaveLength(4); // 1, 2, 3, 4
  });

  test('정확히 boundary (1.5s) advance — fire 발생', () => {
    const w = makeWorld(2);
    w.game.startFirstRound();
    w.game.handleReportGoalReached('p1', { roundNumber: 1, cellId: 36, timestamp: 0 });

    w.scheduler.advance(ROUND_CLEAR_DISPLAY_MS); // 정확히 1500ms

    expect(w.game.getCurrentRound()).toBe(2);
  });

  test('schedule 취소 후 fire 안 됨', () => {
    const scheduler = new MockServerScheduler();
    let fired = false;
    const cancel = scheduler.schedule(() => {
      fired = true;
    }, 1000);

    cancel();
    scheduler.advance(2000);

    expect(fired).toBe(false);
  });
});

describe('MockServerScheduler — invariants', () => {
  test('schedule + advance fire — 한 번만', () => {
    const scheduler = new MockServerScheduler();
    let fireCount = 0;
    scheduler.schedule(() => {
      fireCount++;
    }, 100);

    scheduler.advance(100);
    expect(fireCount).toBe(1);

    scheduler.advance(100);
    expect(fireCount).toBe(1); // already fired
  });

  test('여러 schedule — 시간 순서대로 fire', () => {
    const scheduler = new MockServerScheduler();
    const fired: string[] = [];
    scheduler.schedule(() => fired.push('B'), 200);
    scheduler.schedule(() => fired.push('A'), 100);
    scheduler.schedule(() => fired.push('C'), 300);

    scheduler.advance(150);
    expect(fired).toEqual(['A']); // A만 fire (100ms)

    scheduler.advance(100); // 누적 250ms
    expect(fired).toEqual(['A', 'B']); // B fire

    scheduler.advance(100); // 누적 350ms
    expect(fired).toEqual(['A', 'B', 'C']);
  });

  test('cancel 직후 advance — fire 안 됨', () => {
    const scheduler = new MockServerScheduler();
    let fired = false;
    const cancel = scheduler.schedule(() => {
      fired = true;
    }, 100);

    cancel();
    scheduler.advance(200);

    expect(fired).toBe(false);
    expect(scheduler.getPendingCount()).toBe(0);
  });
});
