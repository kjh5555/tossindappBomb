# 그리드 폭발 시스템 (Grid Explosion System)

> **Status**: Draft — Updated post-prototype
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-21 (prototype v4 반영 — Warning 단계 제거, 사이클릭 게이트 모델로 변경)
> **Implements Pillar**: 읽으면 이긴다, 공정한 죽음

## Summary

그리드 폭발 시스템(Grid Explosion System)은 GRID REAPER의 핵심 판정 엔진이다. 게이트 셀은 사이클릭 타이머에 따라 Idle → Exploded 두 상태만을 반복하며, 폭발 시 해당 셀 위의 플레이어를 제거한다. 경고 단계 없이 즉각 폭발 — 플레이어는 색상 변화가 아닌 게이트 리듬과 타이밍을 읽어서 생존한다. 이 시스템이 없으면 "읽으면 이긴다"와 "공정한 죽음", 두 핵심 필러는 존재할 수 없다.

> **프로토타입 업데이트 (2026-04-21):** `prototypes/grid-core` v4 플레이테스트 결과, Warning1→Warning2→Imminent 3단계 경고 시퀀스를 제거하고 Idle→Exploded 즉각 전환으로 설계 변경. 근거: 경고 단계는 긴장감이 아닌 지루함을 만든다. 플레이어는 게이트가 언제 안전한지 리듬으로 읽는다.

> **Quick reference** — Layer: `Core` · Priority: `MVP` · Key deps: `패턴 라이브러리`

## Overview

플레이어는 화면 위 경로를 따라 이동하며 한 가지 질문을 반복해서 풀어낸다: "지금 이 게이트가 안전한가?" 게이트 셀은 사이클릭 타이머에 따라 규칙적으로 폭발하며, 경고 색상 없이 갑자기 터지고 빠르게 꺼진다. 플레이어는 색상 변화를 읽는 것이 아니라 게이트의 리듬과 타이밍을 관찰하고 기억하여 통과 타이밍을 판단한다. 플레이어가 죽는다면 그것은 리듬을 읽지 못했거나 진입 타이밍을 놓쳤기 때문이지, 시스템이 불공정했기 때문이 아니다.

기술 구조 측면에서, 이 시스템은 패턴 라이브러리로부터 "이번 라운드에 어떤 셀들이 게이트인가"라는 데이터를 수신하고, 각 게이트 셀의 사이클릭 타이머(Idle ↔ Exploded 2-state)를 구동한다. 폭발 순간(Idle → Exploded 전이)에는 해당 셀 위 플레이어 존재 여부를 즉시 판정하고, 결과를 플레이어 이동 시스템과 라운드 매니저에 브로드캐스트한다. Exploded 상태는 `T_EX` 시간 동안 지속되며, 이 기간 동안 셀은 위험 상태를 유지한다. `T_EX` 경과 시 셀은 다시 Idle로 복귀한다 — 별도의 "위험 존" 연장 구간은 없다.

"공정한 죽음" 필러는 이 시스템의 설계 원칙 그 자체다. 게이트의 주기(GATE_PERIOD)는 고정된 예측 가능한 리듬으로, 플레이어는 몇 번의 관찰만으로 각 게이트의 폭발 시각을 학습할 수 있다. 색상 변화 경고 없이 폭발이 발생하지만, 리듬 자체가 공정한 예고 역할을 수행한다. 플레이어 이동 시스템, 라운드 매니저, 그리고 시각·진동 피드백 시스템은 모두 이 시스템이 브로드캐스트하는 상태 전이 이벤트에 의존한다. 따라서 그리드 폭발 시스템은 게임의 매 라운드를 구성하는 가장 상위의 판정 권한을 가진 시스템이다.

## Player Fantasy

### 핵심 감정

**1. 리듬을 읽는 쾌감 (Rhythm Mastery)**
게이트가 규칙적으로 터지기 시작하면, 플레이어의 눈이 그 박자를 학습한다. "이 게이트는 2초마다 터지고, 지금 막 터졌으니 앞으로 1.65초 동안은 안전하다." 이 리듬 읽기가 맞아떨어져 게이트를 정확한 타이밍에 통과했을 때의 쾌감 — 운이 아니라 내가 박자를 읽어낸 것이라는 확신.

**2. 벼랑 끝 생존감 (Last-Survivor Tension)**
안전한 칸이 한두 칸으로 줄어들수록 긴장감은 극대화된다. 내 옆 플레이어가 죽고, 그 옆도 죽고, 그럼에도 내가 서있는 칸만 살아있을 때 — 두려움이 쾌감으로 전환되는 순간. 여러 게이트가 서로 다른 주기로 폭발하며 만들어내는 파도 속에서, 나만 올바른 순간을 골라 움직인다.

**3. 경쟁적 우월감 (Competitive Clarity)**
6명 중 내가 마지막으로 살아남을 때, 그것은 운이 아니라 실력이라는 것이 분명하다. 같은 리듬을 보고 나만 올바르게 읽었다. 반사 신경이 아니라 인지 능력으로 이긴 것이기 때문에 "나는 이 게임을 이해하고 있다"는 자존감이 생긴다.

### 판타지 문장

> 플레이어는 **혼돈 속에서 리듬을 읽는 사람**이 된다. 모두가 패닉하는 빛의 폭풍 속에서, 나만 차분하게 다음 박자에 발을 내딛는 위치를 알고 있다.

> 플레이어는 **포위망을 빠져나가는 마지막 생존자**가 된다. 불빛이 나를 사방에서 죄어올 때, 단 한 칸의 어둠을 내 것으로 만들고 서있다.

### 순간 포착

**1. 파도 타이밍 통과의 순간**
4개 게이트가 서로 엇갈린 위상으로 터지며 파도를 만든다. 다른 플레이어는 첫 게이트에서 멈칫하지만, 나는 이미 전체 파도의 리듬을 읽고 4개를 연속 통과한다. 각 게이트는 내가 지나간 직후 폭발한다. 결과를 본 뒤에야 내가 얼마나 아슬아슬하게 읽었는지 깨닫는다.

**2. 마지막 둘의 교차 이동**
두 명이 남았다. 상대가 이동한 칸의 게이트가 곧 터질 주기에 있다는 걸 나는 이미 센다. 상대는 그 리듬을 놓쳤다. 폭발음과 동시에 "1 Player Survived" 텍스트가 뜰 때 — 상대가 읽지 못한 것을 나는 읽었다는 사실이 결과로 증명된다.

**3. 멀티 게이트 속 노-데스 생존**
게이트 10개가 동시에 다른 위상으로 터지는 고밀도 라운드. 대부분의 플레이어는 이 리듬의 복잡성에 압도되어 잘못된 타이밍에 움직인다. 나는 각 게이트가 만드는 "안전 복도"의 개방 순간을 파악하고, 연속 이동으로 모든 폭발을 피한다. 어느 순간도 위험하지 않았던 것처럼.

### 안티-판타지

이 시스템이 **절대 만들어서는 안 되는** 느낌:

**"운으로 살아남았다"** — 게이트 주기가 불규칙하거나 위상이 예측 불가능하게 바뀌면 생존이 리듬 학습의 결과가 아니라 위치 운이 된다. 모든 생존에는 리듬 기반의 이유가 있어야 하고, 플레이어가 사후에도 납득할 수 있어야 한다.

**"반사 신경이 부족해서 죽었다"** — `SAFE_WIN`이 충분히 길어 리듬을 읽고 대응할 수 있어야 한다. 모바일 터치 인풋 지연을 고려할 때(F-2), `SAFE_WIN ≥ 0.55s` 제약은 "알았는데 손이 느렸다"는 경험을 구조적으로 차단하는 최저선이다.

**"저 칸이 왜 터졌는지 모르겠다"** — 죽음은 항상 리듬으로 납득 가능해야 한다. "아, 이 게이트가 방금 막 터지는 순간이었구나"는 괜찮다. "주기가 뭐였는지 모르겠다"는 허용 불가다.

**"갈 수 있는 곳이 없다"** — 패턴 설계 실패로 인해 이론상 안전 칸이 `MIN_SAFE_CELLS` 미만이 되는 상황. "읽어도 죽는다"는 경험은 핵심 동기를 완전히 파괴한다. A-7 계약으로 구조적으로 차단한다.

### MDA 분석

- **Challenge** (primary): 점진적으로 복잡해지는 패턴을 읽는 인지적 도전
- **Discovery** (secondary): 라운드마다 새로운 패턴 구조와 안전 경로를 발견하는 재미
- **Fellowship** (tertiary): 같은 그리드에서 다른 플레이어들과 동시에 경쟁하는 긴장의 공유

## Detailed Design

### Core Rules

#### A-1. 그리드 구조

