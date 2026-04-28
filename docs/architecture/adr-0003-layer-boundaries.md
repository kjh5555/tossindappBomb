# ADR-0003: 모듈 레이어 경계 및 단방향 의존 강제

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Architecture |
| **Knowledge Risk** | LOW — 엔진 API 비의존, 순수 TypeScript 모듈 구조 결정 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | 레이어 위반 import 없음을 PR 리뷰 체크리스트 + 선택적 eslint-plugin-import로 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — 레이어 간 표준 통신 수단), ADR-0002 (FrameClock — Foundation 계층 확정) |
| **Enables** | ADR-0004 ~ ADR-0016 (모든 시스템 ADR이 레이어 귀속과 경계 규칙을 이 ADR 기준으로 판단) |
| **Blocks** | 모든 Core / Feature / Presentation 모듈 구현 (레이어 귀속이 확정되어야 import 방향 설계 가능) |
| **Ordering Note** | Foundation ADR(0001, 0002) 확정 직후 코딩 시작 전 반드시 수립 |

## Context

### Problem Statement

명시적 레이어 경계 규칙이 없으면 개발자가 편의상 역방향 참조(Presentation → Core 직접 호출, Feature → Foundation 직접 상태 접근)를 추가하게 된다. 이는 다음을 유발한다:
- **테스트 불가**: 하위 레이어가 상위 레이어를 알면 고립 단위 테스트 불가
- **순환 의존**: 역방향 참조가 쌓이면 모듈 간 순환 import 발생
- **변경 파급**: Feature 변경이 Foundation까지 전파되는 불필요한 수정 연쇄

### Constraints

- TypeScript `import` 는 런타임 제약 없음 — 규칙은 lint + 디렉터리 구조 + 코드 리뷰로 강제
- 예외 2건은 성능/동기성 요구로 불가피 (Phase 2에서 결정됨)
- `src/` 하위 디렉터리 구조가 레이어와 정확히 일치해야 함

### Requirements

- 5-tier 레이어 체계에서 의존 방향은 항상 아래 방향만 허용
- 상위 레이어 → 하위 레이어 참조만 허용. 반대 방향 금지
- 레이어 간 통신은 IEventBus 이벤트 또는 `I*` 인터페이스 메서드 호출만
- 예외는 이 ADR에 명시된 2건만 — 추가 예외 시 이 ADR 개정 필요

## Decision

**5-tier 단방향 레이어 의존 + 명시적 예외 2건** 체계를 채택한다.

### 레이어 정의 및 디렉터리 매핑

| 레이어 | 디렉터리 | 설명 |
|--------|---------|------|
| Platform | `src/platform/` | OS / 엔진 API 직접 접촉. TossBridge만 포함 |
| Foundation | `src/core/events/`, `src/core/time/`, `src/core/input/`, `src/core/net/` | 이벤트 버스, 시간, 입력, 네트워크 |
| Core | `src/core/grid/`, `src/core/player/`, `src/core/patterns/`, `src/core/persistence/`, `src/core/net/auth/` | 게임 시뮬레이션 핵심 |
| Feature | `src/features/` | 라운드, 세션, 로비, 서바이벌 |
| Presentation | `src/presentation/` | HUD, DeathReplay, AudioManager |

### 의존 방향 규칙

```
Presentation
    │  이벤트 구독(EventBus.on) + IFeature 인터페이스 읽기만
    ▼
Feature
    │  ICore 인터페이스 호출 + 이벤트 구독/발행
    ▼
Core
    │  IFoundation 인터페이스 호출 + 이벤트 발행
    ▼
Foundation
    │  Platform API 호출만
    ▼
Platform
```

**허용:**
- 상위 → 하위 레이어 `I*` 인터페이스 메서드 호출
- 상위 → 하위 레이어 이벤트 구독 (`EventBus.on`)
- 하위 → 상위 이벤트 발행 (`EventBus.emit`) — 이벤트 버스가 방향을 역전시킴

