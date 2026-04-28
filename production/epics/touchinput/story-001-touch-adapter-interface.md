# Story 001: IMovementHandler 인터페이스 + TouchInputAdapter 기본 구조

> **Epic**: TouchInput
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md` (터치 입력 요구사항 참조)
**Requirement**: `TR-touchinput-001`, `TR-touchinput-004`, `TR-touchinput-005`, `TR-touchinput-006`
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

> ⚠️ TR-touchinput-* 항목이 tr-registry.yaml에 미등록. `/architecture-review` 실행 시 추가됨. ADR-0017 직접 참조로 구현.

**ADR Governing Implementation**: ADR-0017: TouchInput 터치 파이프라인
**ADR Decision Summary**: `TouchInputAdapter` (Foundation)가 Cocos Creator 터치 이벤트를 수신해 JOY_THRESHOLD(18px) 필터링 + Direction8 매핑 후 주입받은 `IMovementHandler` 인터페이스를 통해 `tryMove()`를 직접 호출한다. 탭(드래그 없는 터치)은 `EventBus.emit('TAP_DETECTED', ...)` 경유. Foundation→Core 직접 의존 없음.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: `node.on(Input.EventType.TOUCH_START/MOVE/END/CANCEL)` 패턴은 3.8.x 범위. 첫 구현 시 실기기 검증 필수 (ADR-0017 Verification Required). 헤드리스 단위 테스트는 MockTouchEvent로 격리.

**Control Manifest Rules (Foundation layer)**:
- Required: 레이어 간 통신은 `IMovementHandler` 인터페이스 메서드 호출만 — 구체 클래스 직접 참조 금지
- Required: EventBus를 통해 TAP_DETECTED 발행 (`IEventBus.emit` 경유)
- Forbidden: Foundation 레이어에서 `PlayerMovement` 구체 타입 직접 import
- Forbidden: `Date.now()` / `performance.now()` — `IFrameClock.now()` 사용

---

## Acceptance Criteria

*From ADR-0017, scoped to this story:*

- [ ] **AC-TI-1**: `src/core/input/IMovementHandler.ts` 파일 존재. 인터페이스 정의: `onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void`
- [ ] **AC-TI-2**: `src/core/input/TouchInputAdapter.ts` 파일 존재. `constructor(handler: IMovementHandler, bus: IEventBus, clock: IFrameClock, playerId: PlayerId)` 시그니처.
- [ ] **AC-TI-3**: `TouchInputAdapter.attachToNode(node: Node)` — `TOUCH_START`, `TOUCH_MOVE`, `TOUCH_END`, `TOUCH_CANCEL` 이벤트 등록.
- [ ] **AC-TI-4**: JOY_THRESHOLD(18px) dead zone — `magnitude = Math.hypot(dx, dy) < 18` 시 `onMoveIntent` 미호출.
- [ ] **AC-TI-5**: 멀티터치 가드 — `TOUCH_START` 시 `activeTouchId = event.getID()` 저장; 이후 `TOUCH_MOVE/END`에서 `event.getID() !== activeTouchId` 이면 무시.
- [ ] **AC-TI-6**: 탭 감지 — `TOUCH_END` 시 `totalDisplacement < JOY_THRESHOLD`이면 `bus.emit('TAP_DETECTED', { pos: endPos, timestamp: clock.now() })` 발행; `onMoveIntent` 미호출.
- [ ] **AC-TI-7**: 탭이 아닌 경우 `TAP_DETECTED` 미발행 (displacement ≥ JOY_THRESHOLD).

---

## Implementation Notes

*Derived from ADR-0017 Implementation Guidelines:*

```typescript
// src/core/input/IMovementHandler.ts  (Foundation 레이어 정의)
export interface IMovementHandler {
  onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void;
}

// src/core/input/TouchInputAdapter.ts
export class TouchInputAdapter {
  private activeTouchId: number | null = null;
  private startPos: { x: number; y: number } = { x: 0, y: 0 };

  constructor(
    private readonly handler: IMovementHandler,
    private readonly bus: IEventBus,
    private readonly clock: IFrameClock,
    private readonly playerId: PlayerId,
  ) {}

