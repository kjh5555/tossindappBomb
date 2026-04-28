# ADR-0002: FrameClock 결정론적 시간 모델 — simulatedTime + tick 패턴

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — `director.getScheduler()` 및 `update(dt)` 콜백은 LLM 훈련 범위 내, 3.8.6 변경 없음 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | 60fps 기준 simulatedTime 누적 오차가 1초당 ±1ms 이내임을 단위 테스트로 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus) — tick() 내에서 EventBus.flush() 호출 |
| **Enables** | ADR-0003 ~ ADR-0010 (모든 시간 기반 로직이 IFrameClock 의존) |
| **Blocks** | GridSimulation(nextExplosionTime), PlayerMovement(0.1s 트윈 추적), RoundEscalation(타임아웃 스케줄) 구현 |
| **Ordering Note** | Init order step 3 — EventBus와 동시 초기화. Cocos `onLoad` / 씬 루트 컴포넌트에서 가장 먼저 등록 |

## Context

### Problem Statement

`Date.now()`는 OS 시스템 클록에 의존하므로 두 클라이언트 또는 클라이언트-서버 간 동일 입력에 대해 다른 결과를 생성한다.
그 결과:
- `nextExplosionTime(cell)` 계산이 클라이언트마다 다름 → 서버 재조정 불일치
- DeathReplay 타임스탬프가 실제 게임 틱과 불일치 → 재생 버그
- 단위 테스트에서 시간 의존 로직을 제어 불가 → 비결정론적 테스트

### Constraints

- Cocos Creator 3.8.6 TypeScript 단일 스레드 환경
- 60fps 기준 dt ≈ 16.6ms — 프레임 예산 내에서 tick() 처리 완결
- WebSocket 서버와 타임스탬프를 공유해야 하므로 `simulatedTime` 단위는 초(seconds, float)
- `IFrameClock`은 테스트에서 mock 주입 가능해야 함 (DI 패턴)

### Requirements

- `now()` 는 항상 `simulatedTime` 반환 — `Date.now()` 사용 금지
- `tick(dt)` 는 프레임마다 정확히 1회 Cocos update 콜백에서 호출
- `tick(dt)` 내부에서 `EventBus.flush()` 를 단일 호출
- `schedule(fn, delay)` 는 simulatedTime 기준 상대적 딜레이 지원
- 단위 테스트에서 `tick()` 수동 호출로 시간 진행 제어 가능

## Decision

**`simulatedTime` 누적 delta 방식의 IFrameClock**을 채택한다.

- 내부 필드 `simulatedTime: number` 를 `0`으로 초기화
- `tick(dt: number)` 호출마다 `simulatedTime += dt`
- `now()` 는 `simulatedTime` 반환
- `dt()` 는 직전 tick의 dt 반환 (선택적 캐시)
- `schedule(fn, delay)` 는 `targetTime = simulatedTime + delay` 를 등록, 매 flush 이전 만료 체크
- **`tick()` 는 Cocos `update(dt)` 콜백 안에서만 호출** — 유일한 시간 진행 경로
- `tick()` 실행 순서: `simulatedTime += dt` → scheduled 만료 체크 → `EventBus.flush()`

### Architecture Diagram

```
Cocos update(dt) ──► FrameClock.tick(dt)
                          │
                    simulatedTime += dt
                          │
                    scheduled[] 만료 체크
                    (targetTime <= simulatedTime)
                          │  만료된 fn() 순서대로 호출
                          │
                    EventBus.flush()
                    (모든 큐 이벤트 드레인)
```

**시간 흐름 예시 (60fps, gate period 2.0s):**
```
frame 0:   simulatedTime = 0.000s  → GridSimulation.applyPattern() → emit CELL_STATE_CHANGED
frame 1:   simulatedTime = 0.016s  ...
...
frame 120: simulatedTime = 2.000s  → GridSimulation: gateTimer 만료 → emit CELL_EXPLODED
```

### Key Interfaces

```typescript
// src/core/time/FrameClock.ts

export interface IFrameClock {
  now(): number;                                   // simulatedTime (seconds, float)
  dt(): number;                                    // 직전 tick dt
  tick(dt: number): void;                          // Cocos update(dt) 전용 — 외부 호출 금지
  schedule(fn: () => void, delay: number): void;   // simulatedTime 기준 상대 딜레이
  cancelSchedule(fn: () => void): void;            // 등록된 스케줄 취소
}

// Invariants:
// 1. now()는 항상 simulatedTime 반환. Date.now() / performance.now() 사용 금지.
// 2. tick()은 Cocos update(dt) 콜백에서만 호출. 프레임당 정확히 1회.
// 3. tick() 내 실행 순서: simulatedTime 갱신 → 스케줄 만료 체크 → EventBus.flush().
// 4. 테스트에서는 tick() 수동 호출로 시간 진행 제어 — DI로 mock 대체 가능.

// 사용 예시 (GridSimulation):
// constructor(private clock: IFrameClock) {}
// update(dt: number): void {
//   if (this.clock.now() >= this.nextGateExpiry) { ... }
// }
```

