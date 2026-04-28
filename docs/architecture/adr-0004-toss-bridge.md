# ADR-0004: TossBridge — Platform 래퍼 및 Safe Area 전파

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Platform / Scripting |
| **Knowledge Risk** | MEDIUM — `@apps-in-toss/web-framework` SDK는 LLM 훈련 범위 외. 실기기 검증 필수 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` (Toss 인토스 Integration Notes) |
| **Post-Cutoff APIs Used** | `@apps-in-toss/web-framework` — `ait init` CLI, `granite.config.ts` |
| **Verification Required** | 실기기(토스 앱 샌드박스)에서 `init()` 완료 후 `getSafeArea()` 값이 실제 기기 노치와 일치하는지 확인. `StubTossBridge`로 단위 테스트 통과 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None — Platform 최상위 결정. Init order step 2 (TossBridge 초기화는 EventBus(step 3) 이전) |
| **Enables** | WebSocketClient 구현 (userToken 필요), RoundHUD Safe Area 레이아웃 (safeArea 필요) |
| **Blocks** | 네트워크 인증 흐름, Safe Area 의존 UI 레이아웃 |
| **Ordering Note** | GameRoot.onLoad() 진입 즉시 await TossBridge.init() — 이후 모든 Foundation/Core 초기화 진행 |

## Context

### Problem Statement

게임이 토스 인토스 webview 환경에서 실행된다. `@apps-in-toss/web-framework` SDK가 제공하는:
- **userToken**: WebSocket 서버 인증에 필요
- **safeArea**: 기기 노치/하단 홈 인디케이터 영역 회피를 위한 UI 레이아웃에 필요

두 값 모두 게임 시작 전 SDK 초기화 완료 시점에 1회 취득해야 한다.
SDK를 직접 호출하는 코드가 여러 모듈에 흩어지면:
- 레이어 경계 위반 (Foundation/Core가 Platform SDK를 직접 알게 됨)
- 단위 테스트 불가 (실제 SDK는 webview 환경 없이 호출 불가)
- SDK 교체 시 변경 파급 범위 불필요하게 확대

### Constraints

- `@apps-in-toss/web-framework` 는 LLM 훈련 범위 외 → 실기기 검증 필수
- Init은 동기 반환 불가 (Promise 기반 SDK)
- TossBridge는 ADR-0003 레이어 규칙에서 Platform 레이어에 속함 (`src/platform/`)
- EventBus(ADR-0001)는 TossBridge 이후에 초기화 → TossBridge.init()에서 EventBus 사용 불가

### Requirements

- Platform SDK 접근을 `src/platform/TossBridge.ts` 한 곳으로 집중
- `ITossBridge` 인터페이스로 추상화 → Foundation/Core가 인터페이스만 의존
- `StubTossBridge` 로 단위 테스트에서 SDK 없이 주입 가능
- `init()` 완료 전 `getSafeArea()` / `getUserToken()` 호출 시 명확한 오류

## Decision

**TossBridge를 `ITossBridge` 인터페이스로 추상화**하고, DI(의존성 주입) 패턴으로 상위 레이어에 전파한다.

- `src/platform/TossBridge.ts` — 실제 SDK 호출
- `src/platform/StubTossBridge.ts` — 단위 테스트용 스텁
- GameRoot.onLoad()에서 await TossBridge.init() 완료 후 인스턴스를 Foundation/Core에 주입

### Init Flow

```
GameRoot.onLoad()
    │
    ├── await TossBridge.init()
    │       │  성공: userToken + safeArea 캐시
    │       │  실패: ErrorScreen 표시 (게임 진행 불가)
    │
    ├── EventBus 초기화 (step 3)
    ├── FrameClock 초기화 (step 3)
    ├── ...나머지 시스템 DI 주입
    │
    └── 게임 루프 시작
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│ PLATFORM                                            │
│  TossBridge ──── @apps-in-toss/web-framework SDK   │
│                  (userToken, safeArea 캐시)          │
└────────────────────────┬────────────────────────────┘
                    ITossBridge (인터페이스)
┌────────────────────────▼────────────────────────────┐
│ FOUNDATION / CORE / FEATURE / PRESENTATION          │
│  생성자에서 ITossBridge 수신 (DI)                    │
│  init() 이후 getSafeArea() / getUserToken() 호출   │
└─────────────────────────────────────────────────────┘

테스트 환경:
  StubTossBridge (ITossBridge) ──► 동일 DI 경로
```

### Key Interfaces

```typescript
// src/platform/TossBridge.ts

export interface SafeArea {
  top: number;     // pixels, 기기 상단 노치/상태바 높이
  bottom: number;  // pixels, 기기 하단 홈 인디케이터 높이
  left: number;
  right: number;
}

export interface ITossBridge {
  init(): Promise<void>;          // GameRoot.onLoad()에서만 호출. 1회 한정.
  getSafeArea(): SafeArea;        // init() 완료 전 호출 시 throws
  getUserToken(): string;         // init() 완료 전 호출 시 throws
}

