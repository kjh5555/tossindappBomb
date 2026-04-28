# Story 002: Direction8 각도 매핑 + MOVE_REPEAT 연속 이동 + PlayerMovement.onMoveIntent()

> **Epic**: TouchInput
> **Status**: Complete
> **Layer**: Foundation (+ Core boundary via IMovementHandler)
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirement**: `TR-touchinput-002`, `TR-touchinput-003`, `TR-touchinput-007`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0017: TouchInput 터치 파이프라인
**ADR Decision Summary**: `TOUCH_MOVE`에서 `displacement = currentPos - startPos` → `magnitude ≥ JOY_THRESHOLD` 시 `angleToDirection8(atan2(-dy, dx) * 180/π)`로 Direction8 계산. `TOUCH_START` 또는 방향 변경 시 즉시 `handler.onMoveIntent()` 호출. MOVE_REPEAT(0.22s): `clock.now() - lastMoveAt >= 0.22s`이면 동일 방향 재호출. `PlayerMovement`에 `onMoveIntent(playerId, direction, magnitude)` 메서드 추가 → 내부적으로 `tryMove()` 호출.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: Cocos Y축 반전 처리 포함: `angleDeg = atan2(-dy, dx) * 180 / Math.PI`. `IFrameClock.now()` 기반 타이밍 — `Date.now()` 사용 금지.

**Control Manifest Rules (Foundation layer)**:
- Required: `IFrameClock.now()` 기반 MOVE_REPEAT 타이밍 — `Date.now()` 금지
- Required: `IMovementHandler.onMoveIntent()` 인터페이스 경유 — `PlayerMovement` 직접 참조 금지
- Forbidden: `Math.random()` in direction calculation
- Guardrail: Frame budget <0.1ms (CPU) — 터치 이벤트 핸들러는 경량이어야 함

---

## Acceptance Criteria

*From ADR-0017, scoped to this story:*

- [ ] **AC-TI-8**: `angleToDirection8(angleDeg: number): Direction8` 함수 — 8방향 경계값(±22.5° 구간) 정확 매핑. 0°=우(0), 45°=우하(1), 90°=하(2), 135°=좌하(3), 180°=좌(4), 225°=좌상(5), 270°=상(6), 315°=우상(7).
- [ ] **AC-TI-9**: `TOUCH_START` 후 즉시 첫 `onMoveIntent` 호출 — 방향 유효(magnitude ≥ JOY_THRESHOLD)이면 `TOUCH_START` 시점에 즉시 호출.
- [ ] **AC-TI-10**: `TOUCH_MOVE`에서 MOVE_REPEAT — `clock.now() - lastMoveAt >= MOVE_REPEAT(0.22s)` 경과 시 동일 방향 재호출.
- [ ] **AC-TI-11**: 방향 변경 시 MOVE_REPEAT 타이머 리셋 — 새 방향으로 즉시 `onMoveIntent` 호출; `lastMoveAt` 갱신.
- [ ] **AC-TI-12**: `TOUCH_END` 시 MOVE_REPEAT 타이머 정지 — 이후 `clock` 진행해도 `onMoveIntent` 미호출.
- [ ] **AC-TI-13**: `PlayerMovement.onMoveIntent(playerId, direction, magnitude)` 메서드 추가 — 내부적으로 `this.tryMove(playerId, direction)` 호출. `IMovementHandler` 인터페이스 구현 선언.

---

## Implementation Notes

*Derived from ADR-0017 Implementation Guidelines:*

```typescript
// src/core/input/TouchInputAdapter.ts — TOUCH_MOVE 추가 (Story 001 위에 빌드)

private lastMoveAt: number = -Infinity;
private lastDirection: Direction8 | null = null;

private onTouchMove(event: EventTouch): void {
  if (event.getID() !== this.activeTouchId) return;

  const pos = event.getLocation();
  const dx = pos.x - this.startPos.x;
  const dy = pos.y - this.startPos.y;
  const magnitude = Math.hypot(dx, dy);

  if (magnitude < JOY_THRESHOLD) return;  // AC-TI-4 (Story 001 dead zone)

  // AC-TI-8: Cocos Y축 반전 처리 (-dy)
  const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const direction = angleToDirection8(angleDeg);

  const now = this.clock.now();
  const dirChanged = direction !== this.lastDirection;
  const repeatElapsed = now - this.lastMoveAt >= MOVE_REPEAT;

  if (dirChanged || repeatElapsed) {
    this.handler.onMoveIntent(this.playerId, direction, magnitude);
    this.lastMoveAt = now;
    this.lastDirection = direction;
  }
}

private onTouchStart(event: EventTouch): void {
  if (this.activeTouchId !== null) return;
  this.activeTouchId = event.getID();
  const pos = event.getLocation();
  this.startPos = { x: pos.x, y: pos.y };
  this.lastMoveAt = -Infinity;  // reset so first move fires immediately
  this.lastDirection = null;
}

private onTouchEnd(event: EventTouch): void {
  if (event.getID() !== this.activeTouchId) return;
  // ... tap detection (Story 001) ...
  this.lastDirection = null;  // AC-TI-12: TOUCH_END → stop MOVE_REPEAT
  this.activeTouchId = null;
}

// angleToDirection8 (src/core/input/TouchInputAdapter.ts)
export function angleToDirection8(angleDeg: number): Direction8 {
  // Normalize to 0-360
  const normalized = ((angleDeg % 360) + 360) % 360;
  // Each direction spans 45°, offset by 22.5°
  return Math.round(normalized / 45) % 8 as Direction8;
}

export const MOVE_REPEAT = 0.22;  // seconds — ADR-0017 확정값

// -----------------------------------------------------------------
// src/core/player/PlayerMovement.ts — onMoveIntent 추가 (AC-TI-13)
// -----------------------------------------------------------------
// PlayerMovement implements IMovementHandler (Story 002 scope)

import type { IMovementHandler } from '../input/IMovementHandler';

export class PlayerMovement implements IMovementHandler {
  // ... existing tryMove() logic from sprint-2 story-001 ...

  onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void {
    // magnitude is already guaranteed >= JOY_THRESHOLD by TouchInputAdapter
    this.tryMove(playerId, direction);
  }
}
```

