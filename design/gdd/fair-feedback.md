# 공정 피드백 (Fair Feedback)

> **Status**: Draft — Review Pending
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-21
> **Implements Pillar**: Pillar 4 — 공정한 죽음

## Overview

공정 피드백 시스템은 플레이어가 사망한 순간, 사인이 된 폭발 게이트를 즉시 시각적으로 하이라이트하여 "왜 죽었는지"를 명확히 전달하는 읽기 전용 피드백 레이어다. 그리드 폭발 시스템이 발행하는 `PLAYER_KILLED` 이벤트를 수신하고, 사망 시점에 EX 상태였던 게이트 셀 좌표를 화면에 강조 표시한다. 이 시스템은 어떤 상태도 변경하지 않으며, 오직 이벤트를 구독하고 렌더링 오버레이를 출력하는 역할만 수행한다. 플레이어는 죽는 즉시 원인을 인지하며 억울함 없이 다음 판으로 넘어갈 수 있는 인지적 클로저(cognitive closure)를 얻는다. Pillar 4 "공정한 죽음"의 직접 구현체다.

## Player Fantasy

**죽음이 가르친다**

죽음은 벌이 아니다. 폭발 플래시 직후 게이트 셀이 재점등되는 그 0.3초는 게임이 플레이어에게 건네는 데이터다 — "이 패턴이 있었고, 너는 읽지 못했다." 플레이어는 이 순간 분노 대신 자기 교정 섬광을 느낀다: *아, 저 게이트였구나. 다음엔 안 놓친다.*

이 시스템은 Pillar 1 "읽으면 이긴다"와 Pillar 4 "공정한 죽음"을 한 순간에 묶는다. 죽음이 명확해질수록 다음 판의 패턴 읽기가 더 의미 있어지며, 사망 횟수가 곧 학습량이 된다. 억울함이 사라진 자리에 "한 판 더"의 의지만 남는다.

**앵커 모먼트**: 연속으로 같은 패턴에 두 번 죽은 뒤, 세 번째 판에서 그 게이트를 피하는 순간.

## Detailed Design

### Core Rules

**FF-1. 트리거 조건**

`PLAYER_KILLED { playerId, killerGateCells: CellCoord[], killerGateId, timestamp }` 이벤트가 수신될 때마다 로컬 플레이어에 한해 오버레이를 트리거한다. 원격 플레이어의 `PLAYER_KILLED` 이벤트는 무시한다. `cause` 필드값(`EXPLOSION` 또는 `DANGER_ZONE`)에 관계없이 동일하게 트리거된다.

**FF-2. 하이라이트 대상**

이벤트 페이로드의 `killerGateCells[]` 배열에 포함된 셀만 강조 표시한다. 그 외 셀은 변경하지 않는다. 이 시스템은 그리드 폭발 시스템이 소유하는 논리 상태에 관여하지 않는다.

**FF-3. 하이라이트 비주얼**

`killerGateCells`에 포함된 셀을 다음과 같이 렌더링한다 (기존 Exploded dim `#3A1A1A` 위에 오버레이 레이어로 합성):
- Fill: Death Rose `#FF3366` 60% opacity, 1.0Hz 단일 펄스
- Outline: `#FF3366` 3px solid
- 그리드 폭발 시스템의 Exploded 비주얼은 오버레이 아래 유지됨

**FF-4. 지속 시간 및 자동 해제**

`PLAYER_KILLED` 이벤트 수신 시점부터 `FEEDBACK_DURATION = 700ms` 경과 후 오버레이를 자동 해제한다. 사망 애니메이션(600ms)과 병렬 실행되며, 오버레이가 먼저 종료되는 경우 잔여 애니메이션은 계속 진행된다.

**FF-5. 탭-투-스킵**

오버레이 활성 중 화면 어디든 탭하면 즉시 해제된다. 탭 이벤트는 이 시스템에서 소비되며 이동 시스템으로 전파되지 않는다. 해제 동작은 자동 해제와 동일하다.

**FF-6. 입력 차단 범위**

