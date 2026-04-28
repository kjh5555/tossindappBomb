# Story 001: Test Infrastructure Scaffold

> **Epic**: EventBus
> **Status**: Complete
> **Layer**: Foundation
> **Type**: Integration
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — 프로젝트 인프라
**Requirement**: Gate-check blocker #1-2 (tests/unit/, tests/integration/, CI workflow)
*(gate-check pre-production 2026-04-22 결과)*

**ADR Governing Implementation**: ADR-0001 (EventBus) — 단위 테스트 구조 기준
**ADR Decision Summary**: 모든 Logic/Integration 스토리는 tests/ 하위에 자동화 테스트를 포함해야 함. 이 스토리는 그 테스트 인프라를 구축한다.

**Engine**: Cocos Creator 3.8.6 | **Risk**: LOW
**Engine Notes**: 테스트는 Cocos 런타임 없이 순수 TypeScript/Jest로 실행. 엔진 API 불필요.

**Control Manifest Rules (Foundation)**:
- Required: IEventBus DI 패턴 — 모든 테스트에서 MockEventBus 주입 가능한 구조
- Forbidden: 게임 로직 테스트에서 cc.EventTarget 직접 사용

---

## Acceptance Criteria

- [ ] `tests/unit/` 디렉토리 존재 (최소 1개 서브디렉토리 포함)
- [ ] `tests/integration/` 디렉토리 존재
- [ ] Jest (또는 동등 테스트 러너) TypeScript 설정 완료 (`jest.config.ts` 또는 `jest.config.js`)
- [ ] `package.json` 에 `"test": "jest"` 스크립트 추가
- [ ] `.github/workflows/tests.yml` — PR + main push 시 테스트 자동 실행
- [ ] 카나리 테스트 `tests/unit/canary_test.ts` 통과 (`expect(1 + 1).toBe(2)`)
- [ ] CI 워크플로우 로컬 `npm test` 로 green 확인

---

## Implementation Notes

*테스트 설정 가이드라인:*

- Jest + `ts-jest` 조합 권장 (TypeScript 소스 직접 실행)
- `tsconfig.test.json` 분리 — Cocos 타입 없이 순수 TypeScript만 포함
- `moduleNameMapper` 로 `@/` 경로 alias 설정 (프로젝트 src/ 기준)
- Cocos CC 타입이 필요한 모듈은 테스트에서 mock 처리
- 테스트 실행 명령: `npx jest --testPathPattern=tests/`

CI 워크플로우 최소 구성:
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
```

---

## Out of Scope

- Story 002: 실제 GameEvents 타입 정의 (이 스토리는 인프라만)
- Story 003: EventBus 구현체 테스트

---

## QA Test Cases

**AC-1**: 카나리 테스트 통과
- Given: `npm ci` 완료 상태
- When: `npm test` 실행
- Then: `tests/unit/canary_test.ts` 통과, 0 failures
- Edge cases: `npm ci` 실패 시 먼저 의존성 해결 필요

**AC-2**: CI 워크플로우 실행
- Given: `.github/workflows/tests.yml` 존재
- When: main 브랜치에 push
- Then: GitHub Actions에서 "Tests" 워크플로우 green
- Edge cases: GitHub Actions 없는 환경 → `npm test` 로컬 통과로 대체

---

## Test Evidence

**Story Type**: Integration
**Required evidence**:
- `tests/unit/canary_test.ts` — 통과
- CI workflow green (또는 `npm test` 로컬 통과 스크린샷)

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None (이 스토리가 첫 번째)
- Unlocks: Story 002, Story 003, Story 004, Story 005 (모든 스토리가 이 인프라 위에서 실행)

---

## Completion Notes

**Completed**: 2026-04-22
**Criteria**: 7/7 passing ✅
**Deviations**: None
**Test Evidence**: `tests/unit/canary_test.ts` — 3 tests passing (Jest/ts-jest config, strict mode, ES2020 features verified)
**Code Review**: Complete (1 MEDIUM advisory noted: path alias pattern, non-blocking)
