# ADR-0015: FairFeedback DeathReplay 렌더링 — Graphics 오버레이 · 레이어 순서 · 입력 캡처

## Status
Accepted

## Date
2026-04-22

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Presentation / Rendering + Input |
| **Knowledge Risk** | MEDIUM — Graphics API 및 touch 캡처 페이즈는 3.8.x 기반 내 검증 필요 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | `cc.Graphics` fillRect/stroke, `cc.Node.on('touchstart', handler, true)` 캡처 페이즈 — 3.8.x 동작 확인 필요 |
| **Verification Required** | AC-DR-01~05 구현 후 실기기 및 단위 테스트 통과. 특히 touch 캡처 페이즈 동작 확인 필수 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — PLAYER_KILLED 구독), ADR-0002 (FrameClock — 700ms 자동 해제 타이머), ADR-0003 (Presentation 레이어 경계), ADR-0005 (CellCoord — killerGateCells 좌표를 픽셀로 변환), ADR-0010 (Server Authority — localPlayerId로 로컬 필터링) |
| **Enables** | ADR-0016 (HUD Safe Area — 레이어 z-order 계약) |
| **Blocks** | FairFeedback 시스템 Presentation 구현 |
| **Ordering Note** | ADR-0011(RoundManager FSM) 확정 후 작성. ROUND_END 이벤트 계약(EC-3)이 ADR-0011에서 확정됨 |

## Context

FairFeedback 시스템(GDD: `design/gdd/fair-feedback.md`)은 `PLAYER_KILLED` 이벤트 수신 시 `killerGateCells`를 Death Rose `#FF3366`으로 하이라이트하는 읽기 전용 오버레이다. GDD가 요구하는 렌더링 계약:

- **코드-드리븐**: 스프라이트 없음. Graphics API로 즉시 그림 (아트 바이블 원칙).
- **레이어 순서**: HUD(최상위) > FairFeedback 오버레이 > GridExplosion 렌더링 > 배경
- **입력 캡처**: 오버레이 활성 중 tap-to-skip이 이동 시스템보다 먼저 소비해야 함 (FF-5, FF-6)
- **타이머**: 700ms ± 50ms 자동 해제 (FrameClock 결정론적 처리)
- **로컬 필터**: 원격 플레이어 PLAYER_KILLED 이벤트는 오버레이를 트리거하지 않음 (FF-7)

**핵심 설계 질문**:
1. Graphics 오버레이를 어느 노드 계층에 배치하는가?
2. 700ms 타이머를 FrameClock.schedule로 구현하는가, cc.tween으로 구현하는가?
3. tap-to-skip 입력 우선순위를 어떻게 보장하는가?

## Decision

### 1. 렌더링: 전용 FairFeedbackLayer 노드 + cc.Graphics

FairFeedback 전용 노드(`FairFeedbackLayer`)를 씬 계층에 배치한다. 이 노드는 `cc.Graphics` 컴포넌트를 가지며, `killerGateCells` 좌표를 픽셀로 변환하여 fillRect + strokeRect로 그린다.

```
Scene
├── BackgroundLayer          (z: 0)
├── GridLayer                (z: 10)  ← GridExplosion 렌더링
├── FairFeedbackLayer        (z: 20)  ← 이 ADR
└── HUDLayer                 (z: 30)  ← 최상위 (ADR-0016)
```

z-order는 `Node.setSiblingIndex()` 또는 씬 파일의 노드 순서로 고정. `FairFeedbackLayer`는 IDLE 상태에서 `graphics.clear()`로 투명하게 유지된다.

### 2. 좌표 변환: CellCoord → 픽셀

```typescript
function cellToPixel(cell: CellCoord, gridOrigin: Vec2, cellSize: number): Vec2 {
  return new Vec2(
    gridOrigin.x + cell.col * cellSize,
    gridOrigin.y - cell.row * cellSize,  // Cocos y축 반전
  );
}
```

`gridOrigin`(그리드 좌상단 픽셀)과 `cellSize`는 GridLayer에서 주입받는다. 절대 픽셀 하드코딩 금지(GDD UI 요구사항).

### 3. 타이머: FrameClock.schedule (ADR-0002)

cc.tween이나 setTimeout 대신 `FrameClock.schedule`을 사용한다. 결정론적 시뮬레이션(ADR-0002) 보장 및 단위 테스트 가능.

