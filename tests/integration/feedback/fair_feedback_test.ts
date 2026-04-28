/**
 * FairFeedback (Death Replay) integration test
 *
 * Sprint 7+ TD-P2-03 closing — ADR-0015 DeathReplay Rendering 검증.
 *
 * 시나리오:
 *  - PLAYER_KILLED + localPlayerId 매치 → showCells + 700ms timer
 *  - 다른 player의 PLAYER_KILLED → 무시 (local filter)
 *  - 700ms 경과 → 자동 dismiss
 *  - 사용자 탭 → 즉시 dismiss + timer 취소
 *  - 이미 활성 중 새 PLAYER_KILLED → 무시
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import {
  FairFeedback,
  FEEDBACK_DURATION_SEC,
} from '../../../src/presentation/feedback/FairFeedback';
import type { IFeedbackOverlay } from '../../../src/presentation/feedback/IFeedbackOverlay';
import type { CellCoord, PlayerId } from '../../../src/core/types/Domain';

class FakeOverlay implements IFeedbackOverlay {
  shownCells: CellCoord[][] = [];
  dismissCount: number = 0;
  private skipHandlers: Array<() => void> = [];

  showCells(cells: CellCoord[]): void {
    this.shownCells.push([...cells]);
  }
  dismiss(): void {
    this.dismissCount++;
  }
  onSkipTap(h: () => void): void {
    this.skipHandlers.push(h);
  }
  offSkipTap(h: () => void): void {
    const i = this.skipHandlers.indexOf(h);
    if (i !== -1) this.skipHandlers.splice(i, 1);
  }
  /** Test helper — 사용자 탭 시뮬레이션. */
  simulateTap(): void {
    for (const h of [...this.skipHandlers]) h();
  }
  handlerCount(): number {
    return this.skipHandlers.length;
  }
}

function makeWorld(localPlayerId: PlayerId | null = 'p1') {
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const overlay = new FakeOverlay();
  const feedback = new FairFeedback(bus, clock, overlay, localPlayerId);
  const flush = (): void => clock.advanceBy(0, bus);
  return { bus, clock, overlay, feedback, flush };
}

const KILL = (playerIds: PlayerId[], cellId: CellCoord = { row: 3, col: 4 }) => ({
  playerIds,
  cellId,
  cause: 'EXPLOSION' as const,
  timestamp: 0,
});

// ─── Trigger + local filter ─────────────────────────────────────────────────

describe('FairFeedback — trigger + local filter', () => {
  test('localPlayerId가 사망자 명단에 있으면 showCells 호출', () => {
    const w = makeWorld('p1');

    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 3, col: 4 }));
    w.flush();

    expect(w.feedback.isActive()).toBe(true);
    expect(w.overlay.shownCells).toHaveLength(1);
    expect(w.overlay.shownCells[0]).toEqual([{ row: 3, col: 4 }]);
  });

  test('localPlayerId가 사망자 명단에 없으면 무시', () => {
    const w = makeWorld('p1');

    w.bus.emit('PLAYER_KILLED', KILL(['p2'], { row: 0, col: 0 }));
    w.flush();

    expect(w.feedback.isActive()).toBe(false);
    expect(w.overlay.shownCells).toHaveLength(0);
  });

  test('localPlayerId=null — 모든 PLAYER_KILLED trigger (single-player 시나리오)', () => {
    const w = makeWorld(null);

    w.bus.emit('PLAYER_KILLED', KILL(['anyone']));
    w.flush();

    expect(w.feedback.isActive()).toBe(true);
  });

  test('multi-player kill에 localPlayerId 포함 → trigger', () => {
    const w = makeWorld('p1');

    w.bus.emit('PLAYER_KILLED', KILL(['p1', 'p2', 'p3']));
    w.flush();

    expect(w.feedback.isActive()).toBe(true);
  });
});

// ─── 700ms 자동 dismiss ──────────────────────────────────────────────────