## Alternatives Considered

### Alternative B: Date.now() + 서버 오프셋 보정
- **Description**: `Date.now()` 사용 후 서버 타임스탬프 차이를 오프셋으로 보정
- **Pros**: 별도 추상화 불필요
- **Cons**: 네트워크 지연 변동으로 오프셋 불안정. Toss webview 환경에서 OS 클록 드리프트 가능. 테스트에서 `Date.now()` mock 불편
- **Rejection Reason**: OQ-7 (webview 실기기 레이턴시 미확인) 상황에서 위험. 결정론적 재생 불가

### Alternative C: Cocos `director.getTotalTime()` 직접 사용
- **Description**: 엔진 내부 총 경과 시간을 직접 참조
- **Pros**: 별도 구현 없음
- **Cons**: `director.getTotalTime()`은 mock 불가 → 테스트에서 시간 제어 불가. 씬 리셋/일시정지 시 동작 미검증. IFrameClock 추상화 불가로 DI 위반
- **Rejection Reason**: 단위 테스트 가능성 원칙 위반 (CLAUDE.md: "All public methods must be unit-testable")

## Consequences

### Positive
- `nextExplosionTime()`, 게이트 타이머, 0.1s 트윈 추적이 동일 시간 소스 사용 → 클라이언트 간 일관성
- 테스트에서 `tick(0.1)` × 10 = 1초 진행 → 시간 의존 로직 정밀 검증 가능
- DeathReplay 타임스탬프가 simulatedTime 기준 → 게임 상태와 완벽 일치

### Negative
- Cocos update(dt) 콜백 외부에서 시간 진행 불가 — 비동기 I/O 타임아웃은 schedule()로 래핑 필요
- simulatedTime은 실제 wall-clock과 다를 수 있음 — 절대 시각 표시(UI 시계)에는 부적합

### Risks
- **dt 누적 오차**: 부동소수점 누적 오차가 장기 세션(5분 = 18,000 tick)에서 무시 가능 수준인지 검증 필요. **Mitigation**: 단위 테스트로 18,000 tick 후 오차 <5ms 확인
- **schedule 만료 순서**: 동일 simulatedTime에 두 스케줄이 만료되면 등록 순서(FIFO)로 처리. **Mitigation**: 구현 주석에 "FIFO 만료" 명시

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| grid-explosion.md | `nextExplosionTime(cell)` 서버 정합성 | simulatedTime 단일 소스로 클라이언트-서버 타임스탬프 일치 기반 제공 |
| player-movement.md | 0.1s 트윈 완료 후 PLAYER_ARRIVED 발행 | `schedule(fn, 0.1)` 로 simulatedTime 기준 0.1s 후 이벤트 큐잉 |
| round-manager.md | 라운드 타임아웃 / Goal Cell 판정 타이밍 | `schedule(fn, delay)` API로 결정론적 타임아웃 등록 |

## Performance Implications
- **CPU**: tick() 1회 = simulatedTime 갱신 + 스케줄 배열 순회 + EventBus.flush(). 스케줄 수 ~10/프레임 → <0.1ms
- **Memory**: 스케줄 배열 최대 ~20 entries — 무시 가능
- **Load Time**: FrameClock 초기화 <0.1ms
- **Network**: 해당 없음

## Migration Plan
신규 시스템 — 기존 코드 없음. 모든 시간 의존 모듈은 생성자 DI로 `IFrameClock` 수신. `Date.now()` / `performance.now()` 직접 참조는 forbidden_patterns에 등록.

## Validation Criteria
- [ ] 18,000 tick (5분 60fps) 후 simulatedTime 누적 오차 <5ms 단위 테스트 확인
- [ ] `tick(0.1)` × 10 후 `schedule(fn, 1.0)` 이 정확히 만료됨을 단위 테스트 확인
- [ ] EventBus.flush()가 tick() 내 simulatedTime 갱신 이후에 호출됨을 통합 테스트 확인
- [ ] 테스트 mock: tick() 수동 호출로 GridSimulation gate 만료 트리거 가능 확인

## Related Decisions
- ADR-0001: EventBus — flush() 단일 호출자가 FrameClock.tick()임을 확정
- ADR-0006: Gate Period 튜닝 — simulatedTime 기준 gate 만료 타이밍
- `docs/architecture/architecture.md` § 3.1 Frame Update Path, § 4.6 IFrameClock