```typescript
private dismissHandle: ScheduleHandle | null = null;

private startOverlay(cells: CellCoord[]): void {
  this.cancelDismissTimer();
  this.killerCells = cells;
  this.drawOverlay();
  this.dismissHandle = this.frameClock.schedule(
    FEEDBACK_DURATION,   // 1.5s → seconds 단위: 0.7
    () => this.dismissOverlay('DURATION'),
  );
}

private cancelDismissTimer(): void {
  if (this.dismissHandle) {
    this.frameClock.unschedule(this.dismissHandle);
    this.dismissHandle = null;
  }
}
```

`FEEDBACK_DURATION = 0.7` (seconds — ADR-0002 FrameClock은 초 단위)

### 4. 입력 캡처: Node touch 캡처 페이즈

`FairFeedbackLayer` 노드의 touchstart 핸들러를 **캡처 페이즈**(bubbling phase 아님)에 등록한다. Cocos Creator에서 캡처 페이즈는 이벤트가 리프 노드에 도달하기 전에 먼저 처리된다.

```typescript
// FairFeedbackLayer.ts
onLoad(): void {
  // true = 캡처 페이즈 등록 (이동 시스템 핸들러보다 먼저 실행)
  this.node.on(cc.Node.EventType.TOUCH_START, this.onTouchStart, this, true);
}

private onTouchStart(event: cc.EventTouch): void {
  if (this.state !== 'HIGHLIGHT_ACTIVE') return;
  event.propagationStopped = true;  // 이동 시스템으로 전파 차단
  this.dismissOverlay('TAP');
}
```

**검증 필요**: Cocos Creator 3.8.6에서 `Node.on(eventType, handler, target, true)` 네 번째 인자가 캡처 페이즈를 의미하는지 확인. 동작이 다르다면 `EventTouch.stopPropagation()` 단독 사용으로 대체.

### 5. 로컬 플레이어 필터

```typescript
onPlayerKilled(event: PlayerKilledEvent): void {
  // FF-7: 원격 플레이어 이벤트 무시
  if (!event.playerIds.includes(this.localPlayerId)) return;
  if (!event.killerGateCells || event.killerGateCells.length === 0) {
    this.eventBus.emit('FEEDBACK_MISSING_CAUSE', { playerId: this.localPlayerId, timestamp: event.timestamp });
    return;  // EC-1: 빈 killerGateCells — 오버레이 없음
  }
  this.startOverlay(event.killerGateCells);
}
```

### 6. 펄스 애니메이션: update() 루프

F-3 수식을 `update(dt)` 내에서 계산한다. cc.tween 사용 안 함 — FrameClock 결정론과 충돌.

```typescript
private overlayTime = 0;

update(dt: number): void {
  if (this.state !== 'HIGHLIGHT_ACTIVE') return;
  this.overlayTime += dt;
  // F-3: opacity(t) = 0.60 * (0.5 + 0.5 * sin(2π * 1.0Hz * t))
  const opacity = 0.60 * (0.5 + 0.5 * Math.sin(2 * Math.PI * this.overlayTime));
  this.redrawOverlay(opacity);
}

private redrawOverlay(opacity: number): void {
  const g = this.graphics;
  g.clear();
  for (const cell of this.killerCells) {
    const px = cellToPixel(cell, this.gridOrigin, this.cellSize);
    g.fillColor = new cc.Color(255, 51, 102, Math.round(opacity * 255));  // #FF3366
    g.fillRect(px.x, px.y, this.cellSize, this.cellSize);
    g.strokeColor = new cc.Color(255, 51, 102, 255);
    g.lineWidth = 3;
    g.strokeRect(px.x, px.y, this.cellSize, this.cellSize);
  }
}
```

### 7. ROUND_END 강제 해제 (EC-3)

```typescript
onRoundEnd(): void {
  if (this.state !== 'HIGHLIGHT_ACTIVE') return;
  this.dismissOverlay('ROUND_END');
}
```

`ROUND_END` 이벤트는 ADR-0011(RoundManager FSM) 계약에 따라 발행됨.

## Consequences

### 긍정적 결과
- **스프라이트 없음**: 아트 파이프라인 없이 코드만으로 구현. 디자인 변경이 상수 수정으로 처리됨.
- **결정론적 타이머**: FrameClock.schedule로 단위 테스트에서 시간 제어 가능.
- **격리된 오버레이**: FairFeedbackLayer가 GridLayer 상태를 읽지 않는다. 읽기 전용 계약 유지.