1. 그리드는 8열(column, x축) × 8행(row, y축) = 64셀로 구성된다.
2. 좌표계는 좌상단을 원점 (0, 0)으로 하며, x는 오른쪽 방향, y는 아래쪽 방향으로 증가한다. 좌상단 셀은 (0,0), 우하단 셀은 (7,7)이다.
3. 각 셀은 독립적인 상태 기계(State Machine)를 가진다. 한 셀의 상태 전이는 다른 셀의 상태 전이에 영향을 주지 않는다. (연쇄 트리거 없음)
4. 셀 크기 및 그리드 전체 크기는 Tuning Knobs에 정의된 configurable value로 관리된다. 화면 해상도와 safe area에 따라 런타임에 계산되며, 코드에 하드코딩하지 않는다.
5. 각 셀은 동시에 하나의 상태만 가진다. 중간 상태는 존재하지 않는다.

#### A-2. 게이트 지정 규칙 (Pattern Injection)

1. 라운드 시작 시 패턴 라이브러리가 하나의 패턴을 선택하고, 해당 패턴에 속한 셀 좌표 목록(이하 **게이트 셀 목록**)을 그리드 폭발 시스템에 전달한다.
2. 그리드 폭발 시스템은 게이트 셀 목록을 수신하는 즉시 A-7 안전 칸 계약을 검증하고, 유효 시 각 게이트 셀에 사이클릭 타이머를 할당한다. 각 게이트는 고유한 `offset` 값을 받아 서로 다른 위상으로 동작할 수 있다.
3. 게이트 셀 목록에 포함되지 않은 셀은 Idle 상태를 유지하며 폭발하지 않는다.
4. 한 라운드에서 패턴 라이브러리가 여러 번 게이트 셀 목록을 전달할 수 있다(round-escalation의 `setGatePeriod` 또는 패턴 전환). 이미 게이트로 동작 중인 셀에 대해 새 지정이 수신되면, 해당 셀의 타이머 `offset`은 재할당되지 않고 기존 리듬을 유지한다. 단, 주기(`GATE_PERIOD`) 변경은 즉시 반영된다(setGatePeriod 계약, A-8).

#### A-3. 상태 전이 조건 (Cyclic 2-state)

게이트 셀은 **Idle ↔ Exploded 2상태만** 순환한다. Warning/Imminent 등 중간 단계는 존재하지 않는다.

| 전이 | 조건 |
|------|------|
| Idle → Exploded | 사이클릭 타이머가 `SAFE_WIN = GATE_PERIOD - T_EX` 경과 (안전 창 종료) |
| Exploded → Idle | Exploded 상태 진입 후 `T_EX` 경과 |

모든 전이는 시스템 내부 사이클릭 타이머에 의해 구동된다. 외부 시스템은 상태 전이를 직접 트리거하거나 중단할 수 없다. 타이머는 게임 세션 시작 시 각 게이트별 고유 `offset`으로 초기화되며, 플레이어 사망/재시작 시에도 리셋되지 않는다 — 세계 리듬은 계속 흐른다.

비-게이트 셀(패턴에 포함되지 않은 셀)은 항상 Idle을 유지하며 상태 전이가 발생하지 않는다.

#### A-4. 폭발 판정 규칙

1. 폭발 판정은 게이트 셀이 Idle → Exploded 전이하는 순간에 단 1회 발생한다.
2. **처리 순서는 이동 처리 → 폭발 판정**이다. 같은 타임스텝에 이동 입력이 있으면 이동을 먼저 처리한 후 폭발 판정을 수행한다. 따라서 곧 폭발할 게이트 셀에서 같은 타임스텝 내에 이동 입력하면 탈출이 성공한다. 이것은 "읽으면 이긴다" 필러의 의도된 구현이다.
3. 판정 시점에 해당 셀의 좌표에 위치한 모든 플레이어는 즉시 사망 처리된다.
4. 폭발 판정 이후 해당 셀은 `T_EX` 시간 동안 Exploded 상태를 유지한다. 이 기간 중 셀에 진입하는 플레이어는 착지 즉시 사망 처리된다(A-5).
5. 복수의 셀이 같은 타임스텝에 Exploded 전이를 맞이할 경우, 각 셀의 판정은 독립적으로 수행된다. 이미 사망 상태인 플레이어는 판정 대상에서 제외된다.

#### A-5. Exploded 상태 규칙 (Hazard Window)

1. 셀이 Exploded 상태인 동안(`T_EX` 지속), 셀은 **지속 위험 상태**이다. 별도의 "위험 존" 연장 구간은 없다 — Cyclic v4 모델에서 Exploded 자체가 위험 구간이다.
2. Exploded 상태의 셀로 이동 입력은 차단되지 않는다. 플레이어가 해당 셀에 착지하면 즉시 사망 처리된다(`cause = DANGER_ZONE`). 사전 차단 없음, 결과 기반 판정.
3. Exploded 상태의 셀은 시각적으로 Exploded 비주얼을 유지하여 플레이어에게 위험을 알린다.
4. `T_EX` 경과 시 셀은 Idle 상태로 자동 복귀한다. 복귀 순간 해당 셀 위의 플레이어는 생존한다(폭발 판정 미발생).
5. 셀이 Idle로 복귀하는 순간부터 다음 안전 창(`SAFE_WIN`)이 시작된다. 사이클은 `setGatePeriod`가 호출되지 않는 한 영원히 반복된다.

#### A-6. 동시 폭발 처리

1. 복수의 게이트 셀이 같은 타임스텝에 Idle → Exploded 전이를 맞이하는 것은 정상 동작이다(파도 위상이 겹칠 때).
2. 각 셀의 폭발 판정은 독립적으로 수행된다. 처리 순서에 의한 결과 차이가 없어야 한다.
3. 동시 폭발로 인해 같은 타임스텝에 복수의 플레이어가 사망 처리될 수 있다.

#### A-7. 안전 칸 보장 규칙 (패턴 라이브러리 계약)

이 규칙은 패턴 라이브러리가 준수해야 하는 계약이다. 그리드 폭발 시스템은 수신 시점에 계약 이행 여부를 검증하고, 위반 시 패턴을 거부한다.

1. 전달된 게이트 셀 목록이 적용된 후 전체 64셀 중 최소 `MIN_SAFE_CELLS`개의 셀이 비-게이트(항상 Idle) 상태를 유지해야 한다.
2. `MIN_SAFE_CELLS` 값은 `design/registry/entities.yaml`의 상수를 참조 (기본값 8, 전체의 12.5%).
3. 안전 칸들은 서로 단일 이동으로 접근 가능한 연결성(connectivity)을 만족해야 한다. 연결성 검증은 패턴 라이브러리의 빌드 타임 책임이며, 런타임에서는 `bfsVerified: true` 플래그만 확인한다.
4. 계약 위반 패턴 수신 시 그리드 폭발 시스템은 해당 패턴 실행을 거부하고 라운드 매니저에 `PATTERN_REJECTED` 이벤트를 발행한다.

#### A-8. setGatePeriod API (라운드 에스컬레이션 계약)

round-escalation 시스템은 라운드마다 `GATE_PERIOD`를 동적으로 조정할 수 있다. 이 API는 그리드 폭발 시스템의 공개 계약이다.

1. **Signature**: `setGatePeriod(seconds: number): void`
2. **유효 범위**: `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` = `[1.4, 2.0]`초 (`design/registry/entities.yaml` 참조). 범위 외 값은 거부되며 경고 로그를 남긴다.
3. **적용 시점**: 호출 즉시 모든 게이트 셀의 주기 변경. 각 게이트의 `offset`은 유지되어 리듬 연속성이 보장된다.
4. **호출 주체**: round-escalation만 호출 가능. 다른 시스템의 호출은 무시된다.
5. **`T_EX` 동기화**: `GATE_PERIOD` 변경 시에도 `T_EX`는 고정(0.35s). 따라서 `SAFE_WIN = GATE_PERIOD - T_EX` 값만 자동 재계산된다.

---

### States and Transitions

Cyclic v4 모델: 게이트 셀은 Idle ↔ Exploded 두 상태만 순환한다. 비-게이트 셀은 항상 Idle이며 상태 전이가 발생하지 않는다.

#### 상태: Idle (게이트 셀)

| 항목 | 내용 |
|------|------|
| **진입 조건** | 게임 시작 시 (초기 상태) / Exploded에서 `T_EX` 경과 |
| **종료 조건** | 사이클릭 타이머가 `SAFE_WIN` 경과 → Exploded 전이 |
| **지속 시간** | `SAFE_WIN = GATE_PERIOD - T_EX` (확정값: 1.65초) |
| **진입 시 이벤트** | `CELL_STATE_CHANGED(cellId, IDLE)` 브로드캐스트 / 렌더 업데이트: Gate Idle 비주얼 (경로 셀 `#0D3050`) |
| **플레이어 진입** | 허용. 안전 상태. |

#### 상태: Idle (비-게이트 셀)