오버레이 활성 중(트리거 ~ 해제):
- 조이스틱 방향 이벤트: 차단 (이동 시스템 도달 전 드롭)
- 탭-투-스킵: 허용 (이 시스템이 소비)
- 기타 HUD 탭: 허용 (범위 외)

**FF-7. 멀티플레이어 — 독립 오버레이**

각 플레이어의 오버레이는 독립적이다. Player A의 사망은 Player A의 화면에만 오버레이를 표시한다. 옵저버 화면은 어떤 플레이어 사망에도 오버레이를 표시하지 않는다.

**FF-8. 동시 사망**

동일 프레임에 여러 플레이어가 사망해도 각자 자신의 `killerGateCells`를 독립적으로 표시한다.

**FF-9. 빠른 연속 사망 (오버레이 교체)**

기존 오버레이가 활성 중 새 `PLAYER_KILLED` 이벤트가 도착하면:
1. 현재 오버레이를 즉시 해제
2. 새 `killerGateCells`로 오버레이를 즉시 트리거
3. `FEEDBACK_DURATION` 타이머 리셋

항상 가장 최근 사망 원인이 표시된다.

**FF-10. 리스폰 비차단**

라운드 매니저가 관리하는 리스폰 시퀀스는 오버레이 타이머와 독립적으로 진행된다. 오버레이 중에도 플레이어가 리스폰될 수 있다. *(라운드 매니저 미설계 — 라운드 종료 시 오버레이 처리 순서는 provisional)*

---

### States and Transitions

| 상태 | 진입 조건 | 종료 조건 | 비주얼 |
|------|----------|----------|--------|
| **IDLE** | 초기 상태 / 오버레이 해제 직후 | `PLAYER_KILLED` 수신 | 없음 |
| **HIGHLIGHT_ACTIVE** | `PLAYER_KILLED` 수신 즉시 | 700ms 경과 **또는** 탭-투-스킵 **또는** 새 `PLAYER_KILLED` 수신 | `killerGateCells`에 `#FF3366` overlay; 조이스틱 차단 |
| **DISMISSING** | HIGHLIGHT_ACTIVE 종료 조건 충족 | 동일 틱 처리 완료 | — (단일 틱 전환) |

```
IDLE → [PLAYER_KILLED] → HIGHLIGHT_ACTIVE
HIGHLIGHT_ACTIVE → [700ms OR tap OR new PLAYER_KILLED] → DISMISSING → IDLE
(new PLAYER_KILLED path) → IDLE → HIGHLIGHT_ACTIVE (same tick)
```

발행 이벤트:
- IDLE → HIGHLIGHT_ACTIVE: `FEEDBACK_SHOWN { playerId, killerGateCells, timestamp }`
- HIGHLIGHT_ACTIVE → DISMISSING: `FEEDBACK_DISMISSED { playerId, reason: 'DURATION'|'TAP'|'REPLACED', timestamp }`

---

### Interactions with Other Systems

| 시스템 | Data In | Data Out | 소유자 |
|--------|---------|----------|--------|
| 그리드 폭발 | `PLAYER_KILLED` 이벤트 | 없음 (읽기 전용) | 그리드 폭발 |
| 플레이어 이동 | `PLAYER_KILLED` 이벤트 | 조이스틱 차단 신호 | 공정 피드백 |
| 터치 입력 | 탭 이벤트 (스킵 판정) | 이벤트 소비 | 공정 피드백 |
| 그리드 렌더링 | 없음 | overlay draw 명령 (`#FF3366`, 60%) | 공정 피드백 |
| HUD | 없음 | `FEEDBACK_SHOWN`, `FEEDBACK_DISMISSED` | 공정 피드백 |
| 오디오 | 없음 | `AUDIO_EVENT(FEEDBACK_START)`, `AUDIO_EVENT(FEEDBACK_END)` | 공정 피드백 |

## Formulas

**F-1. 오버레이 지속 시간**

```
FEEDBACK_DURATION = 700 ms
```

| 변수 | 정의 | 범위 |
|------|------|------|
| `FEEDBACK_DURATION` | `PLAYER_KILLED` 수신 시점부터 자동 해제까지의 시간 | 500–1200 ms |