### 부정적 결과
- **캡처 페이즈 검증 필요**: Cocos Creator 3.8.6 touch 캡처 페이즈 API가 예상과 다를 수 있음. 구현 초기 실기기 테스트 필수.
- **update() 부하**: 매 프레임 `redrawOverlay()`를 호출한다. `killerGateCells`가 최대 N개의 셀일 때 draw call 최적화 필요(단일 Graphics 컴포넌트로 배치 처리 — 이 ADR의 접근이 이미 배치임).

## Alternatives Considered

### A. cc.tween으로 펄스 + 타이머 구현

cc.tween을 사용해 opacity 애니메이션과 700ms 자동 해제를 처리하는 방안.

**기각 이유**: cc.tween은 실제 시간(wall clock)에 의존하며 FrameClock.simulatedTime과 독립적이다. 단위 테스트에서 시간을 제어할 수 없고, 결정론적 재현도 불가능하다(ADR-0002 위반).

### B. Exploded 셀 위에 별도 스프라이트 노드 배치

`killerGateCells`마다 노드를 인스턴스화하여 스프라이트로 렌더링하는 방안.

**기각 이유**: 아트 바이블 "렌더링: Graphics 코드-드리븐, 스프라이트 없음" 원칙 위반. 또한 풀 관리 복잡도 추가 — 최대 N개 셀에 대한 노드 풀 필요.

### C. GridLayer에 오버레이 렌더링 위임

GridExplosion 렌더러가 `killerGateCells` 배열을 받아 직접 오버레이를 그리는 방안.

**기각 이유**: FairFeedback은 GridExplosion의 다운스트림이다. GridLayer가 FairFeedback 상태를 소유하면 레이어 경계 위반(ADR-0003). FairFeedbackLayer가 독립 오버레이로 존재하는 것이 단방향 의존 원칙에 부합.

## Implementation Guidelines

**규칙**:
- `FairFeedbackLayer`는 `cc.Graphics` 컴포넌트 단 하나를 가진다 — 복수 Graphics 컴포넌트 금지
- `redrawOverlay()`는 항상 `g.clear()` 먼저 호출 후 재그림 — 잔상 방지
- `killerGateCells`가 빈 배열이면 오버레이 없이 `FEEDBACK_MISSING_CAUSE` 발행 (EC-1)
- 절대 픽셀 좌표 하드코딩 금지 — `gridOrigin`과 `cellSize`를 항상 GridLayer에서 주입
- `FEEDBACK_DURATION` 상수 하드코딩 금지 — `src/config/FairFeedbackConfig.ts`에서 읽음
- 캡처 페이즈 동작 검증 전에는 `event.propagationStopped = true` fallback 유지
- `ROUND_END` 구독 — 라운드 전환 시 활성 오버레이 즉시 해제

## GDD Requirements Addressed

| TR-ID | GDD | 요구사항 | 처리 방식 |
|-------|-----|---------|---------|
| TR-fairfeedback-001 | fair-feedback.md | FF-1: PLAYER_KILLED 트리거 | EventBus 구독 + localPlayerId 필터 |
| TR-fairfeedback-002 | fair-feedback.md | FF-2/FF-3: killerGateCells 하이라이트 | Graphics fillRect + strokeRect |
| TR-fairfeedback-003 | fair-feedback.md | FF-4: 700ms 자동 해제 | FrameClock.schedule |
| TR-fairfeedback-004 | fair-feedback.md | FF-5/FF-6: tap-to-skip + 조이스틱 차단 | touch 캡처 페이즈 |
| TR-fairfeedback-005 | fair-feedback.md | FF-7: 로컬 플레이어 전용 | playerIds.includes(localPlayerId) |
| TR-fairfeedback-006 | fair-feedback.md | FF-9: 빠른 연속 사망 교체 | cancelDismissTimer + startOverlay |

## Validation Criteria

- **AC-DR-01**: `PLAYER_KILLED` 수신 후 1프레임 이내 Graphics draw 호출이 발생한다 (단위 테스트)
- **AC-DR-02**: 700ms ± 50ms 후 `g.clear()`가 호출되고 상태가 IDLE로 전환된다 (FrameClock mock 테스트)
- **AC-DR-03**: 오버레이 활성 중 touchstart 이벤트가 이동 시스템에 전달되지 않는다 (이벤트 스파이)
- **AC-DR-04**: 원격 플레이어 PLAYER_KILLED 이벤트가 Graphics draw를 트리거하지 않는다 (localPlayerId 필터 테스트)
- **AC-DR-05**: touch 캡처 페이즈 동작 실기기 확인 — `propagationStopped` 후 이동 시스템 핸들러 미실행