**금지:**
- 하위 레이어가 상위 레이어 모듈을 직접 `import`
- 상위 레이어 구체 클래스를 하위 레이어 생성자에 주입
- 레이어를 건너뛰는 직접 참조 (예: Presentation → Core 직접 호출)

### 명시적 예외 (2건)

**예외 1: RoundEscalation → GridSimulation.setGatePeriod**
- **위반 방향**: Feature → Core 직접 호출은 허용 범위이나, EventBus 우회가 예외
- **허용 이유**: ROUND_STARTED 이벤트가 flush되는 동일 프레임에 gatePeriod가 적용되어야 함 (AC-RE-09). EventBus flush 이후 적용하면 1프레임 지연 → 첫 폭발 타이밍 불일치
- **제약**: `setGatePeriod(seconds)` 호출 시 invariant `seconds ∈ [1.4, 2.0]` 반드시 준수. `RoundManager.startRound()` 내부에서만 호출
- **대안이 없는 이유**: 동일 프레임 원자성이 EventBus 큐 패턴과 구조적으로 양립 불가

**예외 2: DeathReplay → GridSimulation.getCellState (read-only)**
- **위반 방향**: Presentation → Core 직접 읽기 (정상 레이어 방향 위반)
- **허용 이유**: PLAYER_KILLED 시점의 셀 상태 스냅샷을 DeathReplay가 즉각 캡처해야 함. 이벤트 버스를 경유하면 다음 flush에서 getCellState 결과가 달라져 있을 수 있음 (셀이 Idle로 복귀 후)
- **제약**: `getCellState()` 호출만 허용. `applyPattern()` 등 쓰기 메서드 호출 절대 금지
- **대안이 없는 이유**: 스냅샷 캡처 타이밍이 flush 경계와 충돌

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ PRESENTATION                                        │
│  DeathReplay ──────────────────────────────────────►  GridSimulation.getCellState()
│                                          [예외2: read-only snapshot]
│  RoundHUD ──── EventBus.on(GOAL_PLACED) ──────────► │
└────────────────────────┬────────────────────────────┘
  이벤트 구독 (↓방향)     │  금지: Presentation → Feature 쓰기
┌────────────────────────▼────────────────────────────┐
│ FEATURE                                             │
│  RoundEscalation ──────────────────────────────────►  GridSimulation.setGatePeriod()
│                                          [예외1: 동일프레임 원자성]
│  RoundManager ── EventBus.on / ICore.call ────────► │
└────────────────────────┬────────────────────────────┘
┌────────────────────────▼────────────────────────────┐
│ CORE                                                │
│  EventBus.emit(CELL_EXPLODED) ─────────────────────► (Foundation 방향으로 큐잉)
└────────────────────────┬────────────────────────────┘
┌────────────────────────▼────────────────────────────┐
│ FOUNDATION  EventBus / FrameClock / TouchInput / WS │
└────────────────────────┬────────────────────────────┘
┌────────────────────────▼────────────────────────────┐
│ PLATFORM  TossBridge                                │
└─────────────────────────────────────────────────────┘
```

### Key Interfaces

예외 호출의 공식 서명 (이 ADR이 허용 경계를 확정):

```typescript
// 예외 1 — RoundEscalation (Feature) → GridSimulation (Core)
// 호출 허용 위치: RoundManager.startRound() 내부만
// Precondition: seconds ∈ [1.4, 2.0]
GridSimulation.setGatePeriod(seconds: number): void