| 항목 | 내용 |
|------|------|
| **진입 조건** | 게임 시작 시 (초기 상태). 영구 유지 |
| **종료 조건** | 없음. 상태 전이 발생하지 않음 |
| **진입 시 이벤트** | `CELL_STATE_CHANGED(cellId, IDLE)` 라운드 시작 시 1회 발행 / 렌더 업데이트: Void Black `#1A1A2E` |
| **플레이어 진입** | 허용. 영구 안전 (단, 경로 규칙은 player-movement 책임) |

#### 상태: Exploded (게이트 셀만)

| 항목 | 내용 |
|------|------|
| **진입 조건** | 게이트 셀 사이클릭 타이머가 `SAFE_WIN` 경과 |
| **종료 조건** | 진입 후 `T_EX` 경과 → Idle 자동 복귀 |
| **지속 시간** | `T_EX` (확정값: 0.35초) |
| **진입 시 이벤트** | **폭발 판정**: 해당 셀 위 플레이어에 `PLAYER_KILLED(playerIds[], cellId, EXPLOSION)` / `CELL_STATE_CHANGED(cellId, EXPLODED, timestamp)` 브로드캐스트 / `CELL_EXPLODED(cellId, killedPlayerIds[])` → 라운드 매니저 / 렌더: Danger Cyan `#00E5CC` flash 0.1s → `#3A1A1A` dim 유지 / `AUDIO_EVENT(EXPLOSION, cellId)` |
| **상태 유지 중** | 착지 감지 시 `PLAYER_KILLED(playerIds[], cellId, DANGER_ZONE)` |
| **플레이어 진입** | 착지 즉시 사망. 이동 입력 자체는 차단되지 않음. |

---

### Interactions with Other Systems

#### 패턴 라이브러리 → 그리드 폭발 시스템 (upstream input)

| 전달 내용 | 전달 시점 | 응답 |
|-----------|----------|------|
| `ExplodePattern { cells: CellCoord[], patternId: string, bfsVerified: boolean }` | 라운드 시작 후 패턴 선택 즉시 | A-7 계약 검증 → 유효 시 게이트 타이머 할당 / 무효 시 `PATTERN_REJECTED` 발행 |

그리드 폭발 시스템은 패턴의 의도(모양, 선택 이유)를 알지 못하며 알 필요도 없다. `CellCoord = {row: 0-7, col: 0-7}` (registry 참조).

#### round-escalation → 그리드 폭발 시스템 (upstream control)

| 전달 내용 | 전달 시점 | 응답 |
|-----------|----------|------|
| `setGatePeriod(seconds: number)` 호출 | 각 라운드 시작 시 | 유효 범위 `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` 검증 후 적용, 범위 외 시 거부 + 경고 로그 |

#### 그리드 폭발 시스템 → 플레이어 이동 시스템 (downstream)

| 전달 내용 | 전달 시점 |
|-----------|----------|
| `CELL_STATE_CHANGED(cellId, newState, timestamp)` | Idle ↔ Exploded 전이 발생 시 즉시 |
| `PLAYER_KILLED(playerIds: PlayerId[], cellId, cause)` | 폭발/착지 판정 발생 시 즉시. 동시 사망자는 배열로 묶임 |

플레이어 이동 시스템은 `CELL_STATE_CHANGED`를 구독하여 이동 가능 여부 판단에 활용한다. 그리드 폭발 시스템은 이동 요청을 직접 차단하지 않는다.

#### 그리드 폭발 시스템 → 라운드 매니저 (downstream)

| 전달 내용 | 전달 시점 |
|-----------|----------|
| `CELL_EXPLODED(cellId, killedPlayerIds[])` | Idle → Exploded 전이 시 즉시 |
| `PATTERN_REJECTED(patternId)` | 계약 위반 패턴 수신 시 즉시 |
| `GRID_STALLED` | `PATTERN_TIMEOUT`(3.0s) 초과 시 즉시 |

라운드 매니저는 `CELL_EXPLODED`를 누적하여 생존자 수를 추적하고 라운드 종료 조건을 판단한다.

#### 그리드 폭발 시스템 → 공정 피드백 시스템 (downstream)

| 전달 내용 | 전달 시점 |
|-----------|----------|
| `CELL_STATE_CHANGED(cellId, newState, timestamp)` | Idle ↔ Exploded 전이 발생 시 즉시 |
| `PLAYER_KILLED(playerIds: PlayerId[], cellId, cause)` | 사망 판정 발생 시 즉시 |

공정 피드백 시스템은 읽기 전용으로 소비하며, 그리드 폭발 시스템의 상태 전이에 영향을 줄 수 없다. 사망 overlay는 `killerGateCells` 배열로 동시 폭발 여러 셀을 표현할 수 있다.

#### 공개 조회 API (pull 방식)

| API | 반환 | 용도 |
|-----|------|------|
| `getCellState(cell: CellCoord): CellState` | `IDLE` \| `EXPLODED` \| `NON_GATE` | 현재 상태 조회 |
| `nextExplosionTime(cell: CellCoord): number \| null` | 다음 폭발까지 남은 초, 비-게이트 셀이면 `null` | round-manager가 Goal Cell 프리뷰에 사용 |
| `getGatePeriod(): number` | 현재 `GATE_PERIOD` 값 | 디버그/HUD |

#### 그리드 폭발 시스템 → 오디오 시스템 (fire-and-forget)

| 전달 내용 | 전달 시점 |
|-----------|----------|
| `AUDIO_EVENT(EXPLOSION, cellId)` | Idle → Exploded 전이 시 즉시 |
| `AUDIO_EVENT(GATE_SAFE, cellId)` | Exploded → Idle 전이 시 즉시 (선택적) |

그리드 폭발 시스템은 어떤 오디오가 재생되는지 알지 못한다. 오디오 미수신 시에도 동작에 영향 없다.

## Formulas

> 모든 시간 단위는 **초(s)**. 프레임 단위 환산: `t_frames = t_s × 60` (60fps 기준).

### F-1. 게이트 사이클 (Gate Cycle)

```
SAFE_WIN = GATE_PERIOD - T_EX
phase(t) = ((t + offset) mod GATE_PERIOD + GATE_PERIOD) mod GATE_PERIOD
state = IDLE      if phase(t) < SAFE_WIN
state = EXPLODED  otherwise
```

| 기호 | 타입 | 범위 | 설명 |
|------|------|------|------|
| `GATE_PERIOD` | float | 1.5 – 4.0 s | 게이트 한 사이클 총 길이 |
| `T_EX` | float | 0.2 – 0.8 s | 폭발(Exploded) 지속 시간 |
| `SAFE_WIN` | float | `GATE_PERIOD - T_EX` | 플레이어가 통과 가능한 안전 창 길이 |
| `offset` | float | 0 – `GATE_PERIOD` | 게이트별 위상 오프셋. 복수 게이트 간 파도 타이밍 제어 |
| `phase(t)` | float | 0 – `GATE_PERIOD` | 현재 시각 t에서 게이트의 사이클 내 위치 |

**확정값 (prototypes/grid-core v4):** `GATE_PERIOD = 2.0 s`, `T_EX = 0.35 s`, `SAFE_WIN = 1.65 s`

**파도 stagger 예시 (게이트 4개):**
```
G1 offset=2.3  → 안전 창 시작 t≈0.7s
G2 offset=1.8  → 안전 창 시작 t≈1.2s
G3 offset=1.3  → 안전 창 시작 t≈1.7s
G4 offset=0.8  → 안전 창 시작 t≈2.2s
0.5s 간격 파도 — 플레이어가 게이트를 연속으로 통과하는 리듬 생성
```

---

### F-2. 최소 통과 가능 안전 창

```
SAFE_WIN ≥ T_input_latency + T_move_tween + T_margin
```

| 기호 | 타입 | 범위 | 설명 |
|------|------|------|------|
| `T_input_latency` | float | 0.1 – 0.15 s | 모바일 조이스틱 입력 왕복 지연 |
| `T_move_tween` | float | 0.1 s | 이동 트윈 완료 시간 |
| `T_margin` | float | 0.2 – 0.3 s | 반응 여유 시간 |
| 최소 `SAFE_WIN` | float | 0.4 – 0.55 s | 실질적 통과 가능 하한 |

**확정값 기준:** `SAFE_WIN = 1.65 s ≥ 0.55 s` → 제약 충족. 여유 1.1 s.

---

### F-3. 폭발 시퀀스 총 길이 (Full Explosion Cycle Duration)

```
T_cycle = GATE_PERIOD
```

게이트 셀은 사이클릭으로 동작하므로 생애 주기 = 한 사이클.

| 기호 | 타입 | 범위 | 설명 |
|------|------|------|------|
| `GATE_PERIOD` | float | 1.5 – 4.0 s | 게이트 한 사이클 (= 안전 창 + 폭발 지속) |
| `T_EX` | float | 0.2 – 0.8 s | 폭발 지속 (Exploded 상태 유지 시간) |

**확정값:** `T_cycle = 2.0 s` (= `SAFE_WIN 1.65 s` + `T_EX 0.35 s`)

