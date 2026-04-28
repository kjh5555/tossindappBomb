# Story 001: FrameClock 완성 + 단위 테스트

> **Epic**: FrameClock
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0002 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0002 Validation Criteria에서 추출)*

**ADR Governing Implementation**: ADR-0002 (FrameClock 결정론적 시간 모델)
**ADR Decision Summary**: `simulatedTime` 누적 delta 방식으로 결정론적 시간 제공. `tick(dt)` 호출마다 simulatedTime 갱신 → 스케줄 만료 → EventBus.flush() 순서 실행.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 순수 TypeScript — cc API 없음. 엔진 버전 무관.

**Control Manifest Rules (Foundation)**:
- Required: 모든 게임 로직 시간 참조는 `IFrameClock.now()` 사용 — source: ADR-0002
- Required: 시간 기반 지연은 `FrameClock.schedule(fn, delay)` 사용 — source: ADR-0002
- Forbidden: `Date.now()` in 게임 로직 — source: ADR-0002
- Guardrail: FrameClock tick ~10 schedules < 0.1ms — source: ADR-0002

---

## Acceptance Criteria

- [ ] `IFrameClock` 인터페이스에 `dt(): number` 메서드 추가 (직전 tick dt 반환)
- [ ] `FrameClock` 에 `dt()` 구현 — `lastDt` 필드 캐시
- [ ] `tick(0.05)` 2회 후 `schedule(fn, 0.1)` 등록 fn 실행 확인 (단위 테스트)
- [ ] `cancelSchedule` 후 tick 진행해도 fn 미실행 확인 (단위 테스트)
- [ ] 동일 simulatedTime에 만료되는 스케줄 FIFO 순서 실행 확인
- [ ] 18,000 tick (5분 60fps) 후 `simulatedTime` 누적 오차 < 5ms 확인

---

## Implementation Notes

*ADR-0002 Key Interfaces 기반:*

```typescript
// IFrameClock.ts — dt() 추가
export interface IFrameClock {
  readonly simulatedTime: number;
  tick(dt: number): void;
  now(): number;
  dt(): number;  // 직전 tick dt — 추가
  schedule(fn: () => void, delaySecs: number): void;
  cancelSchedule(fn: () => void): void;
}

// FrameClock.ts — lastDt 필드 추가
private lastDt = 0;

tick(dt: number): void {
  this.lastDt = dt;
  this.simulatedTime += dt;
  this.drainSchedules();
  (this.eventBus as any).unlockFlush?.();
  this.eventBus.flush();
  (this.eventBus as any).lockFlush?.();
}

dt(): number { return this.lastDt; }
```

**18,000 tick drift 검증 패턴**:
```typescript
// 60fps × 300s = 18,000 ticks
const DT = 1 / 60;
for (let i = 0; i < 18_000; i++) clock.tick(DT);
const expected = 18_000 * DT; // 300s
expect(Math.abs(clock.simulatedTime - expected)).toBeLessThan(0.005); // < 5ms
```

---

## Out of Scope

- Story 002: MockFrameClock ADR-0008 PLAYER_ARRIVED 패턴 검증
- Cocos update(dt) → tick(dt) 연결 (GameRoot/Component 구현)

---

## QA Test Cases

**AC-1**: tick(0.05) × 2 → schedule(fn, 0.1) 만료
- Given: FrameClock + EventBus. schedule(fn, 0.1) 등록.
- When: tick(0.05) 호출 후 tick(0.05) 다시 호출 (simulatedTime = 0.1)
- Then: fn 1회 실행 (fireAt=0.1 <= simulatedTime=0.1)
- Edge cases: tick(0.09) 후 미실행, tick(0.01) 추가 후 실행

**AC-2**: cancelSchedule 후 fn 미실행
- Given: schedule(fn, 0.1) 등록 후 cancelSchedule(fn) 호출
- When: tick(0.15) 호출 (만료 시점 초과)
- Then: fn 호출 횟수 = 0

**AC-3**: FIFO 순서 — 동일 만료 시점
- Given: schedule(fnA, 0.1), schedule(fnB, 0.1) 순서로 등록
- When: tick(0.15) 호출
- Then: fnA → fnB 순서로 실행

**AC-4**: dt() 반환 확인
- Given: FrameClock
- When: tick(0.016) 호출
- Then: clock.dt() === 0.016

**AC-5**: 18,000 tick drift < 5ms
- Given: DT = 1/60
- When: 18,000회 tick(DT) 호출
- Then: |simulatedTime - 300.0| < 0.005

---

## Test Evidence

**Story Type**: Logic
**Required evidence**:
- `tests/unit/time/frameclock_test.ts` — AC-1 ~ AC-5 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: EventBus Story 003 (IEventBus + EventBus 구현) must be DONE ✅
- Unlocks: Story 002 (MockFrameClock PLAYER_ARRIVED 패턴 검증)
