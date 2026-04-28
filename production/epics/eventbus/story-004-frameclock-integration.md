# Story 004: EventBus ↔ FrameClock 통합 — flush() 소유권

> **Epic**: EventBus
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0001 + ADR-0002 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음)

**ADR Governing Implementation**: ADR-0001 (EventBus), ADR-0002 (FrameClock)
**ADR Decision Summary**: `FrameClock.tick(dt)` 만이 `EventBus.flush()`를 호출할 수 있다. tick() 내 실행 순서: `simulatedTime += dt` → 스케줄 만료 체크 → `EventBus.flush()`. 이 계약이 결정론적 시뮬레이션의 기반이다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 순수 TypeScript. Cocos `update(dt)` 콜백이 `tick(dt)` 를 호출하는 연결고리는 Scene/Component 구현 시 별도로 처리.

**Control Manifest Rules (Foundation)**:
- Required: `FrameClock.tick(dt)` 는 Cocos `update(dt)` 에서만 호출 — source: ADR-0002
- Required: `tick()` 내 실행 순서: simulatedTime 갱신 → 스케줄 만료 → `EventBus.flush()` — source: ADR-0002
- Required: `flush()` 는 `FrameClock.tick()` 에서만 호출 — source: ADR-0001
- Forbidden: `flush()` 를 `FrameClock.tick()` 외부에서 호출 — source: ADR-0001

---

## Acceptance Criteria

- [ ] `FrameClock.tick(dt)` 호출 시 내부적으로 `EventBus.flush()` 가 정확히 1회 실행됨
- [ ] `tick()` 실행 순서 검증: simulatedTime이 갱신된 후 스케줄 만료 체크, 그 후 flush()
- [ ] `FrameClock` 없이 `EventBus.flush()` 를 직접 호출하면 경고/무시됨 (Story 003 결과 재확인)
- [ ] `FrameClock` 에 `IEventBus` 를 DI로 주입 (생성자 주입)
- [ ] `MockFrameClock` — `tick(dt)` 수동 호출로 테스트에서 시간 진행 제어 가능

---

## Implementation Notes

*ADR-0002 Decision 기반:*

```typescript
// src/core/time/FrameClock.ts
export class FrameClock implements IFrameClock {
  public simulatedTime = 0;
  private schedules: Array<{ fn: () => void; fireAt: number }> = [];

  constructor(private eventBus: IEventBus) {}

  tick(dt: number): void {
    this.simulatedTime += dt;                    // 1. 시간 갱신
    this.drainSchedules();                       // 2. 스케줄 만료 체크
    (this.eventBus as any).unlockFlush?.();      // flush 잠금 해제
    this.eventBus.flush();                       // 3. EventBus flush
    (this.eventBus as any).lockFlush?.();        // flush 재잠금
  }

  now(): number { return this.simulatedTime; }

  schedule(fn: () => void, delaySecs: number): void {
    this.schedules.push({ fn, fireAt: this.simulatedTime + delaySecs });
  }

  cancelSchedule(fn: () => void): void {
    const idx = this.schedules.findIndex(s => s.fn === fn);
    if (idx !== -1) this.schedules.splice(idx, 1);
  }

  private drainSchedules(): void {
    const due = this.schedules.filter(s => s.fireAt <= this.simulatedTime);
    this.schedules = this.schedules.filter(s => s.fireAt > this.simulatedTime);
    for (const { fn } of due) fn();
  }
}
```

**테스트 패턴 (MockFrameClock)**:
```typescript
// tests/helpers/MockFrameClock.ts
export class MockFrameClock implements IFrameClock {
  simulatedTime = 0;
  tick(dt: number): void { this.simulatedTime += dt; }
  now(): number { return this.simulatedTime; }
  schedule(fn: () => void, delaySecs: number): void { /* 수동 제어 */ }
  cancelSchedule(fn: () => void): void {}
  advanceBy(dt: number, bus: IEventBus): void {
    this.simulatedTime += dt;
    bus.flush();
  }
}
```

---

## Out of Scope

- Story 005: 성능 측정
- Cocos `update(dt)` → `tick(dt)` 연결 (GameRoot/Component 구현에서 처리)

---

## QA Test Cases

**AC-1**: tick() → flush() 정확히 1회
- Given: EventBus + FrameClock DI 설정. PLAYER_MOVED 핸들러 등록. emit('PLAYER_MOVED', ...)
- When: `clock.tick(0.016)` 1회 호출
- Then: 핸들러 호출 횟수 = 1
- Edge cases: tick() 2회 호출 시 각각 flush() 발생 — 총 핸들러 호출 = 2

**AC-2**: tick() 실행 순서
- Given: schedule(fn, 0.1) 등록 후 emit('EVENT_A'). tick(0.15) 호출
- When: tick(0.15) 실행
- Then: (1) simulatedTime = 0.15, (2) schedule fn 실행, (3) EVENT_A 핸들러 실행 — 이 순서
- Edge cases: schedule fn 내부에서 emit() → 현재 flush에 포함되지 않음

**AC-3**: MockFrameClock으로 시간 제어
- Given: MockFrameClock + EventBus. emit('PLAYER_ARRIVED') schedule(fn, 0.1)
- When: `mockClock.advanceBy(0.05, bus)` 2회 호출
- Then: 첫 번째 advanceBy 후 fn 미실행; 두 번째 후 fn 실행
- Edge cases: 정확히 0.1에 실행 (≥ 조건)

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/integration/events/frameclock-eventbus_test.ts` — AC-1 ~ AC-3 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 003 (EventBus 핵심 구현) must be DONE
- Unlocks: Story 005 (스트레스 테스트 — FrameClock 필요)