**예시 계산:**
```
T_cycle = 2.0 s (= 120 frames @ 60fps)
Exploded 구간: 0.35 s (= 21 frames)
Idle 구간: 1.65 s (= 99 frames)
```

---

### F-4. 동시 위험 셀 최대 허용 비율

```
N_hazard_max = GRID_TOTAL - MIN_SAFE_CELLS
R_hazard_max = (GRID_TOTAL - MIN_SAFE_CELLS) / GRID_TOTAL
```

| 기호 | 타입 | 범위 | 설명 |
|------|------|------|------|
| `GRID_TOTAL` | int | 64 (고정) | 그리드 전체 셀 수 (8×8) |
| `MIN_SAFE_CELLS` | int | 4 – 16 | 보장되는 최소 안전(Idle) 셀 수. 기본값 8 |
| `N_hazard_max` | int | 48 – 60 | 동시 위험 상태 셀의 최대 허용 개수 |
| `R_hazard_max` | float | 0.75 – 0.9375 | 동시 위험 셀 비율 상한 |

**예시 계산 (`MIN_SAFE_CELLS = 8`):**
```
N_hazard_max = 64 - 8 = 56셀
R_hazard_max = 56 / 64 = 0.875 (87.5%)
```

---

### F-5. 안전 칸 연결성 검증 (Safe Cell Connectivity)

4-방향 인접 정의:
```
adjacent(A, B) = (|x₁ - x₂| + |y₁ - y₂|) == 1
```

연결 집합 조건:
```
S = { 모든 Idle 상태 셀의 집합 }
|S| ≥ MIN_SAFE_CELLS

connected(S) = True  iff
    BFS(seed=any s ∈ S, edges=adjacent) visits all cells in S
```

| 기호 | 타입 | 설명 |
|------|------|------|
| `S` | set\<Cell\> | 패턴 적용 후 Idle 상태 셀의 집합 |
| `adjacent(A, B)` | bool | 두 셀의 맨해튼 거리 = 1 여부 (대각선 제외) |
| `connected(S)` | bool | S가 단일 연결 성분 여부 |

**검증 복잡도:** O(|S|), 최악 O(64). 패턴 발동 전 1회 실행.

**출력:** `connected(S) == true AND |S| ≥ MIN_SAFE_CELLS` → 패턴 유효. 그 외 → `PATTERN_REJECTED`.

> **주의:** 플레이어 이동 시스템이 8-방향(대각선 포함)으로 확정되면 `adjacent` 정의를 맨해튼 거리 ≤ √2로 수정해야 한다.

---

### 수식 요약표

| 수식 | 결과 | 확정값 기준 |
|------|------|------------|
| F-1 `SAFE_WIN` | 1.65 s | `GATE_PERIOD(2.0) - T_EX(0.35)` |
| F-2 최소 `SAFE_WIN` | ≥ 0.55 s | 조이스틱 입력 지연 + 트윈 + 여유 |
| F-3 `T_cycle` | 2.0 s | `GATE_PERIOD` |
| F-4 `N_hazard_max` | 56셀 | `64 - MIN_SAFE_CELLS(8)` |
| F-5 `connected(S)` | bool | BFS O(64) |

## Edge Cases

### EC-1. 복수 플레이어 동일 셀 동시 사망

**상황** 같은 셀에 2명 이상의 플레이어가 위치한 상태에서 해당 게이트 셀이 Idle → Exploded 전이.

**처리** 폭발 판정은 셀 단위로 1회 수행된다. 판정 시점에 해당 셀에 위치한 모든 플레이어에 `PLAYER_KILLED(playerIds[], cellId, EXPLOSION)` 이벤트를 발행하며, `playerIds`는 동시 사망한 전원의 ID 배열이다. 처리 순서는 결과에 영향을 주지 않아야 한다 — "먼저 처리된 플레이어가 더 불리하거나 유리한" 상황은 구조적으로 불가능해야 한다. `CELL_EXPLODED(cellId, killedPlayerIds[])` 이벤트에는 사망한 전원의 ID가 배열로 포함된다.

**이유** "공정한 죽음" 필러: 같은 타임스텝에 사망한 플레이어들은 처리 순서에 무관하게 동등하게 처리되어야 한다.

---

### EC-2. 이동 입력과 폭발이 같은 타임스텝에 충돌

**상황** 플레이어가 곧 폭발할 게이트 셀 위에 있고, 같은 타임스텝에 이동 입력이 도달함과 동시에 해당 셀의 Idle → Exploded 전이가 발생한다.

**처리** 처리 순서는 **이동 처리 → 폭발 판정** 고정(A-4-2). 타임스텝 내 순서:
1. 이동 입력 수신 및 목적지 셀 결정
2. 플레이어 위치 갱신 (원점 셀 → 목적지 셀)
3. 게이트 셀의 Exploded 전이 및 폭발 판정 (플레이어는 이미 이동 완료) → 생존
4. 이동 목적지가 Exploded 상태라면 목적지에서 착지 판정 별도 수행 → 사망(`cause = DANGER_ZONE`)

**이유** "읽으면 이긴다" 필러의 의도된 구현. 리듬을 읽고 이동 입력을 제공한 행동은 생존으로 보상받아야 한다. "알고 입력했는데 죽었다"는 경험을 구조적으로 제거한다.

---

### EC-3. 마지막 생존자가 있는 셀이 폭발

**상황** 생존 플레이어 1명뿐인 상태에서 해당 플레이어가 이동 입력 없이 Idle → Exploded 전이를 맞이한다.

**처리** 표준 폭발 판정과 동일하게 처리한다. `PLAYER_KILLED` 이벤트 발행 후 `CELL_EXPLODED(cellId, [playerId])` 이벤트를 수신한 라운드 매니저가 생존자 수 = 0을 감지하고 게임 종료를 결정한다. 그리드 폭발 시스템은 "마지막 생존자"라는 개념을 알지 못하며, 라운드 매니저로부터 `ROUND_END` 신호를 수신하기 전까지 진행 중인 모든 게이트 셀의 사이클릭 타이머를 계속 구동한다.

**이유** 단일 책임 원칙: 생존자 수 추적과 게임 종료 조건 판단은 라운드 매니저의 도메인이다.

---

### EC-4. 한 타임스텝에 모든 생존 플레이어 동시 사망

**상황** 동시 폭발(A-6)로 인해 같은 타임스텝에 모든 생존 플레이어가 사망 처리된다.

**처리** 그리드 폭발 시스템은 각 셀의 폭발 판정을 독립적으로 수행하고 `CELL_EXPLODED` 이벤트를 모두 발행한다. 전원 동시 사망 여부를 이 시스템이 감지하거나 특별 처리하지 않는다. 라운드 매니저가 해당 타임스텝의 모든 `CELL_EXPLODED` 이벤트를 누적한 후 생존자 수 = 0을 감지하고 `ROUND_END(NO_SURVIVOR)` 처리를 결정한다.

**이유** 전원 동시 사망은 드문 케이스이지만 구조적으로 가능하다. 처리 불명확성을 남기면 "마지막 1명이 살아남은 것처럼" 잘못 판정될 수 있다.

---

### EC-5. Exploded 상태 게이트 셀에 setGatePeriod 호출

**상황** round-escalation이 `setGatePeriod`를 호출하는 시점에 일부 게이트 셀이 Exploded 상태이다.

**처리**
1. `GATE_PERIOD` 변경은 즉시 모든 게이트에 반영된다.
2. 현재 Exploded 상태인 셀의 잔여 `T_EX` 타이머는 리셋되지 않는다 — `T_EX`는 `GATE_PERIOD`와 독립이며 고정(0.35s).
3. 현재 Idle 상태인 셀은 새 `SAFE_WIN = GATE_PERIOD_new - T_EX` 기준으로 타이머가 재계산된다. 각 게이트의 `offset`(위상)은 유지되어 리듬 연속성이 보장된다.
4. `CELL_STATE_CHANGED` 이벤트는 주기 변경만으로는 발행되지 않는다 — 실제 상태 전이 시에만 발행.

**이유** 라운드 에스컬레이션 중에도 현재 폭발 중인 셀의 판정은 일관되어야 한다. `T_EX`를 `GATE_PERIOD`와 독립시켜 압축 시에도 폭발 임팩트(0.35s)는 보존한다.

---

### EC-6. PATTERN_REJECTED 후 재시도 연속 실패

**상황** `PATTERN_REJECTED` 발행 후 라운드 매니저가 대체 패턴을 요청했으나 해당 패턴도 계약 검증에서 실패한다.

**처리** 그리드 폭발 시스템의 책임은 `PATTERN_REJECTED` 이벤트 발행까지다. 재시도 횟수 카운팅 및 폴백 전략은 라운드 매니저의 책임이다. 그리드 폭발 시스템은 라운드 매니저로부터 어떤 응답도 없이 `PATTERN_TIMEOUT`(권장 3.0 s) 이상 대기 상태가 지속되면 `GRID_STALLED` 이벤트를 발행한다.

