# Story 002: granite.config.ts 설정

> **Epic**: TossBridge
> **Status**: Complete
> **Layer**: Platform
> **Type**: Config/Data
> **Manifest Version**: 2026-04-22

## Context

**GDD**: N/A — ADR-0004 권위
**Requirement**: TR 미등록 (tr-registry.yaml 비어 있음 — /architecture-review 미실행)
*(ADR-0004 Migration Plan에서 추출)*

**ADR Governing Implementation**: ADR-0004 (TossBridge Platform 래퍼 및 Safe Area 전파)
**ADR Decision Summary**: `@apps-in-toss/web-framework` SDK는 `granite.config.ts`를 요구한다. `appName`, `displayName`, `icon`, `color` 필드를 설정해야 Toss 앱 샌드박스에서 실행 가능.

**Engine**: Cocos Creator 3.8.6 | **Risk**: MEDIUM
**Engine Notes**: `@apps-in-toss/web-framework` SDK(`ait` CLI)는 LLM 훈련 범위 외 — 실기기 샌드박스에서 `ait init` 후 webview 실행 여부 검증 필요.

**Control Manifest Rules (Platform)**:
- Required: Platform SDK 접근은 `ITossBridge` DI 경유 — source: ADR-0004
- Forbidden: `@apps-in-toss/web-framework` 직접 import in Foundation/Core/Feature/Presentation — source: ADR-0004

---

## Acceptance Criteria

- [ ] `granite.config.ts` 파일이 프로젝트 루트에 존재
- [ ] `appName` 필드 설정됨 (예: `'grid-reaper'`)
- [ ] `displayName` 필드 설정됨 (예: `'GRID REAPER'`)
- [ ] `icon` 필드 설정됨 (경로 또는 플레이스홀더)
- [ ] `color` 필드 설정됨 (브랜드 컬러 hex)
- [ ] `ait` CLI로 Toss 샌드박스 앱 빌드 + webview 실행 확인 (실기기 스모크 체크)

---

## Implementation Notes

*ADR-0004 Migration Plan + Toss 인토스 Integration Notes 기반:*

```typescript
// granite.config.ts (프로젝트 루트)
export default {
  appName: 'grid-reaper',
  displayName: 'GRID REAPER',
  icon: './assets/app-icon.png',   // 실제 아이콘 파일 경로로 교체 필요
  color: '#1A1A2E',                // GRID REAPER 다크 브랜드 컬러
  web: {
    host: '0.0.0.0',              // 실기기 테스트용 네트워크 바인딩
    port: 7456,
  },
};
```

**실기기 검증 순서**:
1. `npm install @apps-in-toss/web-framework` (또는 `ait init`)
2. `granite.config.ts` 작성
3. `ait dev` 로컬 개발 서버 실행
4. 토스 샌드박스 앱에서 접속 확인
5. `getSafeArea()` 값이 실제 기기 노치와 일치하는지 육안 확인

---

## Out of Scope

- Story 001: ITossBridge 인터페이스 + StubTossBridge 구현
- 실제 TossBridge.ts SDK 구현 (별도 스파이크 태스크 — OQ-7 실기기 검증 포함)
- 아이콘/스플래시 에셋 디자인 (Presentation 레이어)

---

## QA Test Cases

*Config/Data 스토리 — 자동화 테스트 없음. 스모크 체크로 증거.*

**AC-1**: granite.config.ts 파일 존재 + 필수 필드
- Setup: 프로젝트 루트에서 `cat granite.config.ts`
- Verify: `appName`, `displayName`, `icon`, `color` 모두 존재
- Pass condition: 4개 필드 모두 비어있지 않음

**AC-2**: ait dev 빌드 성공
- Setup: `ait dev` 실행
- Verify: 빌드 오류 없이 로컬 서버 실행됨
- Pass condition: 터미널 오류 없음, URL 출력됨

**AC-3**: Toss 샌드박스 webview 실행
- Setup: 토스 샌드박스 앱 + AC-2 서버 URL 입력
- Verify: GRID REAPER 화면 표시됨
- Pass condition: 화면 표시, 앱 이름 `GRID REAPER` 노출

---

## Test Evidence

**Story Type**: Config/Data
**Required evidence**:
- `production/qa/smoke-tossbridge-granite.md` — AC-1 ~ AC-3 스모크 체크 결과 기록

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: Story 001 (ITossBridge + StubTossBridge) must be DONE
- Unlocks: TossBridge Epic DoD 충족 → OQ-7 실기기 검증 스파이크 실행 가능
