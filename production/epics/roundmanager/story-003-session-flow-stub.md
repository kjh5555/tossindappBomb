# Story 003: 최소 SessionFlow 스텁

> **Epic**: RoundManager
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/round-manager.md`
**Requirements**: `TR-roundmanager-005`, `TR-roundmanager-006`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0001 (EventBus) + ADR-0003 (Layer Boundaries)
**ADR Decision Summary**: SessionFlow은 Feature 레이어 순수 TypeScript 상태 기계. 이벤트 구독은 생성자에서 1회만 (`on()/off()` 초기화 규칙 — ADR-0001). GAME_OVER/ROUND_CLEAR 이벤트 수신 시 MATCH → RESULT 전환. 레이어 경계: SessionFlow은 IEventBus에만 의존, 구체 클래스 직접 참조 없음 (ADR-0003).

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: LOW
**Engine Notes**: 순수 TypeScript. 엔진 API 없음.

**Control Manifest Rules (Feature layer)**:
- Required: 이벤트 구독은 생성자에서 1회 (`on()` — ADR-0001)
- Required: 핸들러 내 state guard (`if (state !== 'MATCH') return`) — 중복 전환 방지
- Forbidden: `flush()` 직접 호출 — ADR-0001
- Forbidden: 구체 클래스 직접 의존 (EventBus, FrameClock) — 인터페이스만 사용

---

## Acceptance Criteria

*Sprint 4 S4-S2 정의 기준:*

- [ ] **AC-SF-01**: 초기 상태 `MENU`. `getState()` 반환값 확인.
- [ ] **AC-SF-02**: `startMatch()` 호출 → state가 `MATCH`로 전환.
- [ ] **AC-SF-03**: `startMatch()` 이 `MENU` 이외 상태에서 호출 → state 변경 없음 (가드).
- [ ] **AC-SF-04**: GAME_OVER 이벤트 수신 (MATCH 중) → state가 `RESULT`로 전환.
- [ ] **AC-SF-05**: ROUND_CLEAR 이벤트 수신 (MATCH 중) → state가 `RESULT`로 전환.
- [ ] **AC-SF-06**: GAME_OVER 이벤트 수신 (MENU 상태) → state 변경 없음 (가드).
- [ ] **AC-SF-07**: GAME_OVER 이벤트 수신 (RESULT 상태) → state 변경 없음 (중복 방지).
- [ ] **AC-SF-08**: `reset()` 호출 (RESULT 상태) → state가 `MENU`로 전환.
- [ ] **AC-SF-09**: 전체 플로우 — `startMatch()` → GAME_OVER → `reset()` → `startMatch()` 재시작 가능.

---

## Implementation Notes

*SessionFlow은 순수 TypeScript 상태 기계. 코코스 씬 전환 없음.*

```typescript
export type SessionState = 'MENU' | 'MATCH' | 'RESULT';

export class SessionFlow {
  private state: SessionState = 'MENU';

  constructor(private readonly bus: IEventBus) {
    // ADR-0001: subscribe once at init
    bus.on('GAME_OVER', () => this.handleMatchEnded());
    bus.on('ROUND_CLEAR', () => this.handleMatchEnded());
  }

  getState(): SessionState { return this.state; }

  startMatch(): void {
    if (this.state !== 'MENU') return;
    this.state = 'MATCH';
  }

  reset(): void {
    this.state = 'MENU';
  }

  private handleMatchEnded(): void {
    if (this.state !== 'MATCH') return; // AC-SF-06, AC-SF-07
    this.state = 'RESULT';
  }
}
```

---

## Out of Scope

*이 스토리에서 구현하지 않는 항목:*

- UI 전환 (씬 변경, 화면 애니메이션) — Presentation 레이어
- 멀티 라운드 자동 진행 로직 — RoundManager 내부에서 처리
- 서버 세션 관리, 매치메이킹 — 별도 matchmaking epic
- `onStateChange` 콜백/이벤트 발행 — 필요시 추후 추가

---

## QA Test Cases

*Written at story creation — implement against these.*

**AC-SF-01** — 초기 상태
- Given: `new SessionFlow(bus)` 생성 직후
- When: `sf.getState()`
- Then: `'MENU'`

**AC-SF-02** — startMatch 전환
- Given: state = MENU
- When: `sf.startMatch()`
- Then: `sf.getState() === 'MATCH'`

**AC-SF-03** — startMatch guard
- Given: state = MATCH
- When: `sf.startMatch()`
- Then: `sf.getState() === 'MATCH'` (변화 없음)

**AC-SF-04** — GAME_OVER → RESULT
- Given: state = MATCH
- When: bus emits GAME_OVER; flush
- Then: `sf.getState() === 'RESULT'`

**AC-SF-05** — ROUND_CLEAR → RESULT
- Given: state = MATCH
- When: bus emits ROUND_CLEAR; flush
- Then: `sf.getState() === 'RESULT'`

**AC-SF-06** — GAME_OVER guard (MENU)
- Given: state = MENU
- When: bus emits GAME_OVER; flush
- Then: `sf.getState() === 'MENU'` (변화 없음)

**AC-SF-07** — GAME_OVER guard (RESULT, 중복 방지)
- Given: state = RESULT
- When: bus emits GAME_OVER; flush
- Then: `sf.getState() === 'RESULT'` (변화 없음)

**AC-SF-08** — reset
- Given: state = RESULT
- When: `sf.reset()`
- Then: `sf.getState() === 'MENU'`

**AC-SF-09** — 전체 플로우 재시작
- Given: 초기 상태
- When: startMatch() → emit GAME_OVER + flush → reset() → startMatch()
- Then: 최종 state === 'MATCH'

---

## Test Evidence

**Story Type**: Integration
**Required evidence**: `tests/integration/session/session_flow_test.ts` — must exist and pass

**Status**: [x] `tests/integration/session/session_flow_test.ts` — 14 tests, all passing

---

## Completion Notes
**Completed**: 2026-04-23
**Criteria**: 9/9 passing (AC-SF-01 through AC-SF-09)
**Deviations**: None
**Test Evidence**: Integration: tests/integration/session/session_flow_test.ts — 14 tests, all passing (348 total suite)
**Code Review**: Skipped — Lean mode

---

## Dependencies

- Depends on: Story 002 must be DONE (GAME_OVER 이벤트 발행 확인됨)
- Unlocks: S4-N1 (UX 스크린 스펙 — Lobby + Result)
