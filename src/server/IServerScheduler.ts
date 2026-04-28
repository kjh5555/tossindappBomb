/**
 * IServerScheduler.ts
 * 서버 측 timer 추상화 — Node.js setTimeout과 deterministic test mock 분리.
 *
 * Implements: production/sprints/sprint-7+ (TD-P0-02 확장)
 * Governed by: ADR-0011 (1.5s ROUND_CLEAR_DISPLAY → ROUND_END 타이밍 — 서버 측 등가)
 */

export interface IServerScheduler {
  /**
   * delayMs 후 fn 호출. cancel function을 반환.
   * @returns cancel function — 호출 시 schedule 취소.
   */
  schedule(fn: () => void, delayMs: number): () => void;
}

/**
 * Node.js setTimeout 기반 production 구현.
 *
 * .unref() 적용 — pending timer가 process exit를 차단하지 않게 한다.
 * 운영 중에는 active connection이 있어 process가 살아있으므로 unref가 영향 없음.
 * Jest 등 단기 process에서는 pending timer 때문에 worker가 graceful exit 못 하는
 * 문제를 해소.
 */
export class NodeJsScheduler implements IServerScheduler {
  schedule(fn: () => void, delayMs: number): () => void {
    const handle = setTimeout(fn, delayMs);
    if (typeof (handle as unknown as { unref?: () => void }).unref === 'function') {
      (handle as unknown as { unref: () => void }).unref();
    }
    return () => clearTimeout(handle);
  }
}

/**
 * Test용 deterministic scheduler. advance()로 시간 진행 시뮬레이션.
 */
export class MockServerScheduler implements IServerScheduler {
  private elapsedMs: number = 0;
  private readonly pending: Array<{
    fn: () => void;
    fireAt: number;
    cancelled: boolean;
  }> = [];

  schedule(fn: () => void, delayMs: number): () => void {
    const entry = { fn, fireAt: this.elapsedMs + delayMs, cancelled: false };
    this.pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }

  /**
   * ms 만큼 시간 진행 + 만료된 schedule fire.
   * 같은 시점에 여러 schedule 등록 시 등록 순서대로 fire.
   */
  advance(ms: number): void {
    this.elapsedMs += ms;
    const due = this.pending.filter(
      (p) => !p.cancelled && p.fireAt <= this.elapsedMs,
    );
    // 만료된 항목 제거
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].cancelled || this.pending[i].fireAt <= this.elapsedMs) {
        this.pending.splice(i, 1);
      }
    }
    for (const p of due) p.fn();
  }

  /** Test inspection — 대기 중인 schedule 개수. */
  getPendingCount(): number {
    return this.pending.filter((p) => !p.cancelled).length;
  }
}
