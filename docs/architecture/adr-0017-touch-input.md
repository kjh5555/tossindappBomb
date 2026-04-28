# ADR-0017: TouchInput — 터치 이벤트 → PlayerMovement 파이프라인

## Status
Accepted

## Date
2026-04-22

## Last Verified
2026-04-22

## Decision Makers
솔로 개발자

## Summary

모바일 터치 이벤트를 게임 도메인 입력으로 변환하는 파이프라인을 결정한다. `TouchInputAdapter` (Foundation)가 Cocos Creator 터치 이벤트를 수신해 JOY_THRESHOLD 필터링 + Direction8 매핑을 수행하고, 주입받은 `IMovementHandler` 인터페이스를 통해 `PlayerMovement.tryMove()`를 직접 호출한다. 레이어 경계 위반 없이 입력 지연 0-frame을 달성한다.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Input / Core |
| **Knowledge Risk** | MEDIUM — 3.8.x 터치 API는 훈련 데이터 내. `Input.EventType.TOUCH_*` 와 `Node.on()` 패턴은 3.8.x 범위. 3.8.6 패치 레벨 변화 없음으로 가정. |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md`, `src/core/player/Direction8.ts` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `node.on(Input.EventType.TOUCH_START/MOVE/END)` 이 Cocos Creator 3.8.6에서 정상 동작하는지 첫 터치 테스트 필수. 멀티터치 시 `event.getTouches()[0]` 이 첫 터치만 반환하는지 확인. |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — TAP_DETECTED 이벤트 정의), ADR-0005 (CellCoord 타입), ADR-0008 (PlayerMovement — tryMove() 시그니처, JOY_THRESHOLD, MOVE_REPEAT) |
| **Enables** | TouchInput epic 구현 언블록, 모바일 플레이 가능 |
| **Blocks** | TouchInput epic stories (이 ADR Accepted 이전 구현 불가) |
| **Ordering Note** | ADR-0008(PlayerMovement) Accepted 이후 작성. PlayerMovement의 tryMove() 시그니처에 의존하므로 순서 의존 있음. |

## Context

### Problem Statement

터치 입력이 없으면 모바일(토스 인토스 webview)에서 플레이어 이동이 불가능하다. 터치 이벤트를 Direction8 + JOY_THRESHOLD 로직을 거쳐 PlayerMovement로 전달하는 파이프라인 설계 결정이 필요하다. 설계 없이 구현하면 레이어 경계 위반(Foundation이 Core에 직접 의존), 입력 지연, 멀티터치 처리 불일치가 발생할 수 있다.

### Current State

- `PlayerMovement.tryMove()` 구현 완료 (ADR-0008)
- `Direction8` + `JOY_THRESHOLD=18px`, `MOVE_REPEAT=0.22s` 상수 정의됨
- 터치 이벤트 수신 코드 없음 — TouchInput 컴포넌트 미구현

### Constraints

- **레이어 경계**: TouchInputAdapter는 Foundation 레이어 — Core 타입에 직접 의존 금지
- **입력 지연**: 터치 → 이동 파이프라인은 0-frame (동일 프레임 내 이동 반영)
- **멀티터치**: 토스 인토스 환경은 단일 플레이어 — 첫 번째 터치 포인트만 처리
- **플랫폼**: 터치 전용. 마우스/키보드 입력 고려 불필요
- **EventBus flush 지연**: EventBus 경유 시 1-frame 지연 발생 — 이동 입력에는 허용 불가

### Requirements

- JOY_THRESHOLD(18px) 미만 변위 → 입력 무시
- MOVE_REPEAT(0.22s) 주기로 방향 유지 시 연속 이동
- Direction8 8방향 매핑: 현재 터치 위치 - 시작 터치 위치 = displacement → angleFromDirection8()
- 멀티터치: 첫 번째 터치 ID만 추적, 나머지 무시
- 탭(드래그 없이 터치+릴리즈): TAP_DETECTED `{ pos: { x, y }, timestamp }` 이벤트 발행
- Foundation 레이어에서 Core(PlayerMovement) 직접 의존 없음

## Decision

**`TouchInputAdapter`** (Foundation) 는 Cocos Creator 노드 터치 이벤트를 수신해 조이스틱 변위를 계산하고, 주입받은 **`IMovementHandler`** 인터페이스를 통해 `tryMove()`를 직접 호출한다. 이 인터페이스는 Foundation에 정의되며 PlayerMovement가 구현한다.

탭 이벤트(드래그 없는 터치)는 `EventBus.emit('TAP_DETECTED', ...)` 를 통해 UI 레이어에 전달한다.

### Architecture

```
[Cocos Creator Node]
  node.on(TOUCH_START/MOVE/END)
         │
         ▼