// Invariants:
// 1. init()은 GameRoot.onLoad()에서 정확히 1회 호출. 중복 호출 금지.
// 2. getSafeArea() / getUserToken()은 init() 완료 후만 유효.
// 3. Foundation/Core/Feature/Presentation은 ITossBridge만 의존 — TossBridge 구체 클래스 직접 import 금지.

// src/platform/StubTossBridge.ts
export class StubTossBridge implements ITossBridge {
  async init(): Promise<void> {}
  getSafeArea(): SafeArea { return { top: 44, bottom: 34, left: 0, right: 0 }; }
  getUserToken(): string { return 'stub-token'; }
}
```

## Alternatives Considered

### Alternative A: SDK 직접 호출 (래퍼 없음)
- **Description**: WebSocketClient, RoundHUD 등 각 모듈이 `@apps-in-toss/web-framework`를 직접 import
- **Pros**: 추가 추상화 없음
- **Cons**: ADR-0003 레이어 경계 위반 (Foundation/Feature/Presentation이 Platform SDK 직접 의존). 단위 테스트 불가.
- **Rejection Reason**: 레이어 경계 규칙(forbidden_pattern: reverse_layer_dependency) 위반

### Alternative B: EventBus로 TOSS_READY 이벤트 브로드캐스트
- **Description**: TossBridge.init() 완료 시 `EventBus.emit('TOSS_READY', { token, safeArea })` 발행. 소비자는 이 이벤트 구독.
- **Pros**: 느슨한 결합, 이벤트 기반 일관성
- **Cons**: **Init order 충돌 — TossBridge는 step 2, EventBus는 step 3 초기화.** TOSS_READY 발행 시점에 EventBus가 아직 존재하지 않음 → 이벤트 유실. 또한 init() 이전 접근 시 guard 불가.
- **Rejection Reason**: Init order 구조적 충돌. EventBus는 TossBridge 이후에 생성됨.

## Consequences

### Positive
- Platform SDK 변경 시 `TossBridge.ts` 1개 파일만 수정
- 단위 테스트에서 `StubTossBridge` 주입으로 SDK 없이 전체 게임 로직 테스트 가능
- `getSafeArea()` 값이 UI 레이아웃 DI로 전달 → 하드코딩된 픽셀 오프셋 없음

### Negative
- GameRoot.onLoad()의 init() 실패 시 게임 진입 자체 불가 — 별도 ErrorScreen 필요
- `@apps-in-toss/web-framework` 실제 API 형태를 실기기 없이 검증 불가

### Risks
- **SDK API 불일치**: `init()`, `getSafeArea()` 메서드 시그니처가 실제 SDK와 다를 수 있음. **Mitigation**: 실기기 샌드박스 테스트를 TossBridge 구현 첫 단계로 실행
- **Safe Area 값 변동**: OS 업데이트로 safeArea 값이 달라질 수 있음. **Mitigation**: `getSafeArea()`를 캐시 반환으로 구현. 필요 시 재쿼리 API 추가

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| game-concept.md | 토스 인토스 webview 환경에서 실행 | TossBridge가 Platform SDK 접근을 격리, DI로 전파 |
| player-movement.md | 터치 입력 영역이 safe area 밖에 위치해야 함 | `getSafeArea()` API로 정확한 safe area 값 공급 |

## Performance Implications
- **CPU**: init() 1회 async 호출 — 게임 루프와 무관
- **Memory**: safeArea + userToken 캐시 — 무시 가능
- **Load Time**: init() 지연이 게임 첫 화면 표시 지연에 직접 영향. SDK 응답 <500ms 기대
- **Network**: 없음 (SDK 로컬 초기화)

## Migration Plan
신규 시스템 — 기존 코드 없음. GameRoot 컴포넌트에서 TossBridge 인스턴스를 생성하고 init() 완료 후 의존 시스템에 주입. 단위 테스트 환경에서는 StubTossBridge를 주입.

## Validation Criteria
- [ ] 토스 앱 샌드박스 실기기에서 `init()` 완료 후 `getSafeArea()` 값이 실제 기기 safe area와 일치
- [ ] `StubTossBridge` 주입 시 Foundation/Core 단위 테스트가 SDK 없이 통과
- [ ] `init()` 이전 `getSafeArea()` 호출 시 명확한 오류(throw 또는 assertion) 발생 확인
- [ ] GameRoot.onLoad()에서 `init()` 실패 시 ErrorScreen으로 이동하고 게임 루프 시작되지 않음 확인

## Related Decisions
- ADR-0001: EventBus — EventBus 초기화가 TossBridge 이후(step 3)임을 확정
- ADR-0003: 레이어 경계 — TossBridge가 Platform 레이어에 귀속됨을 확정
- `docs/architecture/architecture.md` § Platform Layer, § Init Order