// 예외 2 — DeathReplay (Presentation) → GridSimulation (Core)
// 호출 허용 위치: PLAYER_KILLED 핸들러 내부만
// 제약: read-only. 쓰기 메서드 호출 금지
GridSimulation.getCellState(c: CellCoord): CellState
```

## Alternatives Considered

### Alternative A: 예외 없는 엄격한 단방향 (모든 통신 EventBus 경유)
- **Description**: setGatePeriod도 EventBus 이벤트로 → GridSimulation이 ESCALATION_COMPUTED를 구독하여 스스로 적용
- **Pros**: 예외 없음, 완전한 단방향
- **Cons**: ESCALATION_COMPUTED flush 후 다음 프레임에서야 gatePeriod 갱신 → ROUND_STARTED 발행 시점의 폭발 타임스탬프 계산에 이전 gatePeriod 사용 (1프레임 타이밍 버그)
- **Rejection Reason**: AC-RE-09 "ROUND_STARTED와 동일 프레임에 gatePeriod 적용" 위반

### Alternative B: 레이어 경계 미강제 (자유 참조)
- **Description**: 모듈이 필요에 따라 자유롭게 import — 리뷰로만 통제
- **Pros**: 구현 속도 빠름
- **Cons**: 순환 의존 축적, 테스트 어려움, 기술 부채 급증
- **Rejection Reason**: 18개 모듈 체계에서 리뷰만으로는 장기 유지 불가

## Consequences

### Positive
- 각 레이어가 하위 레이어 인터페이스만 알면 됨 → 상위 레이어 교체/확장 자유
- Foundation/Core 단위 테스트가 Presentation/Feature 코드 없이 실행 가능
- 새 시스템 추가 시 레이어 귀속이 명확 — 의존성 방향이 자명

### Negative
- 개발자가 예외 2건 규칙을 별도로 인지 필요
- 예외 추가 시 이 ADR 개정 필요 — 경량 거버넌스 오버헤드

### Risks
- **TypeScript import 무강제**: `tsc`는 레이어 경계를 검증하지 않음. **Mitigation**: PR 리뷰 체크리스트에 레이어 위반 항목 포함. 선택적으로 eslint-plugin-import 경로 규칙 적용
- **예외 크리프**: "이번 한 번만" 예외가 축적될 위험. **Mitigation**: 이 ADR을 개정하지 않고 예외를 추가한 PR은 명시적 거부 대상으로 팀에 공유

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| round-escalation.md | AC-RE-09: ROUND_STARTED와 동일 프레임 gatePeriod 적용 | 예외 1로 RoundEscalation → setGatePeriod 직접 호출 허용 |
| fair-feedback.md | PLAYER_KILLED 시점 셀 상태 스냅샷 보존 | 예외 2로 DeathReplay → getCellState 직접 읽기 허용 |
| systems-index.md | 레이어 우선순위 체계 (Foundation → Core → Feature → Presentation) | 레이어 디렉터리 + 단방향 규칙으로 구조화 |

## Performance Implications
- **CPU**: 없음 — 순수 구조 규칙, 런타임 오버헤드 없음
- **Memory**: 없음
- **Load Time**: 없음
- **Network**: 없음

## Migration Plan
신규 프로젝트 — 기존 코드 없음. `src/` 디렉터리를 레이어 구조에 맞춰 초기 생성할 때 이 ADR을 참조.

## Validation Criteria
- [ ] `src/core/events/`, `src/core/time/` 하위 파일이 `src/core/grid/`, `src/features/`, `src/presentation/` 를 import하지 않음 확인
- [ ] `src/core/` 하위 파일(Foundation 제외)이 `src/features/`, `src/presentation/` 를 import하지 않음 확인
- [ ] 예외 1: `setGatePeriod()` 호출이 `RoundManager.startRound()` 외부에서 발생하지 않음 확인
- [ ] 예외 2: `getCellState()` 외 GridSimulation 쓰기 메서드를 Presentation이 호출하지 않음 확인
- [ ] 새 예외 추가 시 이 ADR 개정 + PR 리뷰에서 명시적 승인 필요

## Related Decisions
- ADR-0001: EventBus — 레이어 간 표준 통신 수단 (이 ADR의 기반)
- ADR-0002: FrameClock — Foundation 레이어 시간 소스 (이 ADR의 기반)
- `docs/architecture/architecture.md` § System Layer Map, § Module Ownership § 레이어 경계 규칙