[TouchInputAdapter]  ← Foundation 레이어
  - 첫 번째 touchId만 추적
  - 변위 = currentPos - startPos
  - if magnitude < JOY_THRESHOLD → 입력 무시
  - else → direction = angleToDirection8(atan2(dy, dx))
  - MOVE_REPEAT 타이머로 연속 이동 큐잉
  - 탭(드래그 없음) → bus.emit(TAP_DETECTED)
         │
         │ IMovementHandler.onMoveIntent(playerId, direction, magnitude)
         ▼
[PlayerMovement]     ← Core 레이어 (IMovementHandler 구현)
  tryMove(playerId, direction, magnitude)
```

### Key Interfaces

```typescript
// src/core/input/IMovementHandler.ts  (Foundation 레이어 정의)
export interface IMovementHandler {
  /**
   * 방향 이동 의도 수신. JOY_THRESHOLD 이상 변위가 보장된 상태로 호출됨.
   * @param playerId  - 이동할 플레이어 ID
   * @param direction - Direction8 정수 (0-7)
   * @param magnitude - 조이스틱 변위(px) — JOY_THRESHOLD 이상 보장
   */
  onMoveIntent(playerId: PlayerId, direction: Direction8, magnitude: number): void;
}

// src/core/input/TouchInputAdapter.ts  (Foundation 레이어)
export class TouchInputAdapter {
  constructor(
    private readonly handler:  IMovementHandler,
    private readonly bus:      IEventBus,
    private readonly clock:    IFrameClock,
    private readonly playerId: PlayerId,
  ) {}