**이유** "5분의 밀도" 필러: 무한 대기 상태는 세션 밀도를 완전히 파괴한다. 이 시스템은 패턴 선택 로직을 모르고 알아서도 안 되므로 대기 한계 초과 신호 발행까지만 책임진다.

---

### EC-7. 그리드 경계 외부로의 이동 시도

**상황** 플레이어가 그리드 경계 셀(예: (0,y))에서 경계 바깥쪽(x = -1)으로의 이동 입력을 제공한다.

**처리** 이 케이스는 플레이어 이동 시스템의 책임이다. 이동 시스템은 목적지 좌표의 유효성을 검증하고 경계 밖 이동 요청을 거부한다. 그리드 폭발 시스템은 `CellCoord`가 항상 `0 ≤ x ≤ 7, 0 ≤ y ≤ 7` 범위라고 가정하며, 범위 외 좌표에 대한 요청을 무시하고 경고 로그를 발행한다.

**이유** 단일 책임 원칙: 이동 가능 범위 결정은 이동 시스템의 도메인이다. 방어적으로 범위 외 좌표에 대한 경고 로그를 남겨 개발 중 실수를 조기 포착한다.

---

### EC-8. 네트워크 지연 중 셀 상태 불일치 (멀티플레이어)

**상황** 클라이언트가 표시하는 셀 상태와 서버의 실제 셀 상태가 네트워크 지연으로 불일치한다. 예: 클라이언트에서는 아직 Idle로 보이는 게이트 셀이 서버에서는 이미 Exploded인 경우.

**처리** 그리드 폭발 시스템의 책임은 서버 측 사이클릭 타이머의 권위 있는 구동까지다. 클라이언트-서버 동기화 보정은 네트워크/동기화 시스템의 책임이다.

이 시스템이 네트워크 계층에 제공하는 계약:
- 모든 상태 전이 이벤트에 타임스탬프 포함: `CELL_STATE_CHANGED(cellId, newState, timestamp)`
- 폭발 판정은 서버 상태 기계 기준으로만 수행 (server-authoritative)
- 클라이언트 예측과 서버 판정이 다를 경우 서버 판정이 최종
- 서버는 각 게이트의 `offset`과 `GATE_PERIOD`를 초기 매치 시작 시 브로드캐스트하여 클라이언트가 시뮬레이션만으로 리듬을 재구성할 수 있게 한다 (이벤트 동기화 대신 시계 동기화 방식).

네트워크 시스템은 `RTT × 2`가 `SAFE_WIN`(1.65s) 의 일정 비율 이내임을 보장해야 한다. `MAX_TOLERATED_RTT`(권장 400 ms) 초과 플레이어에 대한 경고 또는 연결 차단은 네트워크 시스템의 책임이다.

**이유** "공정한 죽음" 필러: 네트워크 지연으로 인한 사망은 플레이어 입장에서 예고 없는 죽음과 구별 불가능하다. 이 시스템이 직접 해결할 수 없는 문제이지만, 책임 경계를 문서화하여 네트워크 시스템 설계 시 리듬 기반 동기화를 필수 계약으로 인식하게 한다.

## Dependencies

### 이 시스템이 의존하는 시스템 (upstream)

| 시스템 | 의존 내용 | 인터페이스 |
|--------|----------|-----------|
| **패턴 라이브러리** | 게이트 셀 목록 수신. 이 데이터 없이는 어떤 셀도 게이트로 활성화되지 않는다. | `ExplodePattern { cells: CellCoord[], patternId: string, bfsVerified: boolean }` 수신 |
| **라운드 에스컬레이션** | 라운드별 `GATE_PERIOD` 주입 | `setGatePeriod(seconds)` 호출 (A-8) |

---

### 이 시스템에 의존하는 시스템 (downstream)

| 시스템 | 의존 내용 | 소비하는 이벤트 / 호출하는 API |
|--------|----------|----------------|
| **플레이어 이동 시스템** | 셀 상태를 조회하여 이동 가능 여부 판단. 사망 이벤트를 수신하여 플레이어 상태 전환. | `CELL_STATE_CHANGED`, `PLAYER_KILLED`, `getCellState()` |
| **라운드 매니저** | 폭발 완료 이벤트를 누적하여 생존자 수 추적 및 라운드 종료 조건 판단. Goal Cell 프리뷰. | `CELL_EXPLODED`, `PATTERN_REJECTED`, `GRID_STALLED`, `nextExplosionTime()` |
| **공정 피드백 시스템** | 셀 상태 변화와 사망 원인을 읽기 전용으로 소비하여 사망 리플레이 overlay 제공. | `CELL_STATE_CHANGED`, `PLAYER_KILLED` |
| **오디오 시스템** | 상태 전이 이벤트를 수신하여 폭발음 재생. (fire-and-forget) | `AUDIO_EVENT(EXPLOSION \| GATE_SAFE, cellId)` |
| **HUD** | 디버그/통계 표시 | `getGatePeriod()` |

---

### 역방향 문서화 요구사항

이 시스템에 의존하는 각 시스템의 GDD는 아래 내용을 명시해야 한다:

- **패턴 라이브러리 GDD**: 이 시스템이 소비하는 `ExplodePattern` 스키마 정의 (cells: `CellCoord[]`, bfsVerified: boolean) + A-7 안전 칸 계약 + F-5 연결성 검증 책임
- **플레이어 이동 시스템 GDD**: `CELL_STATE_CHANGED` 구독 방식 + 그리드 경계 검증 책임(EC-7) + 이동-우선 처리 순서(EC-2) + `PLAYER_ARRIVED(playerId, cell)` 이벤트 발행 (round-manager가 Goal Cell 도달 감지에 사용)
- **라운드 매니저 GDD**: `CELL_EXPLODED` 누적 방식 + `PATTERN_REJECTED` 재시도 정책 + `GRID_STALLED` 수신 시 폴백 처리 + `ROUND_END` 신호 발행 조건 + `nextExplosionTime()` 호출로 Goal Cell 프리뷰
- **라운드 에스컬레이션 GDD**: 매 라운드 시작 시 `setGatePeriod(seconds)` 호출 + 유효 범위(`[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]`) 준수 책임
- **공정 피드백 시스템 GDD**: 읽기 전용 소비 제약 명시 + `PLAYER_KILLED` 페이로드(`playerIds[]`, `cellId`, `cause`) 활용 방식 + 사망 원인(`EXPLOSION` vs `DANGER_ZONE`) 구분
- **오디오 시스템 GDD**: `AUDIO_EVENT` type enum 정의 (`EXPLOSION`, `GATE_SAFE` 2종만)

## Tuning Knobs

> **안전 범위**: 모든 값은 런타임 config에서 로드. 코드에 하드코딩 금지.
> **F-2 제약**: `SAFE_WIN` ≥ 0.55 s 는 안전 범위 하한의 절대 기준 (`GATE_PERIOD - T_EX ≥ 0.55`).
> **레지스트리 참조**: `GATE_PERIOD_BASE`, `GATE_PERIOD_FLOOR`, `T_EX`, `MIN_SAFE_CELLS`는 `design/registry/entities.yaml` 에 등록된 cross-system 상수이다. 수정 시 레지스트리도 함께 갱신.

### 타이밍 노브

| 변수 | 확정값 | 안전 범위 | 영향하는 게임플레이 |
|------|--------|----------|-------------------|
| `GATE_PERIOD` | 2.0 s | `[GATE_PERIOD_FLOOR, GATE_PERIOD_BASE]` = [1.4, 2.0] s | 게이트 한 사이클 길이. 낮출수록 긴박감↑, 1.4 s 미만 시 SAFE_WIN=1.05s로 모바일 입력 지연 여유 부족 |
| `T_EX` | 0.35 s | 0.2 – 0.8 s | 폭발 지속 시간 (Exploded 상태). 짧을수록 "순간 폭발" 느낌↑ 임팩트 소실, 길수록 통과 위험↑ 긴장감↑. `GATE_PERIOD`와 독립. |
| `GATE_STAGGER` | 0.5 s | 0.2 – 1.0 s | 복수 게이트 간 파도 개방 간격(`offset` 차이). 짧으면 연속 통과 어려움↑, 너무 길면 파도 리듬 끊김 |

### 안전 칸 노브

| 변수 | 기본값 | 안전 범위 | 영향하는 게임플레이 |
|------|--------|----------|-------------------|
| `MIN_SAFE_CELLS` | 8 | 4 – 16 | 패턴 검증 시 보장되는 최소 비-게이트 셀 수. 낮출수록 고밀도 패턴 가능, 4 미만 시 "갈 곳 없음" 안티-판타지 위험 |

### 시스템 안정성 노브

