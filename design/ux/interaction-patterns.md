# Interaction Pattern Library — GRID REAPER

> **Status**: Initial — covers Sprint 5 patterns (lobby, hud, result)
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-27
> **Platform**: 모바일 (Toss 인토스 webview) — 터치 전용
> **Referenced by**: `design/ux/lobby.md`, `design/ux/hud.md`, `design/ux/result.md`
> **Aligned with**: `design/art/art-bible.md` § 3.4 (시각 계층), § 4 (Color System); `design/accessibility-requirements.md` (Tier 2)

이 문서는 GRID REAPER의 모든 화면이 공유하는 기본 상호작용 패턴을 정의한다. 새 화면을 디자인할 때는 이 문서의 패턴을 우선 사용하고, 신규 패턴이 필요할 때만 추가한다.

---

## 1. 터치 기본 규칙

### 1.1 터치 타깃 최소 크기

| 요소 분류 | 최소 크기 | 근거 |
|----------|----------|------|
| Primary action button (Start, Restart) | **48×48dp** (≈64×64px @ 2x) | accessibility-requirements.md Tier 2 |
| Secondary action button (Settings, Mute) | **48×48dp** | 동일 |
| Critical action (Restart 후 즉시 누르기 가능한 버튼) | **64×64dp** 권장 | 손가락 흔들림 여유 |
| 비-인터랙티브 라벨/아이콘 | 제한 없음 | 정보 표시만 |

**버퍼 영역**: 인접 터치 타깃 사이 최소 8dp 간격. 골든 포커스 영역(중앙)에서 우발적 인접 터치 방지.

### 1.2 안전 영역 (Safe Area)

`TossBridge.getSafeArea()`로 받은 인셋(top/bottom/left/right)을 HUDLayer에 1회 적용 (ADR-0016). 모든 인터랙티브 요소는 안전 영역 안쪽에 배치.

대표값 (iPhone 14):
- top: 44pt (노치)
- bottom: 34pt (홈바)
- left/right: 0

### 1.3 제스처 어휘

GRID REAPER는 의도적으로 **단순한 제스처**만 사용한다 (모바일 webview의 시스템 제스처 충돌 회피).

| 제스처 | 의미 | 사용처 |
|-------|------|--------|
| **Tap** | 선택 / 활성화 | 모든 버튼, 셀 이동 (드래그 아님) |
| **Drag (joystick)** | 방향 입력 | 인-게임 플레이어 이동 (Direction8) |
| **금지: Long-press** | 미사용 | 시스템 컨텍스트 메뉴와 충돌 가능 |
| **금지: Swipe (system-level)** | 미사용 | 토스 webview navigation gesture와 충돌 |
| **금지: Pinch / Multi-touch** | 미사용 | v1 범위 외 |

---

## 2. 피드백 표준

### 2.1 즉시 피드백 (Tactile)

`prefers-reduced-motion`과 무관하게 항상 적용 — 사용자가 입력이 인식됐음을 즉시 확인할 수 있어야 한다.

| 입력 | 응답 | 타이밍 |
|------|------|-------|
| Tap (Primary button) | 버튼 scale 95% → 100%, opacity 100% → 80% → 100% | 60ms down, 60ms up |
| Tap (Secondary button) | 버튼 색상 톤 1단계 어둡게 | 즉시 |
| Drag (joystick) | 가상 스틱 노드 위치 실시간 업데이트 | 매 프레임 |
| Tap-blocked (예: Restart 5분 cooldown) | 버튼 shake 50ms ×2 + 회색 처리 유지 | 100ms |

### 2.2 상태 전환 피드백 (Motion)

`prefers-reduced-motion: reduce`인 경우 트위닝 제거 → 즉시 전환 (accessibility-requirements.md § 2).

| 상태 | 일반 | reduced-motion |
|------|------|---------------|
| Lobby → HUD (Start) | Fade out 200ms → fade in 200ms | 즉시 cross-cut |
| HUD → Result overlay | Slide-up 250ms ease-out | 즉시 표시 |
| Result → Lobby (Restart) | Fade out 200ms → Lobby fade in 200ms | 즉시 cross-cut |
| Goal cell pulse | scale 100% → 110% loop, 1.0s | 정적 윤곽선만 (펄스 제거) |

### 2.3 오디오 피드백

S5-S1 (Audio stub) 단계에서는 콘솔 로그로 대체. 실제 오디오는 Sprint 6에서 추가.

| 이벤트 | 클립 키 | 채널 |
|-------|--------|------|
| Primary button tap | `ui_click_primary` | UIFeedback |
| Secondary button tap | `ui_click_secondary` | UIFeedback |
| GAME_OVER overlay | `game_over_sting` | SFX |
| ROUND_CLEAR overlay | `round_clear_sting` | SFX |

