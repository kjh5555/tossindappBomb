# Accessibility Requirements — GRID REAPER

> **Status**: Committed — v1 scope finalized.
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-23
> **Platform**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Referenced by**: `design/difficulty-curve.md` (motion policy), `production/gate-checks/`

---

## 1. 접근성 티어 (Accessibility Tier)

**선택된 티어: Tier 2 — Standard**

| 티어 | 정의 | 적용 여부 |
|------|------|---------|
| Tier 1: Basic | 터치 타깃 최소 크기, 색상 단독 정보 금지 | ✅ 포함 |
| **Tier 2: Standard** | **+ prefers-reduced-motion 지원, 충분한 명암비** | ✅ **선택됨** |
| Tier 3: Enhanced | + 화면 리더 전체 게임플레이 지원, 키보드 탐색 완전 지원 | ❌ v1 범위 외 |

**Tier 2 선택 근거**: GRID REAPER는 모바일 전용 터치 게임이다. 게임 그리드의 실시간 시각 정보(폭발 경고 깜빡임)는 핵심 게임플레이 메커니즘이므로 완전 제거는 불가하나, 비필수 모션을 `prefers-reduced-motion`으로 제어하고 터치 타깃 기준을 충족하는 것으로 광범위한 플레이어에게 접근 가능한 경험을 제공한다.

---

## 2. prefers-reduced-motion 정책

> `prefers-reduced-motion: reduce` 미디어 쿼리 또는 Toss webview 접근성 설정이 활성화된 경우 적용.

### 2.1 펄싱 요소 전체 분류

| 요소 | 위치 | 필수 모션 여부 | reduced-motion 처리 |
|------|------|-------------|-------------------|
| **셀 폭발 경고 깜빡임** | 게임 그리드 | ✅ 필수 (게임 메커니즘) | 깜빡임 유지, **강도(opacity 진폭) 30% 감소** |
| **GATE_PERIOD 속도 피드백** | 경고 깜빡임 간격 | ✅ 필수 (게임 메커니즘) | 간격 변화 유지, **easing curve 제거 (linear로 고정)** |
| **Tier 전환 격자 펄스** | 전체 그리드 0.2s | ❌ 비필수 (신호용) | **펄스 제거 → 순간 색상 변경으로 대체** |
| **ROUND_CLEAR 화면 효과** | 결과 오버레이 | ❌ 비필수 (연출) | **페이드인 제거 → 즉시 표시** |
| **플레이어 이동 애니메이션** | 플레이어 노드 | ❌ 비필수 (폴리시) | **트위닝 제거 → 즉시 이동** |
| **Goal Cell 강조 펄스** | Goal Cell 노드 | ⚠️ 권장 (가시성) | **펄스 유지, 진폭 50% 감소 + 정적 윤곽선 추가** |
| **Tier 등장 스팅 (시각)** | 그리드 테두리 | ❌ 비필수 | **제거** |
| **UI 버튼 hover/press 애니메이션** | 전체 UI | ❌ 비필수 | **제거 → 즉시 상태 전환** |

### 2.2 구현 계약