| 변수 | 기본값 | 안전 범위 | 영향하는 게임플레이 |
|------|--------|----------|-------------------|
| `PATTERN_TIMEOUT` | 3.0 s | 1.0 – 5.0 s | 패턴 수신 대기 한계 시간. 초과 시 `GRID_STALLED` 이벤트 발행 |
| `MAX_TOLERATED_RTT` | 400 ms | 200 – 600 ms | 멀티플레이어 환경에서 허용되는 최대 왕복 레이턴시. 초과 플레이어에게 경고 표시 (네트워크 시스템이 소비) |

### 튜닝 조합 가이드

| 목표 | 조정 방향 |
|------|----------|
| **더 긴박한 라운드** | `GATE_PERIOD` 1.6 s, `T_EX` 0.4 s (SAFE_WIN=1.2s) |
| **고난이도 후반 라운드** | `GATE_PERIOD` 1.4 s (floor), `GATE_STAGGER` 0.3 s, `MIN_SAFE_CELLS` 4–6 |
| **튜토리얼/입문 라운드** | `GATE_PERIOD` 2.0 s (base), `T_EX` 0.25 s, `GATE_STAGGER` 0.8 s |
| **폭발 임팩트 강화** | `T_EX` 0.6 s (더 긴 위험 구간, SAFE_WIN 그만큼 단축됨 주의) |

## Visual/Audio Requirements

> 모든 렌더링은 Cocos Creator `Graphics` 컴포넌트 코드-드리븐. 스프라이트/텍스처 없음.
> 색상 팔레트: Void Black `#1A1A2E`, Danger Cyan `#00E5CC`, Pink-Red flash `#FF3366`.

### 셀 상태별 렌더 스펙 (Cyclic v4 — 2 state only)

| 상태 | 채움색 | 외곽선 | 애니메이션 |
|------|--------|--------|-----------|
| Idle (게이트 셀) | `#0D3050` | `#00E5CC` 45% opacity 3px 경계 | 없음 — 리듬은 상태가 아닌 시각적 비트(폭발 순간)로 표현 |
| Idle (경로 셀, 비-게이트) | `#0D3050` | `#00E5CC` 30% opacity 2px 연결선 | 없음 |
| Idle (비경로 셀) | `#1A1A2E` | `#2A2A3E` 1px | 없음 |
| Exploded | flash `#00E5CC` 0.1 s → `#3A1A1A` 유지 | `#00E5CC` 감쇠 | flash → dim 유지 (`T_EX` = 0.35 s 동안) |

**중요**: Warning 예고 색상(cyan 10% / 40% / 100%)은 Cyclic v4 설계에서 제거되었다. 플레이어는 게이트의 주기적 폭발 리듬을 관찰해 학습하며, 색상 변화 경고는 제공되지 않는다.

### 드로우 콜 예산

- 64셀 전체 → 단일 `Graphics` 컴포넌트 1 draw call
- 상태별 색상은 그래픽스 컴포넌트 내 fillStyle/strokeStyle per-path로 처리

### 오디오 이벤트

| 이벤트 | 발생 시점 | 음향 설명 (오디오 시스템이 결정) |
|--------|---------|-------------------------------|
| `EXPLOSION` | Idle → Exploded | 즉각 폭발음 + 셀 위치 기반 촉각(haptic) |
| `GATE_SAFE` | Exploded → Idle | 위험 해제 신호 (짧은 클릭/틱) |

### 진동 피드백

- `HAPTIC_EVENT(EXPLOSION, cellId)`: 폭발 전이 시 짧은 진동 (모바일 haptic feedback API)
- 진동 세기 및 패턴은 오디오/피드백 시스템이 결정

## Game Feel

### 목표 감각

- **Idle 구간 (SAFE_WIN)**: "지금은 안전해" — 게이트 셀이 조용히 빛을 유지. 1.65초 동안 지나갈 수 있다는 조건부 안심. 플레이어는 남은 시간을 암묵적으로 카운트한다.
- **Exploded 순간**: "터졌다!" — `#00E5CC` cyan flash가 0.1 s간 시야를 잡아채고 즉시 `#3A1A1A`로 어두워짐. 폭발 임팩트 후 0.35초간 dim 유지. 이 순간이 리듬의 기준점이 된다.
- **Idle 복귀 (T_EX 종료)**: "다시 열렸다" — 짧은 틱 사운드(`GATE_SAFE`)와 함께 경로 셀 색 복귀. 다음 1.65초의 안전 창 시작.
- **리듬 학습의 순간**: 첫 1–2회 관찰 후 플레이어는 게이트의 고정 주기를 인지. "이제 2초 리듬을 알아" — 불안에서 통제감으로 전환.
- **탈출 성공**: 내가 방금 지나간 게이트가 폭발할 때 — 직접적인 보상 피드백 없음. 판단이 옳았음을 결과로 확인.

### 금지되는 게임 느낌

- 게이트가 불규칙하게 터지거나 주기가 예고 없이 바뀌는 "학습 불가" 느낌 (`setGatePeriod`는 라운드 전환 시에만 호출)
- 게이트와 비-게이트 셀의 시각적 구분이 모호해 "어느 셀이 게이트인지 모름" 상태
- 폭발 flash가 너무 밝거나 길어서 후속 입력 판단을 방해하는 "눈부심" 상태 (0.1s 한정)
- 동시 폭발 수가 너무 많아서 "시각적 노이즈" 상태 (A-7로 일정 밀도 보장)

### 리듬

확정값 기준 하나의 게이트가 만들어내는 리듬:
```
0.00 s : Idle  — 게이트 셀 색 (#0D3050), 조용함. 안전 창 시작.
1.65 s : EXPLOSION — cyan flash, 폭발음, haptic. (경고 없음, 주기가 예고다)
1.75 s : Flash 종료 → dim (#3A1A1A) 유지. Exploded 지속.
2.00 s : Idle 복귀 — GATE_SAFE 틱. 사이클 반복.
(GATE_PERIOD = 2.0 s 고정. 영원히 반복)
```

**리듬 읽기:** 플레이어는 게이트가 얼마나 자주 터지는지, 언제 안전한지를 관찰로 학습한다.
색상 변화로 예고하지 않는다 — 리듬 자체가 예고다.

**여러 게이트의 파도:** 게이트마다 `offset`이 다르므로, 한 화면에 여러 게이트가 서로 다른 위상으로 폭발. 전체 파도의 리듬을 읽는 것이 후반 라운드의 핵심 스킬.

## UI Requirements

이 시스템이 UI/HUD 시스템에 요구하는 것과 제공하는 것.

### 이 시스템이 UI에 제공하는 정보

| 이벤트/API | UI 활용 |
|------------|--------|
| `CELL_STATE_CHANGED(cellId, newState, timestamp)` | 그리드 렌더 갱신 (이 시스템이 직접 렌더링) |
| `CELL_EXPLODED(cellId, killedPlayerIds[])` | 사망 이벤트 로그, 킬 피드 업데이트 (HUD 시스템 경유) |
| `PLAYER_KILLED(playerIds[], cellId, cause)` | 사망 원인 표시 — 사망 리플레이/피드백 UI (공정 피드백 시스템 경유) |
| `getGatePeriod()` / `nextExplosionTime(cell)` | 디버그 오버레이, Goal Cell 프리뷰 (HUD/round-manager가 pull) |

### UI 시스템이 이 시스템에 요구하지 않는 것

- 이 시스템은 UI 레이아웃이나 HUD 표시 방식을 알지 못하며 알 필요도 없다.
- 렌더링은 이 시스템이 직접 `Graphics` 컴포넌트에 수행한다. UI 시스템은 그리드 셀의 비주얼에 관여하지 않는다.

### 그리드 렌더링 소유권

- **소유자**: 이 시스템 (GridExplosionSystem 컴포넌트)
- **렌더 대상**: 64셀 전체를 단일 `Graphics` 컴포넌트로 렌더링
- **UI 시스템과의 경계**: UI 시스템은 그리드 위에 오버레이되는 HUD 요소(라운드 카운터, 생존자 수, 타이머 바)만 담당. 셀 내부 비주얼에 개입 금지.

## Cross-References