---

## 3. 컴포넌트 어휘

### 3.1 PrimaryButton

```
┌─────────────────────┐
│       LABEL         │  ← Hero 계층, 가장 높은 시각 무게
└─────────────────────┘
```

- 채워진 배경 + 큰 텍스트
- 색상: `Danger Cyan` (#00E5CC) 배경 + `Void Black` (#1A1A2E) 텍스트
- 사용처: Start, Restart, Confirm
- 화면당 1개 권장 (player의 1차 행동을 명확히)

### 3.2 SecondaryButton

```
┌─ LABEL ─┐
└─────────┘
```

- 외곽선만 + 작은 텍스트
- 색상: `Player White` @60% 외곽선 + 텍스트, 배경 투명
- 사용처: Settings, Mute, Cancel

### 3.3 InformationLabel

- 배경 없음, 텍스트만
- 색상: `Player White` @60% (UI는 게임보다 조용해야 함 — art-bible § 4)
- Hero 계층 정보(Round Number, Alive Count, Timer)는 White @100% 사용

### 3.4 ResultOverlay

```
╔═══════════════════════╗
║       GAME OVER       ║   ← 큰 메시지 라벨 (White @100%)
║                       ║
║    Final Round: 7     ║   ← 보조 정보 (White @60%)
║                       ║
║   ┌─────────────┐     ║
║   │   RESTART   │     ║   ← PrimaryButton
║   └─────────────┘     ║
╚═══════════════════════╝
```

- 배경: `Void Black` @80% opacity (게임 그리드를 어둡게 가림)
- 메시지 라벨: 폰트 크기 36pt+, White @100%
- Restart 버튼: PrimaryButton 표준
- z-order: HUDLayer (z:30, 모든 요소 위)

---

## 4. 상태 일관성 규칙

### 4.1 Empty / Loading / Error

| 상태 | 표시 | 가능 액션 |
|------|------|---------|
| Loading | 스피너 + "잠시만 기다려주세요" | 없음 (입력 무시) |
| Empty (라운드 시작 전) | 비어있는 그리드 + "Start를 눌러 시작하세요" | Start 버튼만 |
| Error (네트워크 실패) | 아이콘 + "연결할 수 없습니다" + Retry | Retry 버튼만 |

### 4.2 Disabled

비활성 버튼은:
- opacity 50% 처리
- Tap 응답 없음 (Tactile 피드백 표준은 없음 — 의도적인 데드 영역)
- 비활성 사유가 있으면 작은 보조 텍스트로 노출 ("연결 중...", "5초 후 다시 시도 가능")

### 4.3 Selected

`Danger Cyan` 외곽선 2px (art-bible § 3.4: 발광 군집은 위험과 동일 시각 어휘 — Player의 정체성 외곽선과 같은 계층)

---

## 5. 반응형 (orientation / 화면 크기)

GRID REAPER는 **세로 모드 전용** (포트레이트). 가로 모드는 v1 범위 외.

화면 크기 적응:
- 최소 가로폭: 320dp (iPhone SE 1세대)
- 최대 가로폭: 430dp (iPhone Pro Max)
- 그리드는 항상 정사각형 — 가로폭 = min(screenWidth - 32dp, screenHeight × 0.6)
- 그리드 위/아래 잔여 공간이 HUD와 액션 영역에 분배됨

---

## 6. 접근성 체크리스트 (모든 화면 공통)

각 화면 스펙 § "Accessibility" 작성 시 이 리스트를 만족해야 한다 (Tier 2).

- [ ] 모든 인터랙티브 요소 ≥ 48dp
- [ ] 텍스트 명암비 ≥ 4.5:1 (WCAG AA)
- [ ] 색상 단독 정보 금지 (예: Selected는 색 + 외곽선 굵기로 구분)
- [ ] `prefers-reduced-motion` 시 모든 비필수 모션 제거 (accessibility-requirements.md § 2)
- [ ] Restart 등 파괴적 액션은 우발적 트리거 방지 — 최소 200ms hold-time 또는 명시적 confirm
- [ ] 사망 직후 결과 오버레이 표시까지 최소 300ms 유예 — "왜 죽었는지" 인식 시간

---

## 7. 미해결 항목

| 항목 | 결정 시점 |
|------|---------|
| 멀티플레이어 lobby — 입장/대기 화면 패턴 | Sprint 6 (Matchmaking 구현 시) |
| 인-게임 일시정지 화면 | Sprint 6 (Pause 기능 추가 시) |
| Settings 화면 (볼륨, reduced-motion 토글) | Sprint 6 |
| 통계/리더보드 화면 | v1 범위 외 |