예시: t=0ms `PLAYER_KILLED` 수신 → t=700ms 자동 해제

**F-2. 사망 애니메이션과의 병렬 실행**

```
PURE_READ_WINDOW = FEEDBACK_DURATION - DEATH_ANIM_DURATION
                = 700ms - 600ms = 100ms
```

| 변수 | 정의 | 값 |
|------|------|-----|
| `DEATH_ANIM_DURATION` | 플레이어 사망 애니메이션 전체 길이 (player-movement 소유) | 600ms |
| `PURE_READ_WINDOW` | 애니메이션 종료 후 오버레이만 남는 순수 읽기 시간 | 100ms |

예시: 사망 애니메이션 t=0~600ms 실행, 오버레이 t=0~700ms 표시 → t=600~700ms 구간이 순수 하이라이트 시간

**F-3. 펄스 애니메이션**

```
PULSE_FREQ = 1.0 Hz
PULSE_PERIOD = 1000ms
PULSE_CYCLES_DURING_OVERLAY = FEEDBACK_DURATION / PULSE_PERIOD = 0.7 cycles

opacity(t) = 0.60 * (0.5 + 0.5 * sin(2π * PULSE_FREQ * t))  →  range [0.0, 0.60]
```

| 변수 | 정의 | 범위 |
|------|------|------|
| `PULSE_FREQ` | `#FF3366` fill opacity 펄스 주파수 | 0.5–2.0 Hz |

예시: t=0ms → opacity=0.60 (최대), t=250ms → opacity=0.30 (중간), t=500ms → opacity=0.60 (최대)

## Edge Cases

**EC-1. killerGateCells 배열이 비어있을 때**

`PLAYER_KILLED` 이벤트의 `killerGateCells`가 빈 배열(`[]`)로 도착하면 오버레이를 트리거하지 않는다. 하이라이트 없이 사망 처리가 계속된다. 이 경우 그리드 폭발 시스템에 `FEEDBACK_MISSING_CAUSE { playerId, timestamp }` 이벤트를 발행하여 upstream에 데이터 오류를 알린다.

**EC-2. 체인 폭발 (연쇄 사망)**

셀 A 폭발 → 플레이어가 셀 B(EX 상태)로 이동 → 셀 B에서 두 번째 `PLAYER_KILLED`가 발행되는 경우: FF-9 교체 규칙에 따라 셀 B의 `killerGateCells`로 오버레이가 교체된다. 최종 사인만 표시한다. (판단 근거: 플레이어에게 가장 마지막으로 "피했어야 할 것"을 보여주는 것이 학습 가치가 높음)

**EC-3. 오버레이 활성 중 라운드 전환**

오버레이가 표시 중인 동안 라운드가 종료되는 경우:
- 오버레이는 즉시 해제되고 IDLE 상태로 전환된다
- `FEEDBACK_DISMISSED { reason: 'ROUND_END' }` 이벤트를 발행한다
- *(라운드 매니저 미설계 — `ROUND_END` 이벤트 계약은 provisional. 라운드 매니저 GDD 설계 시 확정)*

**EC-4. 솔로 모드 vs 멀티플레이어 모드 리스폰 흐름**

오버레이 동작 자체는 동일하다. 차이는 하위 시스템 처리:
- **솔로**: 오버레이 종료 → 플레이어가 즉시 리스폰 준비 상태
- **멀티**: 오버레이 종료 → 라운드 매니저가 리스폰 타이밍을 제어 (오버레이는 그 결정에 관여하지 않음)
- 이 시스템은 모드를 구분하지 않는다. 모드 분기 로직은 라운드 매니저 책임.

**EC-5. 탭-투-스킵 후 조이스틱 입력**

탭-투-스킵으로 오버레이가 해제된 직후, 플레이어가 이미 조이스틱을 잡고 있는 경우:
- DISMISSING 처리 완료(조이스틱 차단 해제) 이후의 조이스틱 이벤트만 이동 시스템에 전달된다
- 탭 이벤트는 이 시스템이 소비하므로 이동 명령으로 해석되지 않는다

