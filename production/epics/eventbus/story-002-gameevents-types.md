# Story 002: GameEvents 타입 정의 + IEventBus 인터페이스

> **Epic**: EventBus
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0001 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0001 Key Interfaces에서 추출)*

**ADR Governing Implementation**: ADR-0001 (EventBus 아키텍처)
**ADR Decision Summary**: 모든 게임 이벤트는 `GameEvents` 인터페이스로 컴파일 타임에 타입 검증됨. 잘못된 이벤트 키는 TypeScript 컴파일 에러를 발생시킨다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 순수 TypeScript — cc API 없음. 엔진 버전 무관.

**Control Manifest Rules (Foundation)**:
- Required: `GameEvents` 인터페이스로 컴파일 타임 타입 검증 필수 — source: ADR-0001
- Required: `IEventBus` DI 인터페이스 정의 — source: ADR-0001
- Forbidden: string 리터럴 이벤트 키 사용 (타입 안전성 없음) — source: ADR-0001

---

## Acceptance Criteria

- [ ] `src/core/events/GameEvents.ts` 에 `GameEvents` 인터페이스 정의 (14개 이벤트)
- [ ] `src/core/events/EventBus.ts` 에 `IEventBus` 인터페이스 정의
- [ ] 알 수 없는 이벤트 키로 `emit()` 호출 시 TypeScript 컴파일 에러 발생
- [ ] 모든 이벤트 페이로드에 `timestamp: number` 필드 포함
- [ ] `Domain.ts` 에 `CellCoord`, `CellState`, `PlayerId`, `EscalationContext` 타입 정의
- [ ] `src/core/events/` 에서 `import` 한 타입만으로 14개 이벤트 페이로드 구성 가능

---

## Implementation Notes

*ADR-0001 Key Interfaces 그대로 구현:*

```typescript
// src/core/types/Domain.ts
export type PlayerId = string;
export type CellState = 'IDLE' | 'WARNING' | 'DANGER_ZONE' | 'EXPLODING';
export interface CellCoord { row: number; col: number; }
export interface EscalationContext { round: number; gatePeriod: number; aliveCount: number; }

// src/core/events/GameEvents.ts
export interface GameEvents {
  CELL_STATE_CHANGED:  { cell: CellCoord; state: CellState; timestamp: number };
  CELL_EXPLODED:       { cell: CellCoord; timestamp: number };
  PLAYER_KILLED:       { playerIds: PlayerId[]; cellId: CellCoord; cause: 'EXPLOSION' | 'DANGER_ZONE'; timestamp: number };
  GRID_STALLED:        { roundNumber: number; timestamp: number };
  PATTERN_REJECTED:    { patternId: string; reason: string; timestamp: number };
  PLAYER_MOVED:        { playerId: PlayerId; from: CellCoord; to: CellCoord; timestamp: number };
  PLAYER_ARRIVED:      { playerId: PlayerId; cell: CellCoord; timestamp: number };
  ROUND_STARTED:       { roundNumber: number; ctx: EscalationContext; timestamp: number };
  ROUND_CLEAR:         { roundNumber: number; survivors: PlayerId[]; timestamp: number };
  GAME_OVER:           { finalRound: number; rankings: PlayerId[]; timestamp: number };
  ALIVE_COUNT_CHANGED: { aliveCount: number; timestamp: number };
  GOAL_PLACED:         { cell: CellCoord; timestamp: number };
  ESCALATION_COMPUTED: { ctx: EscalationContext; timestamp: number };
  AUDIO_EVENT:         { key: 'EXPLOSION' | 'GATE_SAFE' | 'ROUND_CLEAR' | 'GAME_OVER'; cellId?: CellCoord };
  TAP_DETECTED:        { pos: { x: number; y: number }; timestamp: number };
}

// src/core/events/EventBus.ts (인터페이스 부분)
export interface IEventBus {
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void;
  on<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  off<K extends keyof GameEvents>(key: K, handler: (e: GameEvents[K]) => void): void;
  flush(): void;
}
```

**주의**: `flush()`는 `IEventBus`에 포함되어 있지만, 외부 호출자는 `FrameClock.tick()` 뿐이다. 다른 모듈은 `IEventBus`를 받아도 `flush()`를 호출하지 말 것.

---

## Out of Scope

- Story 003: 실제 EventBus 구현체 (`flush()` 큐 로직)
- Domain 타입 외 비즈니스 로직

---

## QA Test Cases

**AC-1**: 올바른 이벤트 emit — 컴파일 통과
- Given: `IEventBus` 를 구현한 MockEventBus
- When: `bus.emit('PLAYER_MOVED', { playerId: 'p1', from: {row:0,col:0}, to: {row:0,col:1}, timestamp: 0 })`
- Then: TypeScript 컴파일 에러 없음
- Edge cases: 페이로드 필드 누락 시 컴파일 에러

**AC-2**: 잘못된 이벤트 키 — 컴파일 에러
- Given: `IEventBus` 인스턴스
- When: `bus.emit('UNKNOWN_EVENT' as any, {})` 소스 코드에서 타입 캐스팅 없이 사용
- Then: TypeScript 컴파일 에러 `Argument of type '"UNKNOWN_EVENT"' is not assignable`
- Edge cases: `as any` 캐스팅으로 우회 시 런타임 타입 가드 없음 (컴파일타임 가드만)

**AC-3**: timestamp 필드 누락
- Given: PLAYER_KILLED 페이로드에서 timestamp 제거
- When: tsc 컴파일
- Then: 컴파일 에러 `Property 'timestamp' is missing`

---

## Test Evidence

**Story Type**: Logic
**Required evidence**:
- `tests/unit/events/game-events_test.ts` — 컴파일 검증 + 타입 체크 테스트 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (test scaffold) must be DONE
- Unlocks: Story 003 (EventBus 구현은 이 인터페이스 기반)