| 문서 | 관련 내용 |
|------|----------|
| `design/gdd/systems-index.md` | 시스템 #6, 설계 순서 #1, Core Layer, MVP |
| `design/art/art-bible.md` § Section 4 (Color System) | Danger Cyan `#00E5CC`, Void Black `#1A1A2E`, Death Rose `#FF3366` |
| `design/art/art-bible.md` § Section 3 (Shape Language) | Chamfer 시스템, 셀 경계 처리 |
| `design/art/art-bible.md` § Section 8 (Asset Standards) | ≤50 draw calls, ≤150MB 메모리, Graphics 컴포넌트 우선 원칙 |
| `design/gdd/game-concept.md` § Core Loop | "폭탄 패턴 읽기 → 안전한 칸으로 이동 → 생존" |
| `design/gdd/game-concept.md` § Game Pillars | 읽으면 이긴다, 공정한 죽음 |
| `design/gdd/pattern-library.md` *(미작성)* | 패턴 라이브러리 계약 (A-7, F-6) 이행 주체 |
| `design/gdd/player-movement.md` *(미작성)* | 이동-우선 처리 순서 (EC-2), 4/8방향 이동 확정 → F-6 검토 |
| `design/gdd/round-manager.md` *(미작성)* | `PATTERN_REJECTED` 재시도 정책, `ROUND_END` 신호 발행 조건 |
| `design/gdd/fair-feedback.md` | `PLAYER_KILLED(playerIds[], cellId, cause)` 소비 방식, `killerGateCells` death overlay |
| `design/gdd/round-escalation.md` | `setGatePeriod(seconds)` 호출 규약 (A-8) |
| `design/registry/entities.yaml` | `GATE_PERIOD_BASE`, `GATE_PERIOD_FLOOR`, `T_EX`, `MIN_SAFE_CELLS` 상수 |
| `docs/engine-reference/cocos/VERSION.md` | Cocos Creator 3.8.6, `Graphics` 컴포넌트 API |

## Acceptance Criteria

> **자동화 BLOCKING**: AC-1~12, 16~24 — `tests/unit/grid-explosion/`, `tests/integration/grid-explosion/`
> **수동 ADVISORY**: AC-13~15 — `production/qa/evidence/grid-explosion-render/`

### 카테고리 1. 사이클릭 상태 전이 정확성 (Cyclic v4)

**AC-1. 게이트 셀의 사이클릭 전이 순서**
- **검증**: 단위 테스트. 게이트 셀 1개에 `ExplodePattern` 주입 후 시뮬레이션 클락을 `GATE_PERIOD × 3` 전진시켜 시퀀스 기록.
- **Pass**: 기록된 시퀀스가 정확히 `[IDLE, EXPLODED, IDLE, EXPLODED, IDLE, EXPLODED, IDLE]` (초기 Idle + 3 cycle). Warning/Imminent 등 중간 상태 0건. 비-게이트 셀은 항상 `IDLE` 유지.
- **Fail**: 순서 위반, 중간 상태 발생, 또는 사이클 누락.

**AC-2. 각 상태 지속 시간 정확도 ±16ms**
- **검증**: 단위 테스트. 기본값(`GATE_PERIOD=2.0, T_EX=0.35`) 설정 후 실제 전이 시각과 예상 전이 시각의 차이를 측정. 100 사이클 반복.
- **Pass**: 두 전이(`Idle→Exploded`, `Exploded→Idle`) 각각에서 편차 ≤ 16ms가 100/100 사이클 성립. Idle 지속 ≈ `SAFE_WIN = 1.65s`, Exploded 지속 ≈ `T_EX = 0.35s`.
- **Fail**: 어느 전이든 1회라도 편차 16ms 초과.

**AC-3. 외부 시스템이 상태 전이를 직접 중단/역행시킬 수 없음**
- **검증**: 단위 테스트. 셀이 `IDLE` 상태일 때 외부 강제 상태 세터(`forceState(EXPLODED)`) 호출 시도. 기존 타이머 잔여 시간 조회.
- **Pass**: 세터 API가 존재하지 않거나(private), 호출 후에도 타이머 잔여 시간이 호출 전과 동일. 상태 변경 없음.
- **Fail**: 타이머 변경 또는 외부 호출로 상태 강제 변경 성공.

**AC-4. `CELL_STATE_CHANGED` 이벤트가 모든 전이에 발행**
- **검증**: 단위 테스트. 이벤트 버스에 리스너를 붙이고 게이트 셀 1개를 2 사이클 실행.
- **Pass**: 총 4회 발행 (2 사이클 × 2 전이). 순서대로 `newState`: `EXPLODED, IDLE, EXPLODED, IDLE`. 각 이벤트에 `cellId`, `newState`, `timestamp` 필드 존재.
- **Fail**: 발행 횟수 오류, 순서 오류, 또는 필드 누락.

**AC-4b. `setGatePeriod` API 유효 범위 검증**
- **검증**: 단위 테스트. 유효값(1.6), 하한 경계(1.4), 상한 경계(2.0), 범위 외(1.3, 2.1) 호출.
- **Pass**: 유효 범위 내 호출은 적용되고 `GATE_PERIOD` 갱신. 범위 외는 거부되며 경고 로그 발행, 기존 값 유지.
- **Fail**: 범위 외 값이 적용되거나, 유효값이 거부됨.

---

### 카테고리 2. 폭발 판정 공정성

**AC-5. 이동-우선 처리: 폭발 직전 게이트 셀에서 이동 입력 시 탈출 성공**
- **검증**: 단위 테스트 (EC-2). 플레이어를 곧 폭발할 게이트 셀(잔여 시간 ≤ 1 tick)에 위치시키고 동일 타임스텝에 이동 입력 + `Idle→Exploded` 전이 동시 발생.
- **Pass**: 플레이어 상태 `ALIVE`. `PLAYER_KILLED` 미발행. 이동 목적지 셀에 플레이어 위치.
- **Fail**: `PLAYER_KILLED` 발행 또는 원래 셀에 잔류.

**AC-6. Exploded 셀 착지 즉시 사망 (위험 존)**
- **검증**: 단위 테스트. `Exploded` 상태 셀로 플레이어 이동 후 착지 처리 결과 확인.
- **Pass**: `PLAYER_KILLED(playerId, cellId, DANGER_ZONE)` 즉시 발행. 플레이어 `DEAD` 전환. 중복 판정 없음.
- **Fail**: `PLAYER_KILLED` 미발행, cause가 `DANGER_ZONE`이 아님, 또는 `ALIVE` 유지.

**AC-7. 동시 폭발 처리 순서가 결과에 영향 없음**
- **검증**: 단위 테스트. 게이트 셀 A, B가 동일 타임스텝에 `Idle→Exploded` 전이. 처리 순서 A→B, B→A 각각 실행 후 결과 비교.
- **Pass**: 두 실행 결과 동일. 두 플레이어 모두 `DEAD`. `CELL_EXPLODED` 배열에 두 ID 모두 포함.
- **Fail**: 순서에 따라 사망자 수 다름, 또는 배열에서 플레이어 누락.

**AC-8. `PLAYER_KILLED` cause 필드 정확성**
- **검증**: 단위 테스트. (a) 폭발 전이 순간 해당 셀의 플레이어, (b) Exploded 셀에 착지하는 플레이어.
- **Pass**: (a) `cause = EXPLOSION`, (b) `cause = DANGER_ZONE`.
- **Fail**: cause 필드가 교차되거나 `null`/`undefined`.

---

### 카테고리 3. 안전 칸 보장

**AC-9. 유효 패턴에서 MIN_SAFE_CELLS=8 이상 Idle 보장**
- **검증**: 단위 테스트. 56셀 폭발 + 8셀 Idle(BFS 연결 충족) 패턴 주입. 패턴 적용 후 Idle 셀 수 집계.
- **Pass**: Idle 셀 수 = 8. `PATTERN_REJECTED` 미발행.
- **Fail**: Idle 셀 수 7 이하, 또는 8임에도 `PATTERN_REJECTED` 발행.

**AC-10. MIN_SAFE_CELLS 위반 패턴 즉시 거부**
- **검증**: 단위 테스트. 57개 게이트 셀(비-게이트 = 7) 패턴 주입.
- **Pass**: `PATTERN_REJECTED(patternId)` 1회 발행. 어떤 셀도 게이트로 활성화되지 않음 (타이머 할당 없음).
- **Fail**: 패턴이 실행되어 게이트 타이머가 할당된 뒤 거부.

**AC-11. BFS 연결성 위반 패턴 거부**
- **검증**: 단위 테스트. 비-게이트 8셀이지만 비연결(분리된 두 섬)인 패턴(bfsVerified=false) 주입.
- **Pass**: `PATTERN_REJECTED(patternId)` 1회 발행. 어떤 셀도 게이트로 활성화되지 않음.
- **Fail**: 비-게이트 셀 수 8이라는 이유로 패턴 실행.

**AC-12. PATTERN_REJECTED 후 3.0s 초과 시 GRID_STALLED 발행**
- **검증**: 단위 테스트. 위반 패턴 주입 후 시뮬레이션 클락 3.0s 전진.
- **Pass**: 3.0s 경과 직후 (±16ms) `GRID_STALLED` 1회 발행.
- **Fail**: 3.0s 이전 발행, 초과 후 미발행, 또는 2회 이상 발행.

---

### 카테고리 4. 렌더링 정확성 (ADVISORY)