describe('FairFeedback — auto dismiss timer', () => {
  test('700ms 미만 advance — 활성 유지', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();

    w.clock.advanceBy(FEEDBACK_DURATION_SEC - 0.01, w.bus);

    expect(w.feedback.isActive()).toBe(true);
    expect(w.overlay.dismissCount).toBe(0);
  });

  test('700ms 도달 — 자동 dismiss', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();

    w.clock.advanceBy(FEEDBACK_DURATION_SEC, w.bus);

    expect(w.feedback.isActive()).toBe(false);
    expect(w.overlay.dismissCount).toBe(1);
  });

  test('700ms 초과 advance — 한 번만 dismiss', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();

    w.clock.advanceBy(2.0, w.bus);

    expect(w.overlay.dismissCount).toBe(1);
  });
});

// ─── Tap-to-skip ──────────────────────────────────────────────────────────

describe('FairFeedback — tap-to-skip', () => {
  test('사용자 탭 → 즉시 dismiss', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();
    expect(w.feedback.isActive()).toBe(true);

    w.overlay.simulateTap();

    expect(w.feedback.isActive()).toBe(false);
    expect(w.overlay.dismissCount).toBe(1);
  });

  test('탭 후 timer 취소 — 700ms 경과해도 추가 dismiss 없음', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();

    w.overlay.simulateTap();
    w.clock.advanceBy(2.0, w.bus);

    expect(w.overlay.dismissCount).toBe(1); // tap에서 1회만
  });

  test('비활성 중 탭 — no-op', () => {
    const w = makeWorld('p1');

    w.overlay.simulateTap();

    expect(w.overlay.dismissCount).toBe(0);
  });
});

// ─── Race / 중복 처리 ────────────────────────────────────────────────────

describe('FairFeedback — race conditions', () => {
  test('이미 활성 중 새 PLAYER_KILLED — 무시', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 0, col: 0 }));
    w.flush();

    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 7, col: 7 }));
    w.flush();

    expect(w.overlay.shownCells).toHaveLength(1);
    expect(w.overlay.shownCells[0]).toEqual([{ row: 0, col: 0 }]); // 첫 cell만
  });

  test('dismiss 후 재 trigger 가능', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 0, col: 0 }));
    w.flush();
    w.overlay.simulateTap(); // dismiss

    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 5, col: 5 }));
    w.flush();

    expect(w.feedback.isActive()).toBe(true);
    expect(w.overlay.shownCells).toHaveLength(2);
    expect(w.overlay.shownCells[1]).toEqual([{ row: 5, col: 5 }]);
  });

  test('자동 timer dismiss 후에도 재 trigger 가능', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 0, col: 0 }));
    w.flush();
    w.clock.advanceBy(FEEDBACK_DURATION_SEC, w.bus);
    expect(w.feedback.isActive()).toBe(false);

    w.bus.emit('PLAYER_KILLED', KILL(['p1'], { row: 4, col: 4 }));
    w.flush();

    expect(w.feedback.isActive()).toBe(true);
    expect(w.overlay.shownCells).toHaveLength(2);
  });
});

// ─── Disposal ─────────────────────────────────────────────────────────────

describe('FairFeedback — disposal', () => {
  test('dispose() — 활성 시 dismiss + subscription 해제', () => {
    const w = makeWorld('p1');
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();
    expect(w.feedback.isActive()).toBe(true);

    w.feedback.dispose();

    expect(w.feedback.isActive()).toBe(false);
    expect(w.overlay.dismissCount).toBe(1);
    expect(w.overlay.handlerCount()).toBe(0); // skipTap handler 해제

    // 이후 PLAYER_KILLED는 무시
    w.bus.emit('PLAYER_KILLED', KILL(['p1']));
    w.flush();
    expect(w.overlay.shownCells).toHaveLength(1); // 변화 없음 (dispose 전 값만)
  });

  test('비활성 dispose() — overlay.dismiss 호출 안 함', () => {
    const w = makeWorld('p1');

    w.feedback.dispose();

    expect(w.overlay.dismissCount).toBe(0);
  });

  test('dispose() 두 번 — throw 없음', () => {
    const w = makeWorld('p1');

    w.feedback.dispose();
    expect(() => w.feedback.dispose()).not.toThrow();
  });
});