  /** 호출처: RoundManager 또는 Scene 초기화 시 Cocos Creator 노드에 등록 */
  attachToNode(node: Node): void {
    node.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    node.on(Input.EventType.TOUCH_MOVE,  this.onTouchMove,  this);
    node.on(Input.EventType.TOUCH_END,   this.onTouchEnd,   this);
    node.on(Input.EventType.TOUCH_CANCEL,this.onTouchEnd,   this);
  }
}
```

### Implementation Guidelines

1. **첫 번째 터치 ID 전용**: `TOUCH_START` 시 `activeTouchId = event.getID()` 저장. 이후 `TOUCH_MOVE/END` 에서 `event.getID() !== activeTouchId` 이면 무시.

2. **변위 계산**: `TOUCH_MOVE` 마다 `dx = current.x - start.x`, `dy = current.y - start.y`, `magnitude = Math.hypot(dx, dy)`.

3. **dead zone**: `magnitude < JOY_THRESHOLD (18px)` → 반환, 이동 없음.

4. **방향 매핑**: `const angleDeg = (Math.atan2(-dy, dx) * 180) / Math.PI;` → `angleToDirection8(angleDeg)` (Cocos Y축 반전 처리 포함: `-dy`).

5. **연속 이동 (MOVE_REPEAT)**: `TOUCH_START` 또는 방향 변경 시 즉시 `handler.onMoveIntent()` 호출. `TOUCH_MOVE` 에서 이전 호출 이후 `clock.now() - lastMoveAt >= MOVE_REPEAT (0.22s)` 이면 재호출.

6. **탭 감지**: `TOUCH_END` 시 `totalDisplacement < JOY_THRESHOLD` 이면 탭으로 판단 → `bus.emit('TAP_DETECTED', { pos: endPos, timestamp: clock.now() })`.

7. **`IMovementHandler` 구현**: `PlayerMovement`에 `onMoveIntent(playerId, direction, magnitude)` 메서드 추가 → 내부적으로 `tryMove(playerId, direction, magnitude)` 호출.

8. **레이어 정합**: `TouchInputAdapter` 는 `IMovementHandler` 인터페이스에만 의존 (Foundation 레이어). `PlayerMovement` 는 `IMovementHandler`를 구현하지만 `TouchInputAdapter`를 알지 못한다.

## Alternatives Considered

### Alternative 1: EventBus 경유 (MOVE_INTENT 이벤트)

- **Description**: `TouchInputAdapter` → `bus.emit('MOVE_INTENT', { direction, magnitude })` → `PlayerMovement.on('MOVE_INTENT', ...)`
- **Pros**: 레이어 완전 분리, 이벤트 기록 가능
- **Cons**: EventBus flush 큐로 인해 **1-frame 지연** 발생 (60fps 기준 16.6ms). 이동 반응성 체감 저하. 토스 인토스 webview 환경에서 특히 민감.
- **Rejection Reason**: 입력 지연 허용 불가 (PM-GDD Constraint: "이동 반응성 최우선").

### Alternative 2: PlayerMovement 직접 참조 (Foundation → Core 직접 의존)

- **Description**: `TouchInputAdapter` 가 `PlayerMovement` 구체 타입을 직접 임포트해 `tryMove()` 호출
- **Pros**: 코드 단순
- **Cons**: Foundation이 Core를 직접 의존 → ADR-0003 레이어 경계 위반. 테스트 시 PlayerMovement 전체 인스턴스 필요.
- **Rejection Reason**: 레이어 경계 위반 + 테스트 격리 불가.

### Alternative 3: 완전 분리 (터치 → 별도 InputManager → PlayerMovement)

- **Description**: 중간 InputManager 시스템이 터치 정규화 + PlayerMovement 라우팅 담당
- **Pros**: 향후 키보드/게임패드 확장 용이
- **Cons**: 오버엔지니어링. 토스 인토스는 터치 전용 플랫폼 — 다중 입력 지원 불필요.
- **Rejection Reason**: 불필요한 복잡도 추가 (YAGNI).

## Consequences

### Positive

- 입력 지연 0-frame: 터치 이벤트 → `tryMove()` 동기 호출
- 레이어 경계 준수: 인터페이스 역전(IMovementHandler)으로 Foundation↔Core 분리
- 단위 테스트 용이: MockMovementHandler로 TouchInputAdapter 격리 테스트 가능

### Negative

- `PlayerMovement`에 `IMovementHandler` 구현 추가 필요 (story-002 scope)
- Cocos Creator 노드 이벤트 등록 패턴은 엔진 의존 — 헤드리스 단위 테스트 불가 (통합 테스트 또는 플레이테스트로 검증)

### Neutral

- `IMovementHandler` 인터페이스 파일 추가: `src/core/input/IMovementHandler.ts`

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Cocos Creator 3.8.6 터치 API 변경 | LOW | MEDIUM | 첫 구현 시 실기기 검증 필수 |
| MOVE_REPEAT 타이밍 부정확 | LOW | LOW | FrameClock.now() 기반 — simulatedTime과 동기화됨 |
| 멀티터치 오작동 | LOW | LOW | `activeTouchId` 가드로 첫 터치만 처리 |

## Performance Implications

| Metric | Before | Expected After | Budget |
|--------|--------|---------------|--------|
| CPU (frame time) | — | <0.1ms | 16.6ms |
| Memory | — | ~200 bytes (touch state) | — |
| Input latency | — | 0 frames | 0 frames |

## Migration Plan

신규 구현 — 기존 시스템 마이그레이션 불필요.

1. `src/core/input/IMovementHandler.ts` 생성
2. `src/core/input/TouchInputAdapter.ts` 생성 (Foundation 레이어)
3. `PlayerMovement.onMoveIntent()` 메서드 추가 (story-002)
4. Scene 초기화 코드에서 `adapter.attachToNode(gridNode)` 연결

**Rollback plan**: `TouchInputAdapter.detachFromNode(node)` 호출로 이벤트 해제 후 mock 입력으로 대체 가능.

## Validation Criteria

- [ ] JOY_THRESHOLD(18px) 미만 입력 → `onMoveIntent` 미호출 (단위 테스트)
- [ ] 8방향 각도 경계값에서 올바른 Direction8 반환 (단위 테스트)
- [ ] MOVE_REPEAT(0.22s) 간격 연속 이동 — FrameClock 기반 타이밍 (단위 테스트)
- [ ] 멀티터치 시 두 번째 터치 무시 (단위 테스트)
- [ ] 탭 → TAP_DETECTED 발행, `onMoveIntent` 미호출 (단위 테스트)
- [ ] 실기기 플레이테스트: 8방향 이동 자연스럽게 반응 (플레이테스트)

## GDD Requirements Addressed

| GDD Document | System | Requirement | How This ADR Satisfies It |
|-------------|--------|-------------|--------------------------|
| `design/gdd/player-movement.md` | PlayerMovement | JOY_THRESHOLD=18px dead zone | TouchInputAdapter의 magnitude < JOY_THRESHOLD 가드 |
| `design/gdd/player-movement.md` | PlayerMovement | MOVE_REPEAT=0.22s 연속 이동 | clock.now() 기반 MOVE_REPEAT 타이머 구현 |
| `design/gdd/player-movement.md` | PlayerMovement | 8방향 조이스틱 입력 | angleToDirection8(atan2(-dy, dx) * 180/π) 매핑 |
| `src/core/events/GameEvents.ts` | Input | TAP_DETECTED `{ pos, timestamp }` | 드래그 없는 탭 → TAP_DETECTED emit |

## Related

- ADR-0008: Player Movement — `tryMove()` 시그니처 및 JOY_THRESHOLD, MOVE_REPEAT 상수 정의
- ADR-0001: EventBus — `TAP_DETECTED` 이벤트 발행 패턴
- ADR-0003: Layer Boundaries — Foundation→Core 의존 금지 규칙 (IMovementHandler 역전으로 준수)
- `src/core/player/PlayerMovement.ts` — 구현 대상
- `src/core/input/TouchInputAdapter.ts` — 구현 예정