- `angleToDirection8`는 `src/core/input/TouchInputAdapter.ts`에 export 함수로 정의 — 단위 테스트에서 직접 호출 가능.
- `lastMoveAt = -Infinity` 초기화로 TOUCH_START 직후 첫 TOUCH_MOVE 즉시 `onMoveIntent` 호출 보장 (AC-TI-9).
- `PlayerMovement`가 `IMovementHandler`를 구현하므로 `TouchInputAdapter`는 `new PlayerMovement()` 직접 참조 불필요.

---

## Out of Scope

- **Story 001**: `attachToNode`, dead zone 가드, 멀티터치 가드, TAP_DETECTED 탭 감지
- **Story 003**: Cocos 노드 실제 연결 (`attachToNode` 호출), 실기기 8방향 반응 플레이테스트

---

## QA Test Cases

- **AC-TI-8**: angleToDirection8 경계값
  - Given: `angleToDirection8` 함수
  - When: 8방향 중심각 및 경계각 입력
  - Then: 0°→0(우), 45°→1(우하), 90°→2(하), 135°→3(좌하), 180°→4(좌), 225°→5(좌상), 270°→6(상), 315°→7(우상); 22.5°(경계)→0 또는 1 중 하나로 결정론적 매핑
  - Edge cases: -45°→7(우상); 360°→0(우); 361°→0(우); -1°→7(우상)

- **AC-TI-9**: TOUCH_START 즉시 첫 호출
  - Given: `MockFrameClock` at t=5.0; `MockMovementHandler`; `TOUCH_START` at `{0,0}`; `TOUCH_MOVE` to `{30,0}` (magnitude=30 ≥ 18)
  - When: `onTouchMove` 처리
  - Then: `MockMovementHandler.onMoveIntent` 1회 호출; `direction=0`(우); `magnitude=30`; `lastMoveAt=5.0`
  - Edge cases: TOUCH_MOVE 이전 TOUCH_START만으로는 호출 없음 (magnitude는 MOVE에서만 계산)

- **AC-TI-10**: MOVE_REPEAT 0.22s 타이밍
  - Given: `lastMoveAt=5.0`; `MockFrameClock`; 같은 방향으로 TOUCH_MOVE 연속
  - When: t=5.1 → `onTouchMove` (경과=0.1s < 0.22); t=5.22 → `onTouchMove` (경과=0.22s ≥ 0.22)
  - Then: t=5.1 → `onMoveIntent` 미호출; t=5.22 → `onMoveIntent` 1회 호출
  - Edge cases: t=5.219 → 미호출; t=5.220 → 호출 (경계값 포함)

- **AC-TI-11**: 방향 변경 시 즉시 호출
  - Given: `lastDirection=0`(우); `lastMoveAt=5.0`; t=5.1 (0.1s 경과)
  - When: `onTouchMove` with direction=2(하) (방향 변경)
  - Then: MOVE_REPEAT 미경과 무관하게 즉시 `onMoveIntent(playerId, 2, magnitude)` 호출; `lastMoveAt=5.1`; `lastDirection=2`

- **AC-TI-12**: TOUCH_END 후 타이머 정지
  - Given: 방향=0(우) 유지 중; `TOUCH_END` 수신 후 클록 5초 진행
  - When: 클록 진행 (TOUCH_MOVE 이벤트 없음)
  - Then: `onMoveIntent` 미호출 (TOUCH_END 이후 이벤트 없음; 수동 타이머 없음)

- **AC-TI-13**: PlayerMovement.onMoveIntent 위임
  - Given: `PlayerMovement` 인스턴스; player at `{3,3}`; `IMovementHandler` 인터페이스 구현 확인
  - When: `onMoveIntent(playerId, 0, 25)` 호출
  - Then: `tryMove(playerId, 0)` 내부 호출됨; `logicalCoord` 업데이트 (Sprint 2 story-001 동작 재확인)
  - Edge cases: `magnitude=18` (최소값) → 호출됨; TypeScript: `PlayerMovement`가 `IMovementHandler` 구현 선언 없으면 컴파일 에러

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/input/move_intent_repeat_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 must be DONE (`TouchInputAdapter` 기본 구조, `JOY_THRESHOLD` 상수 필요)
- Unlocks: Story 003 (실기기 테스트는 001+002 모두 구현된 이후)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 6/6 passing
**Deviations**: None
**Test Evidence**: Logic: tests/unit/input/move_intent_repeat_test.ts — 29 tests, all pass
**Code Review**: Skipped (Lean mode)