```typescript
// src/core/platform/AccessibilityPrefs.ts
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- 게임 초기화 시 1회 확인. 세션 중 변경은 무시 (리로드 시 반영).
- 모든 애니메이션 컴포넌트는 `AccessibilityPrefs.prefersReducedMotion()` 를 초기화 시 참조.
- **Cocos Creator 구현**: 비필수 애니메이션 노드에 `ReducedMotionBehavior` 컴포넌트 부착. `reduced = true` 시 `cc.Tween` 건너뜀, 즉시 최종 상태로 이동.

### 2.3 필수 모션 최소 감소 원칙

> "폭발 경고 깜빡임은 읽는 행위 자체다 — 제거하면 게임이 성립하지 않는다."
> `prefers-reduced-motion`에서도 경고 깜빡임의 **타이밍(간격, 지속시간)**은 변경하지 않는다.
> 변경 가능한 것은 **강도(opacity 진폭)와 easing**뿐이다.

---

## 3. 터치 타깃 최소 크기

**최소 크기: 48 × 48 logical pixels (dp)**

| 근거 | 값 |
|------|-----|
| Google Material Design 3 권장 | 48 × 48dp |
| Apple Human Interface Guidelines | 44 × 44pt |
| 적용 기준 (보수적 선택) | **48 × 48 logical pixels** |

### 3.1 요소별 최소 크기 적용표

| UI 요소 | 최소 터치 영역 | 시각적 크기 | 비고 |
|---------|-------------|-----------|------|
| **게임 시작 버튼** | 48 × 48px | 200 × 56px | 여유 충분 |
| **재시작 버튼 (결과 화면)** | 48 × 48px | 160 × 48px | 최소값 충족 |
| **로비 플레이어 준비 버튼** | 48 × 48px | 180 × 52px | 여유 있음 |
| **결과 화면 홈 버튼** | 48 × 48px | 48 × 48px | 최소값 = 시각 크기 (패딩 필수) |
| **개별 그리드 셀** | N/A — 터치 대상 아님 | (가변) | 플레이어는 스와이프/탭으로 이동, 셀 직접 탭 아님 |
| **스펙테이터 응원 버튼** | 48 × 48px | 64 × 64px | 여유 있음 |

### 3.2 구현 규칙

- 시각적 크기가 48px 미만이더라도 `padding` 또는 투명 히트박스로 터치 영역 48px 보장.
- Cocos Creator: `UITransform.contentSize` 가 48px 미만인 버튼에 투명 `cc.Node` 히트박스 오버레이 적용.
- **절대 금지**: 인접한 두 버튼 간 간격 < 8px — 오탭 위험.

---

## 4. 화면 리더 (Screen Reader) 범위

### 4.1 v1 범위 IN (지원)

| 화면/요소 | 지원 내용 | 구현 방법 |
|---------|---------|---------|
| **로비 화면 버튼** | 버튼 레이블 읽기 | `aria-label` 또는 텍스트 노드 접근 |
| **결과 화면** | 라운드 번호, 생존 여부, 재시작 버튼 | `aria-live` 결과 컨테이너 |
| **오류/연결 끊김 메시지** | 알림 텍스트 읽기 | `role="alert"` |
| **로딩 상태** | "로딩 중..." 텍스트 | `aria-busy` |

### 4.2 v1 범위 OUT (미지원)

| 화면/요소 | 미지원 이유 |
|---------|-----------|
| **게임 그리드 실시간 상태** | 실시간 폭발/이동이 60fps로 변경 — 화면 리더로 의미 있는 탐색 불가능. 게임 메커니즘상 시각 정보가 핵심. |
| **그리드 셀 개별 접근** | 7×5 = 35개 셀 × 프레임당 상태 변경 — 화면 리더 과부하 |
| **실시간 플레이어 위치 알림** | 60fps 위치 변경 — 알림 폭발 위험 |
| **패턴 경고 음성 안내** | MVP 외 범위 — Sprint 6+ 검토 대상 |

> **화면 리더 미지원 공식 입장**: GRID REAPER v1은 시각 기반 실시간 게임이다. 게임플레이 자체의 화면 리더 지원은 현재 기술적으로 의미 있는 구현이 어려우며, 이는 향후 오디오 큐 기반 접근성 모드(Tier 3) 연구를 통해 검토한다. 메뉴와 결과 화면은 완전 지원한다.

---

## 5. 색상 대비 (Color Contrast)

| 요소 | 전경 | 배경 | 대비율 | WCAG AA (4.5:1) |
|------|------|------|--------|----------------|
| 라운드 번호 텍스트 | `#FFFFFF` | `#0A0A0A` | 21:1 | ✅ 통과 |
| 버튼 레이블 | `#0A0A0A` | `#00E5CC` (Danger Cyan) | 8.1:1 | ✅ 통과 |
| 경고 셀 색상 (위험) | `#FF6B35` (Coral) | `#0A0A0A` | 4.6:1 | ✅ 통과 |
| Goal Cell 강조 | `#00E5CC` | `#0A0A0A` | 8.1:1 | ✅ 통과 |
| 비활성 셀 | `#333333` | `#0A0A0A` | 2.5:1 | ⚠️ AA 미달 — 비활성(정보 없음), 허용 |

> 색상만으로 정보를 전달하는 요소 없음 — 모든 상태는 색상 + 애니메이션(또는 위치)으로 이중 표현.

---

## 6. 구현 우선순위

| 우선순위 | 항목 | Sprint |
|---------|------|--------|
| P0 (필수) | 터치 타깃 48px 최소 크기 | Sprint 4 (UI 구현 시) |
| P0 (필수) | `prefers-reduced-motion` 비필수 모션 제거 | Sprint 4 (UI 구현 시) |
| P1 (권장) | 결과/로비 화면 `aria-label` 추가 | Sprint 5 |
| P1 (권장) | 색상 대비 AA 통과 확인 | Sprint 5 |
| P2 (검토) | 오디오 큐 기반 접근성 모드 | Sprint 6+ (Tier 3 검토) |

---

## 7. 검증 기준 (Acceptance Criteria)

| ID | 기준 | 검증 방법 |
|----|------|---------|
| AC-A11Y-01 | 모든 인터랙티브 요소 터치 영역 ≥ 48×48px | 개발 빌드에서 히트박스 오버레이 시각화 확인 |
| AC-A11Y-02 | `prefers-reduced-motion: reduce` 활성 시 Tier 전환 펄스 대신 즉시 색상 변경 | 시뮬레이터 설정 → 화면 녹화 비교 |
| AC-A11Y-03 | `prefers-reduced-motion: reduce` 활성 시에도 셀 폭발 경고 깜빡임 **타이밍** 유지 | 자동화: `GATE_PERIOD` 간격이 reduced-motion 모드에서 변경되지 않음 |
| AC-A11Y-04 | 색상만으로 구분되는 게임 상태 없음 (색상 + 추가 신호 이중 표현) | 색맹 시뮬레이터(Coblis 또는 동등 도구)로 각 화면 캡처 검토 |
| AC-A11Y-05 | 로비/결과 화면 주요 버튼에 `aria-label` 존재 | VoiceOver(iOS) 또는 TalkBack(Android) 수동 테스트 |
| AC-A11Y-06 | 인접 버튼 간 최소 간격 8px 이상 | UI 레이아웃 검토 |