**AC-13. 각 상태 비주얼이 아트 바이블 스펙과 일치**
- **검증**: 수동 + 스크린샷. 디버그 명령으로 Idle(게이트) / Idle(비-게이트) / Exploded 3개 상태 캡처. 아트 바이블 §3, §4 비교.
- **Pass**: Idle(게이트)=`#0D3050`/cyan 45% 3px 경계, Idle(비-게이트)=`#1A1A2E`/chamfer 2px, Exploded=`#00E5CC` flash 0.1s → `#3A1A1A` dim 유지. 3개 상태 육안 구별 가능.
- **Fail**: 어느 상태든 색상 명백히 이탈, 또는 두 상태가 시각적으로 구별 불가.

**AC-14. 게이트 사이클 리듬이 60fps 시각 측정에서 ±1 frame 이내**
- **검증**: 수동 + 60fps 영상 녹화. 기본값(`GATE_PERIOD=2.0s`) 게이트 1개를 3 사이클 기록, flash 시작 프레임과 Idle 복귀 프레임 카운트.
- **Pass**: 폭발 간격 = 120 프레임(±1). Exploded 지속 = 21 프레임(±1, `T_EX=0.35s`).
- **Fail**: 프레임 드리프트가 누적되거나 사이클이 불규칙.

**AC-15. 64셀이 단일 Graphics 컴포넌트 1 draw call로 렌더링**
- **검증**: Cocos Creator 에디터 Profiler DrawCall 카운터. 게이트/비-게이트/Exploded가 혼재한 시나리오에서 측정.
- **Pass**: 그리드 렌더링 draw call 증분 = 1.
- **Fail**: 증분 2 이상.

---

### 카테고리 5. 이벤트 발행 정확성

**AC-16. `CELL_EXPLODED` 이벤트 스키마 정확성**
- **검증**: 단위 테스트. 2명 플레이어가 동일 게이트 셀에서 `Idle→Exploded` 전이 발생.
- **Pass**: `cellId` 일치. `killedPlayerIds` 배열에 2개 ID 모두 포함. 발행 횟수 = 1회.
- **Fail**: 배열에 1개만 포함, 또는 이벤트 2회 발행.

**AC-17. 플레이어 없는 셀 폭발 시 `PLAYER_KILLED` 미발행**
- **검증**: 단위 테스트. 플레이어 없는 게이트 셀 `Idle→Exploded` 전이.
- **Pass**: `PLAYER_KILLED` 0회 발행. `CELL_EXPLODED(cellId, [])` 정상 발행.
- **Fail**: `PLAYER_KILLED` 1회 이상 발행.

**AC-18. 모든 이벤트에 타임스탬프 포함**
- **검증**: 단위 테스트. 시뮬레이션 클락 고정값 설정 후 `CELL_STATE_CHANGED` 이벤트 `timestamp` 검사.
- **Pass**: 모든 이벤트에 `timestamp` 존재. 클락 시각과 일치 (±1ms).
- **Fail**: `timestamp`가 `null`/`undefined`/0, 또는 클락 시각과 16ms 이상 편차.

---

### 카테고리 6. 성능

**AC-19. 64셀 상태 기계 업데이트 16.6ms 이내**
- **검증**: 단위 테스트 + 성능 프로파일링. 64셀 다양한 상태로 설정 후 `update(dt)` 1,000회 실행, 최대값 기록.
- **Pass**: 최대 실행 시간 < 16.6ms. 평균 < 4ms.
- **Fail**: 1회라도 16.6ms 초과. (모바일 vs CI 환경 수치 구분 qa-lead 승인 필요)

**AC-20. 동시 폭발 64셀(최악 케이스) 단일 프레임 처리**
- **검증**: 단위 테스트. 64 게이트 셀이 동일 `offset`으로 동시 `Idle→Exploded` 전이 강제, 실행 시간 및 이벤트 수 측정. (주의: 실제 패턴은 A-7에 의해 64 전체 폭발이 불가능하나 성능 상한 검증 목적)
- **Pass**: 실행 시간 < 16.6ms. `CELL_STATE_CHANGED` 64회, `CELL_EXPLODED` 64회 발행.
- **Fail**: 실행 시간 초과 또는 이벤트 수 ≠ 64.

---

### 카테고리 7. 엣지 케이스

**AC-21. 이미 사망한 플레이어 중복 판정 제외**
- **검증**: 단위 테스트. 플레이어 1명을 셀 A, B 동시 폭발 대상으로 설정. 셀 A 판정으로 사망 후 셀 B 판정 수행.
- **Pass**: `PLAYER_KILLED` 정확히 1회 발행. 두 번째 판정에서 해당 플레이어 제외.
- **Fail**: 2회 발행 또는 두 번째 판정 오류.

**AC-22. setGatePeriod 호출 시 현재 Exploded 셀의 잔여 T_EX 보존 (EC-5)**
- **검증**: 단위 테스트. 게이트 셀이 Exploded 상태 진입 직후(잔여 T_EX ≈ 0.3s) `setGatePeriod(1.6)` 호출. 잔여 시간 및 다음 사이클 타이밍 관찰.
- **Pass**: 현재 Exploded 잔여 시간 ≈ 0.3s 그대로 유지. 이후 Idle 복귀. 다음 폭발까지 `SAFE_WIN_new = 1.6 - 0.35 = 1.25s` 적용. offset(위상) 유지되어 리듬 연속성 있음.
- **Fail**: `setGatePeriod` 호출이 잔여 T_EX를 리셋하거나, 다음 사이클이 예상 시점에서 벗어남.

**AC-23. 마지막 생존자 폭발 시 시스템이 게임 종료 스스로 판단 안 함 (EC-3)**
- **검증**: 단위 테스트. 플레이어 1명 남은 상태에서 해당 셀 폭발. 발행 이벤트 목록 및 나머지 타이머 상태 확인.
- **Pass**: `PLAYER_KILLED`, `CELL_EXPLODED` 정상 발행. `ROUND_END` 미발행. 나머지 셀 타이머 계속 구동.
- **Fail**: 시스템이 `ROUND_END` 직접 발행, 또는 타이머 자동 정지.

**AC-24. 그리드 경계 외부 좌표 요청 시 경고 로그 발행 후 무시 (EC-7)**
- **검증**: 단위 테스트. `ExplodePattern`에 범위 외 좌표(`{x:-1,y:0}`, `{x:8,y:8}`) 포함 주입.
- **Pass**: 범위 외 좌표 경고 로그 발행. 유효 좌표 정상 처리. 시스템 예외 없이 계속 동작.
- **Fail**: 경고 로그 미발행, 예외 발생, 또는 유효 좌표 처리 중단.

---

### 미확정 항목 (qa-lead 승인 전 보류)

| AC | 미확정 내용 |
|----|------------|
| AC-14 | 사이클 타이밍 ±1 frame 허용 오차 — 디자이너 승인 필요 |
| AC-19 | 모바일 기기 vs CI 데스크탑 환경 성능 수치 분리 기준 |
| AC-20 | 동일 |

## Open Questions

| # | 질문 | 해결 주체 | 우선순위 |
|---|------|----------|--------|
| OQ-1 | ~~플레이어 이동 시스템이 4-방향인지 8-방향인지 미확정~~ **해소 (2026-04-21):** 8방향 조이스틱 확정. F-5 `adjacent` 정의 8-방향으로 적용. | prototypes/grid-core 검증 완료 | 해소 |
| OQ-2 | 패턴 라이브러리 GDD가 고정 경로+게이트 구조에서도 필요한지 재검토 필요. 자유 그리드 패턴 시스템 → 게이트 사이클 시스템으로 변경됨에 따라 기존 패턴 라이브러리 계약(A-7)의 적용 범위가 달라질 수 있다. | round-manager GDD + 경로 시스템 설계 시 확정 | 높음 |
| OQ-3 | ~~`IMMINENT_DURATION` 검증 필요~~ **해소 (2026-04-21):** Warning 단계 전체 제거. 경고 없이 즉각 폭발. IMMINENT_DURATION 개념 폐기. | prototypes/grid-core 검증 완료 | 해소 |
| OQ-4 | ~~동시 Warning 셀 정보 홍수 임계점~~ **해소 (2026-04-21):** Warning 단계 제거로 해당 없음. | prototypes/grid-core 검증 완료 | 해소 |
| OQ-5 | Exploded dim 비주얼(`#3A1A1A`)이 경로 셀(`#0D3050`)과 어두운 환경에서 충분히 구별되는지 미확인. 색상 조정이 필요할 경우 아트 바이블 §4 수정과 연동. | AC-13 수동 검증 시 확정 | 중간 |
| OQ-6 | `MAX_TOLERATED_RTT` 400ms 기준이 토스 인토스 webview 환경의 실제 RTT 분포와 맞는지 미검증. | WebSocket 네트워킹 시스템 프로토타입 테스트 시 검증 | 낮음 |
| OQ-7 | 고정 경로 구조에서 게이트가 아닌 일반 경로 셀의 폭발 메커닉이 필요한지 여부. 현재 설계는 게이트 셀만 폭발. 라운드 매니저 설계 시 결정. | round-manager GDD 작성 시 확정 | 중간 |