**EC-6. globalT 리셋 없음 — 오버레이 중 게이트 사이클 계속**

오버레이 활성 중에도 그리드 폭발 시스템의 `globalT`는 계속 진행된다. 플레이어가 오버레이를 보는 동안 게이트 상태가 IDLE→EX로 전환될 수 있다. 이 시스템은 그 전환을 무시한다 — 표시 중인 오버레이는 `killerGateCells`에 고정되어 있으며 현재 게이트 상태를 실시간으로 반영하지 않는다.

## Dependencies

### 업스트림 (이 시스템이 의존)

| 시스템 | 의존 내용 | 계약 상태 |
|--------|----------|----------|
| **그리드 폭발** (#6) | `PLAYER_KILLED { playerId, killerGateCells: CellCoord[], killerGateId, timestamp }` 이벤트 발행. `killerGateCells`에 EX 셀 좌표 포함(`CellCoord = {row: 0-7, col: 0-7}`). fair-feedback은 읽기 전용 — 상태 전이에 관여 없음. | ✅ 확정 (grid-explosion.md) |
| **플레이어 이동** (#7) | `PLAYER_KILLED` 이벤트 공동 발행. `DEATH_ANIM_DURATION = 600ms` (F-2 참조). Dead 상태 중 이동 잠금 보장 — 오버레이의 조이스틱 차단과 이중 보호. | ✅ 확정 (player-movement.md) |
| **터치 입력 시스템** | 탭 이벤트 스트림. 오버레이 활성 중 탭 이벤트를 이 시스템이 먼저 소비할 수 있도록 입력 우선순위 보장 필요. | ⚠️ Provisional (입력 시스템 미설계) |

### 다운스트림 (이 시스템에 의존)

| 시스템 | 의존 내용 | 계약 상태 |
|--------|----------|----------|
| **HUD** (#14) | `FEEDBACK_SHOWN`, `FEEDBACK_DISMISSED` 이벤트 수신. HUD가 사망/피드백 상태를 표시하는 데 사용. | ⚠️ Provisional (HUD 미설계) |
| **오디오 시스템** | `AUDIO_EVENT(FEEDBACK_START, killerGateId)`, `AUDIO_EVENT(FEEDBACK_END, killerGateId)` 수신. 피드백 사운드 큐 트리거. | ⚠️ Provisional (오디오 시스템 미설계) |
| **라운드 매니저** (신규) | `ROUND_END` 이벤트를 보내 오버레이를 조기 해제시킴 (EC-3). 리스폰 타이밍 제어는 라운드 매니저 책임. | ⚠️ Provisional (라운드 매니저 미설계) |

### 양방향 등록 메모

- **grid-explosion.md**: fair-feedback이 `PLAYER_KILLED` 이벤트를 소비함을 Dependencies 섹션에 명시 필요 *(기등록 확인 필요)*
- **player-movement.md**: fair-feedback이 `DEATH_ANIM_DURATION` 값에 의존함을 명시 필요 *(기등록 확인 필요)*

## Tuning Knobs

| 변수 | 기본값 | 안전 범위 | 영향 |
|------|--------|----------|------|
| `FEEDBACK_DURATION` | 700ms | 500–1200ms | 낮추면 Pillar 2(세션 밀도) 향상, 높이면 Pillar 4(학습 명확성) 향상. 500ms 미만은 변화맹(change blindness) 위험 구간. 1200ms 초과 시 패널티처럼 느껴짐. |
| `PULSE_FREQ` | 1.0 Hz | 0.5–2.0 Hz | 낮추면 차분한 확인 느낌, 높이면 긴박감/경고 느낌. 2.0Hz 초과 시 깜박임 불편함 유발 가능. |
| `HIGHLIGHT_OPACITY` | 0.60 (60%) | 0.40–0.80 | 낮추면 덜 방해적, 높이면 더 명확. 0.40 미만은 배경과 구분 어려움. 0.80 초과 시 Exploded 셀 시각이 완전히 가려짐. |
| `TAP_TO_SKIP_ENABLED` | `true` | `true` / `false` | 플레이테스트에서 반사적 스킵이 학습 방해한다고 판명되면 `false`로 전환. A/B 테스트 후보. |

## Visual/Audio Requirements

### 비주얼

**오버레이 레이어 순서** (위에서 아래):
1. HUD (최상위)
2. **공정 피드백 오버레이** ← 이 시스템
3. 그리드 폭발 렌더링 (Exploded dim `#3A1A1A`)
4. 그리드 배경 (Void Black `#1A1A2E`)

**킬러 게이트 셀 렌더링**:

| 속성 | 값 | 비고 |
|------|-----|------|
| Fill 색상 | Death Rose `#FF3366` | 아트 바이블 확정 색상 |
| Fill opacity | 60% (0.60), 1.0Hz 펄스 | F-3 수식 참조 |
| Outline 색상 | `#FF3366` | Fill과 동일 |
| Outline 두께 | 3px solid | 경로 라인과 동일 두께 |
| 렌더링 방식 | Graphics 코드-드리븐 오버레이 | 스프라이트 없음 (아트 바이블 원칙) |

**IDLE 상태**: 화면에 추가 렌더링 없음.

**HIGHLIGHT_ACTIVE 진입 시**: 즉각적인 표시 — 페이드인 없음. 인식 지연 최소화를 위해 t=0에 full opacity로 시작.

**DISMISSING 시**: 즉각적인 소거 — 페이드아웃 없음. 깔끔한 종료.

### 오디오

| 이벤트 | 트리거 | 사운드 설명 | 우선순위 |
|--------|--------|-----------|---------|
| `AUDIO_EVENT(FEEDBACK_START)` | IDLE → HIGHLIGHT_ACTIVE | 짧은 단음 확인 톤 (200ms 이하). "납득"의 소리 — 경보가 아닌 인지 확인. 차가운 금속성 핑. | BLOCKING |
| `AUDIO_EVENT(FEEDBACK_END)` | HIGHLIGHT_ACTIVE → DISMISSING | 없음 (silence). 오버레이 종료는 오디오 없이 자연 소멸. | — |

*오디오 사운드 최종 스펙은 Sound Designer 위임 예정. 위 설명은 방향성 기준.*

## UI Requirements

이 시스템의 주요 출력은 그리드 위 렌더링 오버레이다 — 전통적인 스크린-스페이스 UI 컴포넌트는 없다.

| 항목 | 요건 | 비고 |
|------|------|------|
| 텍스트 레이블 | 없음 | 하이라이트 비주얼만으로 원인 전달. 텍스트 추가 시 Pillar 2 밀도 위반. |
| HUD 간섭 | 없음 | 오버레이는 그리드 레이어에 합성. HUD 요소(라운드 카운터 등)는 최상위 레이어 유지. |
| 반응형 레이아웃 | 그리드 셀 좌표 기반 | 화면 해상도/비율 변화 시 그리드와 함께 자동 스케일. 절대 픽셀 좌표 하드코딩 금지. |
| 접근성 | 색상 외 보조 단서 | `#FF3366` 단독 의존 금지. 아웃라인 3px + 펄스 애니메이션이 보조 단서 역할. |
| 터치 영역 | 전체 화면 탭-투-스킵 | 탭 가능 영역은 전체 화면. 별도 버튼 UI 없음. |

## Acceptance Criteria

#### BLOCKING (자동화)

| ID | 조건 | 검증 방법 |
|----|------|----------|
| AC-FF-01 | `PLAYER_KILLED` 이벤트 수신 후 1프레임(16ms) 이내에 오버레이가 트리거된다 | 이벤트 타임스탬프 vs 렌더링 콜백 타임스탬프 비교 |
| AC-FF-02 | `killerGateCells[]`에 포함된 셀만 `#FF3366` 오버레이로 렌더링된다 (그 외 셀 변경 없음) | 렌더링 레이어 상태 덤프 검증 |
| AC-FF-03 | 오버레이는 `PLAYER_KILLED` 수신 후 700ms ± 50ms에 자동 해제된다 | 타이머 단위 테스트 |
| AC-FF-04 | 오버레이 활성 중 탭 이벤트가 수신되면 700ms 이전에 해제된다 | 탭 시뮬레이션 테스트 |
| AC-FF-05 | 오버레이 활성 중 조이스틱 방향 이벤트가 이동 시스템에 전달되지 않는다 | 입력 이벤트 스파이 테스트 |
| AC-FF-06 | 탭-투-스킵 탭 이벤트가 이동 명령으로 해석되지 않는다 (플레이어 위치 불변) | 플레이어 좌표 검증 |
| AC-FF-07 | 오버레이 활성 중 새 `PLAYER_KILLED` 수신 시 기존 오버레이가 즉시 교체된다 | 빠른 연속 사망 시뮬레이션 |
| AC-FF-08 | 원격 플레이어의 `PLAYER_KILLED` 이벤트는 로컬 오버레이를 트리거하지 않는다 | 멀티플레이어 이벤트 라우팅 테스트 |
| AC-FF-09 | `FEEDBACK_SHOWN { playerId, killerGateCells, timestamp }` 이벤트가 트리거 시 발행된다 | 이벤트 버스 구독 검증 |
| AC-FF-10 | `FEEDBACK_DISMISSED { reason }` 이벤트가 해제 시 발행되며 `reason`이 `'DURATION'`, `'TAP'`, `'REPLACED'` 중 하나다 | 이벤트 페이로드 검증 |
| AC-FF-11 | `killerGateCells`가 빈 배열일 때 오버레이가 트리거되지 않고 `FEEDBACK_MISSING_CAUSE` 이벤트가 발행된다 | 빈 배열 엣지케이스 테스트 |

#### ADVISORY (수동)

| ID | 조건 | 검증 방법 |
|----|------|----------|
| AC-FF-12 | Death Rose `#FF3366` 오버레이가 Exploded dim `#3A1A1A` 배경 위에서 시각적으로 명확히 구분된다 | 실기기 시각 확인 |
| AC-FF-13 | 펄스 애니메이션이 700ms 동안 육안으로 확인 가능하다 | 실기기 시각 확인 |
| AC-FF-14 | 플레이테스트 참여자 80% 이상이 "왜 죽었는지 즉시 이해했다"고 응답한다 | 플레이테스트 설문 |
| AC-FF-15 | `AUDIO_EVENT(FEEDBACK_START)` 사운드가 오버레이 진입과 동시에 재생된다 | 오디오 시스템 연동 후 청각 확인 |

## Open Questions

| ID | 질문 | 우선순위 | 해소 방법 |
|----|------|---------|----------|
| OQ-FF-1 | `FEEDBACK_DURATION=700ms` 이 실기기에서 충분한가? `PURE_READ_WINDOW=100ms`가 너무 짧을 수 있음 | HIGH | 플레이테스트에서 AC-FF-14(80% 이해율) 달성 여부로 판단. 미달 시 `FEEDBACK_DURATION` 900ms로 상향 |
| OQ-FF-2 | 탭-투-스킵이 학습 루프를 방해하는가? (Game Designer 리스크 플래그) | HIGH | A/B 테스트: `TAP_TO_SKIP_ENABLED=true` vs `false` 세션 비교. 재시작율 + 동일 패턴 재사망율 측정 |
| OQ-FF-3 | 체인 폭발(EC-2)에서 "최종 사인만 표시" 원칙이 옳은가? 첫 번째 원인이 더 학습 가치가 높을 수 있음 | MEDIUM | 플레이테스트에서 체인 사망 후 "왜 죽었는지 이해했나?" 별도 측정 |
| OQ-FF-4 | 라운드 종료 시 오버레이 해제 순서 (EC-3 provisional) — 라운드 매니저 GDD 설계 후 확정 필요 | MEDIUM | `/design-system round-manager` 설계 시 `ROUND_END` 이벤트 계약 확정 |
| OQ-FF-5 | 터치 입력 우선순위 — 오버레이 활성 중 탭을 이 시스템이 먼저 소비하는 메커니즘이 Cocos Creator 3.8.x에서 어떻게 구현되는가? | LOW | 구현 단계에서 `Node.on('touchstart', handler, this, true)` 캡처 페이즈 사용 여부 결정 |
