# Story 003: EventBus 핵심 구현 (flush-queue 패턴)

> **Epic**: EventBus
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0001 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음)

**ADR Governing Implementation**: ADR-0001 (EventBus 아키텍처)
**ADR Decision Summary**: `emit()`은 이벤트를 큐에만 추가하고 핸들러를 즉시 실행하지 않는다. `flush()`는 큐를 FIFO 순서로 드레인하며, 재진입 방지를 위해 flush 시작 시 큐를 스냅샷한다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 순수 TypeScript Map + 배열 구현. cc API 없음. 엔진 버전 무관.

**Control Manifest Rules (Foundation)**:
- Required: `emit()` 는 큐 추가만 — 핸들러 즉시 호출 금지 — source: ADR-0001
- Required: `flush()` 재진입 방지 구현 — 스냅샷 복사 후 처리 — source: ADR-0001
- Required: `on()/off()` 는 초기화/소멸 시점에만 — flush() 중 구독 변경 금지 — source: ADR-0001
- Forbidden: 동기 즉시-통지 패턴 — source: ADR-0001
- Forbidden: `cc.EventTarget` 기반 구현 — source: ADR-0001
- Guardrail: flush() 20 이벤트/프레임 기준 < 0.2ms

---

## Acceptance Criteria

- [ ] `emit()` 호출 후 `flush()` 없이는 핸들러가 실행되지 않음
- [ ] `flush()` 실행 시 emit 순서대로(FIFO) 핸들러 호출됨
- [ ] `flush()` 실행 중 `emit()` 된 이벤트는 현재 flush에 포함되지 않고 다음 flush 대상이 됨 (재진입 방지)
- [ ] `on(handler)` 등록 후 flush 시 핸들러 실행, `off(handler)` 후 flush 시 핸들러 미실행
- [ ] `flush()` 를 `FrameClock.tick()` 외부에서 직접 호출 시 `console.warn` 또는 런타임 에러 발행
- [ ] `EventBus` 는 `IEventBus` 인터페이스를 완전히 구현함

---

## Implementation Notes

*ADR-0001 Decision 및 Architecture Diagram 기반:*

```typescript
// src/core/events/EventBus.ts
export class EventBus implements IEventBus {
  private queue: Array<{ key: keyof GameEvents; payload: GameEvents[keyof GameEvents] }> = [];
  private handlers = new Map<keyof GameEvents, Array<(e: any) => void>>();
  private isFlushing = false;  // 재진입 방지 플래그
  private isFlushLocked = false;  // 외부 호출 가드용 (FrameClock만 해제)

  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.queue.push({ key, payload });
  }

  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void {
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key)!.push(handler);
  }

  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void {
    const list = this.handlers.get(key);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  flush(): void {
    if (this.isFlushLocked) {
      console.warn('[EventBus] flush() called outside FrameClock.tick() — ignored');
      return;
    }
    if (this.isFlushing) return;  // 재진입 방지
    this.isFlushing = true;
    const snapshot = this.queue.splice(0);  // 현재 큐 스냅샷 후 비움
    for (const { key, payload } of snapshot) {
      const list = this.handlers.get(key);
      if (list) for (const h of list) h(payload);
    }
    this.isFlushing = false;
  }

  unlockFlush(): void { this.isFlushLocked = false; }  // FrameClock이 tick 시작 시 호출
  lockFlush(): void { this.isFlushLocked = true; }      // tick 종료 후 호출
}
```

**재진입 방지 핵심**: `snapshot = queue.splice(0)` 로 현재 큐를 통째로 꺼내어 처리. 처리 중 새로 추가된 이벤트는 `this.queue`에 남아 다음 flush 대상이 됨.

---

## Out of Scope

- Story 004: FrameClock과의 통합 (tick → flush 연결은 다음 스토리)
- Story 005: 성능 측정 및 스트레스 테스트

---

## QA Test Cases

**AC-1**: emit 후 flush 전 핸들러 미실행
- Given: EventBus 인스턴스, PLAYER_MOVED 핸들러 등록
- When: `bus.emit('PLAYER_MOVED', payload)` 호출 (flush 없이)
- Then: 핸들러 호출 횟수 = 0
- Edge cases: 여러 번 emit해도 flush 없이는 0

**AC-2**: flush 후 FIFO 순서 실행
- Given: EventBus, 핸들러 등록. `emit('A')`, `emit('B')`, `emit('C')` 순서로 emit
- When: `bus.flush()` 호출
- Then: 핸들러 호출 순서 A → B → C
- Edge cases: 동일 이벤트 키 복수 emit도 순서 유지

**AC-3**: flush 중 emit 된 이벤트 — 다음 프레임 처리
- Given: 핸들러 내부에서 `bus.emit('ANOTHER_EVENT', ...)` 호출
- When: `bus.flush()` 실행
- Then: 핸들러 내 emit 이벤트는 현재 flush 중 실행되지 않음; 다음 `flush()` 호출 시 실행됨
- Edge cases: GRID_STALLED 체인(ADR-0009)에서 재귀 emit이 발생해도 스택 오버플로우 없음

**AC-4**: off 후 핸들러 미실행
- Given: 핸들러 등록 후 off로 제거
- When: emit → flush
- Then: 핸들러 호출 횟수 = 0

**AC-5**: flush() 외부 호출 가드
- Given: isFlushLocked = true 상태의 EventBus (FrameClock 미보유 상태)
- When: `bus.flush()` 직접 호출
- Then: `console.warn` 발행 또는 return 처리, 이벤트 미발행

---

## Test Evidence

**Story Type**: Logic
**Required evidence**:
- `tests/unit/events/eventbus_test.ts` — AC-1 ~ AC-5 모두 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 002 (GameEvents 타입 + IEventBus 인터페이스) must be DONE
- Unlocks: Story 004 (FrameClock 통합), Story 005 (스트레스 테스트)
