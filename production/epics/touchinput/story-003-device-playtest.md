# Story 003: Cocos 노드 연동 + 실기기 플레이테스트

> **Epic**: TouchInput
> **Status**: Ready
> **Layer**: Foundation
> **Type**: Visual/Feel
> **Manifest Version**: 2026-04-22

## Context

**GDD**: `design/gdd/player-movement.md`
**Requirement**: `TR-touchinput-008` (실기기 검증)
*(Requirement text lives in `docs/architecture/tr-registry.yaml` — read fresh at review time)*

**ADR Governing Implementation**: ADR-0017: TouchInput 터치 파이프라인
**ADR Decision Summary**: `TouchInputAdapter.attachToNode(gridNode)` 호출로 Cocos Creator 노드에 이벤트 등록. 헤드리스 단위 테스트 불가 — 통합 테스트 또는 플레이테스트로 검증 (ADR-0017 Negative Consequence). 실기기에서 `node.on(Input.EventType.TOUCH_*)` 정상 동작 및 8방향 이동 반응성 확인 필수.

**Engine**: Cocos Creator 3.8.6 (TypeScript) | **Risk**: MEDIUM
**Engine Notes**: ADR-0017 Verification Required:
- `node.on(Input.EventType.TOUCH_START/MOVE/END)` 이 Cocos Creator 3.8.6에서 정상 동작하는지 첫 터치 테스트 필수
- 멀티터치 시 `event.getTouches()[0]` 이 첫 터치만 반환하는지 확인
- 토스 인토스 webview 환경에서 터치 이벤트 전파가 차단되지 않는지 확인

**Control Manifest Rules (Foundation layer)**:
- Required: Scene 초기화 코드에서 `adapter.attachToNode(gridNode)` 연결 — `RoundManager` 또는 Scene `onLoad()`에서 호출
- Guardrail: CPU <0.1ms/frame (터치 이벤트 핸들러 경량 유지)

---

## Acceptance Criteria

*From ADR-0017 Validation Criteria, Visual/Feel scoped to this story:*

- [ ] **AC-TI-14**: Scene 초기화 시 `adapter.attachToNode(gridNode)` 호출 코드 존재 — `RoundManager.init()` 또는 GameScene `onLoad()` 내부.
- [ ] **AC-TI-15**: 실기기 플레이테스트 — 8방향 이동이 자연스럽게 반응함. 조이스틱 변위 방향과 플레이어 이동 방향이 직관적으로 일치.
- [ ] **AC-TI-16**: 실기기에서 JOY_THRESHOLD 미만 터치(탭) 시 플레이어 이동 없음 확인 (눈으로 확인).
- [ ] **AC-TI-17**: 실기기에서 멀티터치(두 손가락) 시 첫 번째 터치만 처리됨 확인.
- [ ] **AC-TI-18**: 토스 인토스 webview 환경에서 터치 이벤트 정상 전달 확인 (또는 Preview 모드로 대체).

---

## Implementation Notes

*Derived from ADR-0017 Migration Plan:*

```typescript
// Scene 초기화 코드 (RoundManager 또는 GameScene.onLoad()):
import { TouchInputAdapter } from '../core/input/TouchInputAdapter';
import type { IMovementHandler } from '../core/input/IMovementHandler';

// DI: PlayerMovement가 IMovementHandler를 구현하므로 직접 주입
const adapter = new TouchInputAdapter(
  playerMovement as IMovementHandler,  // PlayerMovement implements IMovementHandler
  this.eventBus,
  this.clock,
  localPlayerId,
);
adapter.attachToNode(gridNode);

// Rollback plan: adapter.detachFromNode(gridNode) 호출로 이벤트 해제 후 mock 입력 대체 가능
```

- 실기기 테스트가 불가한 경우: Cocos Creator Preview 모드 + 브라우저 DevTools 터치 시뮬레이터로 대체 가능.
- Visual/Feel 스토리이므로 자동화 단위 테스트 불필요 — 실기기 증거 문서로 대체.

---

## Out of Scope

- **Story 001**: `IMovementHandler` 인터페이스, `TouchInputAdapter` 로직
- **Story 002**: Direction8 매핑, MOVE_REPEAT 타이밍, `onMoveIntent` 구현

---

## QA Test Cases

**Manual check — AC-TI-15**: 8방향 이동 반응성
- Setup: 빌드 실행 후 grid 화면에서 조이스틱 드래그
- Verify: 8방향 (N/NE/E/SE/S/SW/W/NW) 각각 올바른 방향으로 플레이어 이동
- Pass condition: 드래그 방향과 플레이어 이동 방향이 일치; 오입력(반대 방향 이동) 없음

**Manual check — AC-TI-16**: JOY_THRESHOLD 검증
- Setup: 그리드 화면에서 짧은 탭 (화면에서 빠르게 떼기)
- Verify: 플레이어 이동 없음; 탭 효과(TAP_DETECTED 처리)만 발생
- Pass condition: 탭으로 플레이어가 움직이지 않음

**Manual check — AC-TI-17**: 멀티터치 검증
- Setup: 두 손가락으로 동시에 다른 방향 드래그
- Verify: 플레이어가 하나의 방향으로만 이동 (첫 번째 손가락 방향)
- Pass condition: 두 번째 손가락 입력 무시; 이상 동작(진동, 방향 전환) 없음

---

## Test Evidence

**Story Type**: Visual/Feel
**Required evidence**: `production/qa/evidence/touch-adapter-device-test.md` + 개발자 sign-off

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 AND Story 002 must be DONE
- Unlocks: Sprint 3 TouchInput DoD 충족 — Vertical Slice 플레이 가능 상태