  attachToNode(node: Node): void {
    node.on(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
    node.on(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
    node.on(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
    node.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
  }

  detachFromNode(node: Node): void {
    node.off(Input.EventType.TOUCH_START,  this.onTouchStart,  this);
    node.off(Input.EventType.TOUCH_MOVE,   this.onTouchMove,   this);
    node.off(Input.EventType.TOUCH_END,    this.onTouchEnd,    this);
    node.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd,    this);
  }

  private onTouchStart(event: EventTouch): void {
    if (this.activeTouchId !== null) return;  // AC-TI-5: 멀티터치 무시
    this.activeTouchId = event.getID();
    const pos = event.getLocation();
    this.startPos = { x: pos.x, y: pos.y };
  }

  private onTouchMove(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return;  // AC-TI-5
    // Direction8 매핑 + MOVE_REPEAT → Story 002 scope
  }

  private onTouchEnd(event: EventTouch): void {
    if (event.getID() !== this.activeTouchId) return;  // AC-TI-5
    const pos = event.getLocation();
    const dx = pos.x - this.startPos.x;
    const dy = pos.y - this.startPos.y;
    const magnitude = Math.hypot(dx, dy);

    if (magnitude < JOY_THRESHOLD) {
      // AC-TI-6: 탭 감지
      this.bus.emit('TAP_DETECTED', { pos: { x: pos.x, y: pos.y }, timestamp: this.clock.now() });
    }
    this.activeTouchId = null;
  }
}

export const JOY_THRESHOLD = 18;  // px — ADR-0017 확정값
```

- 단위 테스트는 `MockMovementHandler`를 주입해 `TouchInputAdapter` 격리 테스트. Cocos 노드 이벤트 등록(`attachToNode`)은 Story 003(Visual/Feel) 실기기 검증 범위.
- `direction` 계산(angleToDirection8)과 MOVE_REPEAT 타이머는 Story 002 scope.

---

## Out of Scope

- **Story 002**: Direction8 각도 매핑, MOVE_REPEAT 연속 이동, `onMoveIntent` 실제 호출
- **Story 003**: Cocos 노드 실제 연결(`attachToNode`), 실기기 플레이테스트

---

## QA Test Cases

- **AC-TI-4**: JOY_THRESHOLD dead zone
  - Given: `TouchInputAdapter` with `MockMovementHandler`; `TOUCH_START` at `{0,0}`, `TOUCH_MOVE` to `{10,0}` (magnitude=10 < 18)
  - When: `onTouchMove` 처리
  - Then: `MockMovementHandler.onMoveIntent` 호출 없음
  - Edge cases: magnitude=17px → 미호출; magnitude=18px → Story 002에서 호출됨; magnitude=0 → TAP_DETECTED 후보

- **AC-TI-5**: 멀티터치 가드
  - Given: `TOUCH_START` with touchId=1 (activeTouchId=1); 두 번째 `TOUCH_START` with touchId=2
  - When: touchId=2의 `TOUCH_MOVE` / `TOUCH_END` 처리
  - Then: 두 번째 터치 이벤트 무시; `onMoveIntent` 미호출; `TAP_DETECTED` 미발행
  - Edge cases: touchId=1 `TOUCH_END` 후 touchId=2 `TOUCH_START` → 정상 처리 (첫 터치 해제 후 신규)

- **AC-TI-6 + AC-TI-7**: 탭 감지 vs. 드래그 분기
  - Given: `TOUCH_START` at `{0,0}`; `TOUCH_END` at `{5,5}` (magnitude≈7 < 18)
  - When: `onTouchEnd` 처리
  - Then: `bus.emit('TAP_DETECTED', { pos:{5,5}, timestamp: clock.now() })` 1회 호출; `onMoveIntent` 0회 호출
  - Edge cases: displacement=18px 정확히 → tap 아님, `TAP_DETECTED` 미발행; displacement=17.9px → 탭, `TAP_DETECTED` 발행

- **AC-TI-1 + AC-TI-2**: 인터페이스 타입 검증
  - Given: `IMovementHandler` 인터페이스 정의; `MockMovementHandler implements IMovementHandler`
  - When: TypeScript 컴파일
  - Then: 컴파일 성공; `TouchInputAdapter` 생성자에 `IMovementHandler` 구체 타입 없음

---

## Test Evidence

**Story Type**: Logic
**Required evidence**: `tests/unit/input/touch_adapter_test.ts` — must exist and pass

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None (Foundation layer, no upstream story dependency)
- Unlocks: Story 002 (Direction8 매핑이 이 story의 TouchInputAdapter 구조 위에서 구현됨)

## Completion Notes
**Completed**: 2026-04-22
**Criteria**: 7/7 passing
**Deviations**: ADVISORY — tests/unit/events/eventbus_test.ts stale EscalationContext shape 수정 (scope 외, test suite 안정화 목적)
**Test Evidence**: Logic: tests/unit/input/touch_adapter_test.ts — 14 tests, all pass
**Code Review**: Skipped (Lean mode)
