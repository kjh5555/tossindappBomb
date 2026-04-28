# Story 001: ITossBridge 인터페이스 + StubTossBridge

> **Epic**: TossBridge
> **Status**: Complete
> **Layer**: Platform
> **Type**: Logic
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0004 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0004 Key Interfaces에서 추출)*

**ADR Governing Implementation**: ADR-0004 (TossBridge Platform 래퍼 및 Safe Area 전파)
**ADR Decision Summary**: Platform SDK 접근을 `ITossBridge` 인터페이스로 추상화. Foundation/Core/Feature/Presentation은 인터페이스만 의존. 단위 테스트에서는 `StubTossBridge` 주입. `init()` 완료 전 `getSafeArea()` / `getUserToken()` 호출 시 throw.

**Engine**: Cocos Creator 3.8.6 | **Risk**: MEDIUM
**Engine Notes**: `@apps-in-toss/web-framework` SDK는 LLM 훈련 범위 외 — 실기기 검증 필수. 인터페이스/Stub 구현은 SDK 의존 없음.

**Control Manifest Rules (Platform/Foundation)**:
- Required: Platform SDK 접근은 `ITossBridge` DI 경유 — source: ADR-0004
- Required: `TossBridge.init()` 이전 `getSafeArea()` / `getUserToken()` 호출 시 명확한 오류 — source: ADR-0004
- Required: 단위 테스트에서 `StubTossBridge` 사용 (`{ top: 44, bottom: 34, left: 0, right: 0 }`) — source: ADR-0004
- Forbidden: `@apps-in-toss/web-framework` 직접 import in Foundation/Core/Feature/Presentation — source: ADR-0004
- Forbidden: `TossBridge.init()` 2회 이상 호출 — source: ADR-0004

---

## Acceptance Criteria

- [ ] `ITossBridge` 인터페이스 정의: `init(): Promise<void>`, `getSafeArea(): SafeArea`, `getUserToken(): string`
- [ ] `SafeArea` 타입 정의: `{ top: number; bottom: number; left: number; right: number }`
- [ ] `StubTossBridge.getUserToken()` → `'stub-token'` 반환
- [ ] `StubTossBridge.getSafeArea()` → `{ top: 44, bottom: 34, left: 0, right: 0 }` 반환
- [ ] `init()` 완료 전 `getSafeArea()` 호출 시 `Error` throw
- [ ] `init()` 완료 전 `getUserToken()` 호출 시 `Error` throw
- [ ] `StubTossBridge.init()` 완료 후 `getSafeArea()` / `getUserToken()` 정상 반환

---

## Implementation Notes

*ADR-0004 Key Interfaces 기반:*

```typescript
// src/platform/ITossBridge.ts
export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ITossBridge {
  init(): Promise<void>;       // GameRoot.onLoad()에서만 호출. 1회 한정.
  getSafeArea(): SafeArea;     // init() 완료 전 호출 시 throws
  getUserToken(): string;      // init() 완료 전 호출 시 throws
}
```

```typescript
// src/platform/StubTossBridge.ts
export class StubTossBridge implements ITossBridge {
  private initialized = false;

  async init(): Promise<void> {
    this.initialized = true;
  }

  getSafeArea(): SafeArea {
    if (!this.initialized) throw new Error('TossBridge.init() must be called before getSafeArea()');
    return { top: 44, bottom: 34, left: 0, right: 0 };
  }

  getUserToken(): string {
    if (!this.initialized) throw new Error('TossBridge.init() must be called before getUserToken()');
    return 'stub-token';
  }
}
```

**Invariants**:
1. `init()`은 GameRoot.onLoad()에서 정확히 1회 호출
2. `getSafeArea()` / `getUserToken()`은 `init()` 완료 후만 유효
3. Foundation/Core/Feature/Presentation은 `ITossBridge`만 의존 — TossBridge 구체 클래스 직접 import 금지

---

## Out of Scope

- Story 002: `granite.config.ts` 설정 (Config/Data)
- 실제 `TossBridge` 구현 (SDK 연동) — 실기기 검증 필요, 별도 스파이크
- GameRoot 초기화 순서 연결 (Core 레이어 epic)

---

## QA Test Cases

**AC-1**: init() 전 getSafeArea() → throw
- Given: `const stub = new StubTossBridge()` (init 미호출)
- When: `stub.getSafeArea()` 호출
- Then: Error throw (메시지에 'init' 포함)

**AC-2**: init() 전 getUserToken() → throw
- Given: 동일 (init 미호출)
- When: `stub.getUserToken()`
- Then: Error throw

**AC-3**: init() 완료 후 getSafeArea() 정상 반환
- Given: `await stub.init()`
- When: `stub.getSafeArea()`
- Then: `{ top: 44, bottom: 34, left: 0, right: 0 }` 반환

**AC-4**: init() 완료 후 getUserToken() 정상 반환
- Given: `await stub.init()`
- When: `stub.getUserToken()`
- Then: `'stub-token'` 반환

**AC-5**: StubTossBridge가 ITossBridge 인터페이스 충족
- Given: `const bridge: ITossBridge = new StubTossBridge()`
- When: 타입 할당
- Then: 컴파일 오류 없음 (TypeScript 타입 검사 통과)

---

## Test Evidence

**Story Type**: Logic
**Required evidence**:
- `tests/unit/platform/tossbridge-interface_test.ts` — AC-1 ~ AC-5 통과

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None — Platform 레이어 최상위 결정
- Unlocks: Story 002 (granite.config.ts), WebSocketClient Story 001 (getUserToken() 사용)
