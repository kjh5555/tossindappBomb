# 라운드 매니저 (Round Manager)

> **Status**: Draft — Review Pending
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-21
> **Implements Pillar**: Pillar 2 — 5분의 밀도 / Pillar 3 — 함께 겨루는 생존

## Overview

라운드 매니저는 GRID REAPER의 라운드 생명주기를 소유하는 핵심 게임플레이 시스템이다. 라운드 시작 시 고정 경로 위에 Goal Cell을 배치하고, 플레이어 생사 상태를 추적하며, 생존자가 Goal Cell에 도달하는 순간 라운드를 클리어한다. 사망한 플레이어는 탈락이 아닌 스펙테이터로 전환되어 생존자를 응원하고, 클리어 성공 시 전원이 다음 라운드에 복귀한다. 전원 사망 시에는 Game Over로 세션이 종료된다. 이 시스템은 Pillar 2 "5분의 밀도"를 위한 빠른 라운드 전환과 Pillar 3 "함께 겨루는 생존"의 사회적 응원 구조를 동시에 구현한다.

## Player Fantasy

**대신 살아줘**

마지막 게이트가 터지기 직전, 나는 이미 죽었다. 화면에는 남은 한 명이 게이트 사이클 사이를 파고들어 Goal Cell을 향해 달린다. 내가 다음 라운드로 돌아갈 수 있는지 여부가 저 사람의 마지막 몇 칸에 달려 있다. 살아남은 자는 혼자 이긴 게 아니다 — 죽은 자들의 부활을 손에 쥐고 달린 것이다.

생존자에게 이 순간은 책임이다. 실수 한 번이 네 명을 다음 라운드에 못 데려간다는 무게가 마지막 칸을 더 선명하게 만든다. 스펙테이터에게는 투자다 — 더 이상 움직일 수 없지만, 저 사람이 읽어내면 내가 살아난다는 것을 안다. 이 구조가 Pillar 3 "함께 겨루는 생존"의 물리적 형태다.

**앵커 모먼트**: 생존자가 Goal Cell을 밟는 순간 — 스펙테이터 화면에서 자신의 캐릭터가 다시 살아나는 것을 보는 순간.

## Detailed Design

### Core Rules

**RM-1 — 라운드 라이프사이클**
라운드는 `ROUND_STARTED` 이벤트와 함께 시작된다. 다음 세 조건 중 하나가 충족되면 종료:
- (a) 생존 플레이어가 Goal Cell 도달 → `ROUND_CLEAR`
- (b) 전원 사망 → `GAME_OVER`
- (c) 라운드 타이머 만료 → `GAME_OVER` (timeout)

**RM-2 — Goal Cell 배치**
- Goal Cell은 고정 경로의 마지막 셀 인덱스 N-1에 배치된다.
- 배치 시점: `ROUND_STARTED` 직후, 플레이어 이동 시작 전.
- **예외**: N-1이 라운드 시작 후 첫 번째 `GATE_PERIOD`(2.0s) 이내에 폭발 예정인 경우, N-2에 배치한다. (즉시 적대적 배치 회피)
- Goal Cell은 라운드 내내 이동하지 않는다.
- 배치 후 `GOAL_PLACED` 이벤트 발행.

**RM-3 — 사망 → 스펙테이터 전환**
- `PLAYER_KILLED` 수신 시, 해당 플레이어는 즉시 `SPECTATOR` 상태로 전환.
- 스펙테이터는 이동 불가, 그리드 상호작용 불가.
- **Tap-to-Cheer**: 폭발 사이클 1회당 1번 응원 가능 (rate-limit: `GATE_PERIOD` = 2.0s).
  - 응원 시 마지막 위치 셀에 파티클 버스트 + 말풍선 표시.
- **패턴 어노테이션 오버레이**: 다음 사이클에 폭발 예정인 셀을 하이라이트로 표시.
- `ALIVE_COUNT_CHANGED` 이벤트 발행.

**RM-4 — 라운드 클리어 조건**
- 생존 플레이어 중 **최초로** 셀 N-1(Goal Cell)에 도달한 플레이어가 라운드를 클리어.
- `ROUND_CLEAR` 발행 후 처리 순서:
  1. 모든 스펙테이터 + 생존자를 다음 라운드 `ALIVE`로 마킹.
  2. `ROUND_CLEAR_DISPLAY_DURATION`(1500ms) 동안 클리어 화면 표시.
  3. 1500ms 후 `ROUND_END` 발행 → 즉시 `ROUND_STARTED` 발행 (다음 라운드 시작).

**RM-5 — 라운드 타이머**
- 각 라운드에는 `ROUND_TIME_LIMIT`(초) 타이머가 적용된다.
- 타이머는 `ROUND_STARTED`에서 시작.
- 타이머 만료 시 `ROUND_CLEAR` 없음 → `GAME_OVER`(timeout).
- 타이머는 HUD에 카운트다운으로 표시.

**RM-6 — 스펙테이터 응원 및 재진입**
- 응원 입력: 화면 아무 곳이나 탭. 최대 1회/`GATE_PERIOD`(2.0s) rate-limited.
- 시각 효과: 마지막 위치 셀에 버스트 이펙트.
- 패턴 어노테이션: 다음 사이클 위험 셀을 색상으로 강조.
- **재진입**: 라운드 클리어 후 모든 스펙테이터는 경로 인덱스 0(시작점)에서 `ALIVE` 상태로 복귀.

**RM-7 — 세션 및 게임 오버**
- 세션은 무제한 라운드로 구성 (자연 종료).
- Game Over 트리거:
  - (a) 라운드 중 전원 사망 (`ALIVE_COUNT` = 0)
  - (b) 라운드 타이머 만료 (생존자 있어도 timeout)
- `GAME_OVER` 후 세션 종료 — 부활 없음.
- 재플레이 = 새 세션 시작.

### States and Transitions

| 상태 | 설명 |
|------|------|
| `IDLE` | 활성 라운드 없음 (첫 라운드 전, 또는 GAME_OVER 후) |
| `ROUND_ACTIVE` | 라운드 진행 중 |
| `ROUND_CLEAR_DISPLAY` | 1500ms 클리어 화면 표시 중 |
| `GAME_OVER` | 세션 종료 |

| 전환 | 트리거 | 발행 이벤트 |
|------|--------|------------|
| `IDLE → ROUND_ACTIVE` | `startRound()` 호출 | `ROUND_STARTED`, `GOAL_PLACED` |
| `ROUND_ACTIVE → ROUND_CLEAR_DISPLAY` | 생존 플레이어가 셀 N-1 도달 | `ROUND_CLEAR` |
| `ROUND_ACTIVE → GAME_OVER` | `ALIVE_COUNT = 0` 또는 타이머 만료 | `GAME_OVER` |
| `ROUND_CLEAR_DISPLAY → ROUND_ACTIVE` | 1500ms 경과 | `ROUND_END`, `ROUND_STARTED`, `GOAL_PLACED` |
| `GAME_OVER → IDLE` | 세션 리셋 (새 세션) | — |

### Interactions with Other Systems

| 시스템 | 방향 | 상호작용 |
|--------|------|---------|
| `grid-explosion` | 업스트림 | `GATE_PERIOD`, 폭발 이벤트, 셀 상태 쿼리 제공. Goal Cell 배치 예외 판단에 활용. |
| `player-movement` | 업스트림 | 플레이어 위치 업데이트 수신. `PLAYER_KILLED` + `PLAYER_ARRIVED { playerId, cell: CellCoord, timestamp }` 이벤트 구독 → Goal Cell 감지. |
| `fair-feedback` | 병렬 리스너 | `PLAYER_KILLED` 공유 구독. Round Manager가 직접 호출하지 않음 (이벤트 버스 패턴). |
| `HUD` | 다운스트림 | `ROUND_STARTED`, `ROUND_CLEAR`, `GAME_OVER`, `ALIVE_COUNT_CHANGED`, 타이머값 수신. |
| `audio` | 다운스트림 | `ROUND_CLEAR` → 클리어 스팅. `GAME_OVER` → 게임오버 스팅. |

## Formulas

**F-RM-1 — Goal Cell 폴백 조건**

```
goalCellIndex = (nextExplosionTime(pathCells[N-1]) < GATE_PERIOD) ? N-2 : N-1
```

- `pathCells[i]: CellCoord` — 고정 경로의 i번째 셀 좌표 (`{row: 0-7, col: 0-7}`)
- `nextExplosionTime(cell: CellCoord)`: 해당 셀의 다음 폭발까지 남은 시간 (초). grid-explosion 공개 API.
- `GATE_PERIOD` = 2.0s (레지스트리 상수 `GATE_PERIOD_BASE` 참조)
- 결과 범위: 경로 인덱스 N-2 또는 N-1 (그리드 좌표가 아닌 경로 내 순서)
- 주의: goalCellIndex는 경로 내 순서 인덱스이며, 실제 그리드 위치는 `pathCells[goalCellIndex]: CellCoord`로 변환.

예시: N=20, `nextExplosionTime(pathCells[19])` = 1.5s < 2.0s → goalCellIndex = 18

---

**F-RM-2 — 생존자 수**

```
ALIVE_COUNT = totalPlayers - deadCount
```

- `totalPlayers`: 세션 시작 시 플레이어 수 (고정)
- `deadCount`: 현재 라운드에서 `PLAYER_KILLED` 이벤트 수신 누적
- `ALIVE_COUNT = 0` → `GAME_OVER` 트리거

---

**F-RM-3 — 스펙테이터 응원 rate-limit**

```
cheerCooldown = GATE_PERIOD = 2.0s
canCheer = (currentTime - lastCheerTime) ≥ cheerCooldown
```

- `lastCheerTime`: 마지막 응원 타임스탬프 (스펙테이터별 독립)
- `currentTime`: 이벤트 수신 시각

---

**F-RM-4 — 라운드 클리어 디스플레이 종료**

```
roundClearEndTime = roundClearTime + ROUND_CLEAR_DISPLAY_DURATION
```

- `roundClearTime`: `ROUND_CLEAR` 이벤트 발행 시각
- `ROUND_CLEAR_DISPLAY_DURATION` = 1500ms
- `roundClearEndTime` 도달 시 `ROUND_END` 발행

---

**F-RM-5 — 라운드 타이머**

```
timeRemaining(t) = ROUND_TIME_LIMIT - (t - roundStartTime)
GAME_OVER if timeRemaining(t) ≤ 0 and state == ROUND_ACTIVE
```

- `ROUND_TIME_LIMIT`: 튜닝 노브 (초)
- `roundStartTime`: `ROUND_STARTED` 발행 시각
- `t`: 현재 시각

## Edge Cases

**EC-RM-1 — Goal Cell이 N-2에 배치됐는데 N-2도 첫 사이클 내 폭발 예정**

상황: N=20, `nextExplosionTime(pathCells[19])` < GATE_PERIOD 이고 `nextExplosionTime(pathCells[18])` < GATE_PERIOD.
처리: N-2(경로 인덱스 18, 즉 `pathCells[18]`)에 배치한다. 폴백은 1단계만 수행한다. N-2가 곧 폭발해도 플레이어는 해당 셀을 피하거나 즉사할 수 있다 — "공정한 죽음" 원칙 유지. (추가 폴백 체인 없음.)

---

**EC-RM-2 — 생존자가 Goal Cell 도달과 동시에 해당 셀 폭발**

상황: 플레이어가 N-1에 착지하는 프레임에 N-1이 Exploded 상태.
**처리 순서**: `PLAYER_ARRIVED` 처리(Goal Cell 도달 판정) → 폭발 판정 순서를 따른다. 결과: `ROUND_CLEAR`가 발행되고, 이후 폭발 판정은 무시된다. Goal Cell에 도달한 순간이 라운드 클리어이며, 동프레임 폭발로 플레이어가 사망하지 않는다.

근거: "공정한 죽음" 원칙 — Goal Cell을 밟았는데 폭발로 역전 사망하는 것은 플레이어가 납득하기 어렵다. 도달 판정을 폭발 판정보다 먼저 처리함으로써 "읽어서 도달한 자는 승리한다"는 계약을 유지한다.
이 규칙은 **Goal Cell 한정**이다 — 비-Goal Cell에서 Exploded 착지 시 `PLAYER_KILLED` 우선 처리는 그대로 유지된다 (player-movement EC-1, grid-explosion A-4).

---

**EC-RM-3 — 멀티플레이어에서 두 플레이어가 동일 프레임에 Goal Cell 도달**

상황: 두 플레이어가 동일 프레임에 N-1 도달.
처리: 서버 수신 순서 기준으로 먼저 처리된 플레이어가 클리어 트리거. 두 번째는 이미 `ROUND_CLEAR` 상태이므로 추가 이벤트 없이 무시한다.

---

**EC-RM-4 — 라운드 클리어 디스플레이 중 PLAYER_KILLED 수신**

상황: `ROUND_CLEAR_DISPLAY` 상태에서 지연된 폭발 판정으로 `PLAYER_KILLED` 도착.
처리: 무시한다. `ROUND_CLEAR_DISPLAY` 상태에서는 생사 상태 변경을 처리하지 않는다. 이미 클리어된 라운드의 사망 판정은 다음 라운드에 영향 없음.

---

**EC-RM-5 — 1인 플레이 (솔로 세션)**

상황: `totalPlayers = 1`.
처리: 규칙 동일. 1명 사망 시 즉시 `ALIVE_COUNT = 0` → `GAME_OVER`. 스펙테이터 응원 기능은 비활성화(표시 없음). 라운드 클리어는 본인이 Goal Cell 도달 시.

---

**EC-RM-5b — GRID_STALLED 3자 처리 순서 (canonical)**

`GRID_STALLED` 이벤트 발생 시 처리 책임은 다음 순서로 확정된다. 이 GDD가 3자 계약의 단일 기준 문서다.

```
1. pattern-library: 3회 연속 검증 실패 → GRID_STALLED { roundNumber, timestamp } 발행
2. round-escalation: GRID_STALLED 수신 → Tier 강등(max(1, currentTier-1)) → stalledFallback=true EscalationContext 재발행
3. pattern-library: 강등된 Tier로 재선택 시작 (최대 3회 재시도)
4. 재선택 성공 → ExplodePattern 정상 전달 → 라운드 진행
5. 재선택도 연속 실패 → GRID_STALLED 재발행 → 2단계로 순환 (최대 currentTier-1회 강등 가능)
6. Tier 1에서도 3회 실패 → grid-explosion이 해당 라운드를 스킵하고 빈 패턴으로 처리
   (round-manager는 다음 ROUND_STARTED 이벤트를 대기 — 라운드 자체는 진행됨)
```

각 시스템의 책임:
- **pattern-library**: GRID_STALLED 발행, 강등 Tier로 재선택
- **round-escalation**: Tier 강등 EscalationContext 재발행
- **grid-explosion**: Tier 1 전부 실패 시 라운드 스킵 처리
- **round-manager**: 이 흐름을 개시(ROUND_STARTED)하고 결과(ExplodePattern 도달 또는 스킵) 대기

---

**EC-RM-6 — 라운드 타이머 만료와 전원 사망 동시 발생**

상황: 마지막 생존자 사망 이벤트와 타이머 만료가 동일 프레임.
처리: `ALIVE_COUNT = 0` 조건을 우선 처리한다. 두 트리거 모두 `GAME_OVER`이므로 결과는 동일하지만, `GAME_OVER` 이벤트는 단 1회만 발행한다. (중복 방지: `state == ROUND_ACTIVE` 가드 조건.)

---

**EC-RM-7 — 재진입 위치 셀(인덱스 0)이 라운드 시작 시 폭발 예정**

상황: 다음 라운드 시작 시 인덱스 0이 첫 `GATE_PERIOD` 내 폭발 예정.
처리: 재진입은 인덱스 0에 고정. 폭발 예정이어도 이동으로 탈출 가능하다 — "공정한 죽음" 원칙 유지. (재진입 위치 폴백 없음.)

## Dependencies

### 업스트림 의존 (Round Manager가 소비)

| 시스템 | 의존 내용 | 상태 |
|--------|----------|------|
| `grid-explosion` | `GATE_PERIOD` 상수, 셀별 `nextExplosionTime(i)` 쿼리 API, 폭발 이벤트 버스 | ✅ 작성 완료 |
| `player-movement` | `PLAYER_KILLED` 이벤트, `PLAYER_ARRIVED { playerId, cell: CellCoord, timestamp }` 이벤트, `totalPlayers` | ✅ 작성 완료 |
| `pattern-library` | (간접) 패턴 선택 결과가 `nextExplosionTime` 값에 영향 — 직접 의존 없음 | ✅ 작성 완료 |

### 다운스트림 의존 (Round Manager가 발행, 타 시스템이 소비)

| 시스템 | 소비 이벤트 | 상태 |
|--------|------------|------|
| `HUD` | `ROUND_STARTED`, `ROUND_CLEAR`, `GAME_OVER`, `ALIVE_COUNT_CHANGED`, `timeRemaining` | ⚠️ 미작성 |
| `fair-feedback` | `PLAYER_KILLED` (공유 구독 — round-manager가 발행하지 않음, 직접 의존 없음) | ✅ 작성 완료 |
| `audio` | `ROUND_CLEAR`, `GAME_OVER` | ⚠️ 미작성 |
| `WebSocket/네트워킹` | `ROUND_STARTED`, `ROUND_CLEAR`, `GAME_OVER`, `GOAL_PLACED` (멀티플레이어 동기화) | ⚠️ 미작성 |

### 양방향 계약 요약

- `grid-explosion` → round-manager: `nextExplosionTime(cell: CellCoord): seconds` 공개 API 확정 ✅ (grid-explosion A-8 추가됨).
- `player-movement` → round-manager: `PLAYER_ARRIVED { playerId, cell: CellCoord, timestamp }` 이벤트 계약 확정 ✅ (player-movement에 추가됨).
- round-manager → HUD: `GOAL_PLACED` 이벤트 소비자는 HUD. HUD Dependencies에 양방향 반영 필요 (HUD 미설계).

## Tuning Knobs

| 변수 | 기본값 | 안전 범위 | 영향 게임플레이 |
|------|--------|----------|----------------|
| `ROUND_TIME_LIMIT` | 60s | 30s – 120s | 라운드 긴장감. 낮을수록 압박↑, 높을수록 여유↑. 30s 미만 시 Goal Cell 도달 불가 위험. |
| `ROUND_CLEAR_DISPLAY_DURATION` | 1500ms | 800ms – 3000ms | 클리어 순간 감동 여운. 800ms 미만 시 전환이 너무 빠름 — 부활 확인 불가. |
| `CHEER_COOLDOWN` | `GATE_PERIOD` (2.0s) | 1.0s – 4.0s | 스펙테이터 응원 빈도. GATE_PERIOD와 동기화 권장 — 폭발 사이클과 응원 박자를 맞춤. |
| `SPECTATOR_ANNOTATION_LOOKAHEAD` | 1 cycle | 1 – 2 cycles | 패턴 어노테이션이 몇 사이클 앞을 표시할지. 2 이상 시 정보 과잉 위험. |
| `GOAL_CELL_FALLBACK_THRESHOLD` | `GATE_PERIOD` (2.0s) | 0.5s – `GATE_PERIOD` | Goal Cell 배치 예외 판단 기준 시간. 낮을수록 N-1 사용 빈도↑. |

## Visual/Audio Requirements

### Visual

- **Goal Cell**: Toss Coral `#FF6B35` 펄스 글로우, 1.0Hz. 일반 셀·경고 셀과 즉시 구분 가능해야 함.
- **스펙테이터 응원 이펙트**: 마지막 위치 셀에 플레이어 고유 색상 파티클 버스트, 불투명도 80%, 지속 0.4s.
- **패턴 어노테이션 오버레이**: 다음 사이클 폭발 예정 셀에 Danger Cyan `#00E5CC` 40% 오버레이. 스펙테이터에게만 표시.
- **ROUND_CLEAR 화면**: 풀스크린 오버레이 — 부활하는 플레이어 아이콘 애니메이션 포함. 1500ms 자동 종료.
- **GAME_OVER 화면**: 풀스크린 오버레이 — 라운드 수 + 최고 생존 기록 표시.
- **라운드 타이머**: 잔여 시간 10s 이하 시 흰색 → 노란색 → 빨간색 색상 전환.

### Audio

| 이벤트 | 사운드 | 최대 길이 |
|--------|--------|---------|
| `ROUND_STARTED` | 상승 차임 | ≤0.3s |
| `ROUND_CLEAR` | 빅토리 스팅 | ≤1.5s |
| `GAME_OVER` | 게임오버 스팅 | ≤2.0s |
| 스펙테이터 응원 | 군중 응원 SFX | ≤0.5s |
| Goal Cell 활성 | 서틀 루프 톤 | 라운드 내내 |

## UI Requirements

- **Goal Cell 인디케이터**: 그리드 내 N-1(또는 N-2) 셀 위에 아이콘/글로우 오버레이. 항상 표시.
- **생존자 수 HUD**: `ALIVE_COUNT_CHANGED` 수신 시 즉시 갱신. 표시 형식: "생존 N명".
- **라운드 타이머 HUD**: 화면 상단 또는 코너. 형식: 정수 초(초 단위) 또는 "MM:SS". 10s 이하 색상 전환.
- **ROUND_CLEAR 오버레이**: 풀스크린, 터치 차단. 1500ms 후 자동 닫힘 (탭 불필요).
- **GAME_OVER 오버레이**: 풀스크린, 터치 차단. "다시 하기" 버튼(새 세션) + 라운드 수 요약.
- **스펙테이터 HUD**: "SPECTATING" 배지 + 응원 안내 텍스트. 화면 전체 탭 영역이 응원 입력.
- **스펙테이터 어노테이션**: 그리드 위 반투명 오버레이 레이어 — 그리드 폭발 레이어 위, HUD 아래.

## Acceptance Criteria

### BLOCKING (자동화 필수)

| ID | 조건 |
|----|------|
| AC-RM-01 | `ROUND_STARTED` 는 라운드당 정확히 1회 발행된다. `GOAL_PLACED` 는 동일 프레임 내 후속 발행. |
| AC-RM-02 | `nextExplosionTime(N-1) ≥ GATE_PERIOD` 시 Goal Cell은 N-1에 배치된다. |
| AC-RM-03 | `nextExplosionTime(N-1) < GATE_PERIOD` 시 Goal Cell은 N-2에 배치된다. |
| AC-RM-04 | `ROUND_CLEAR` 는 생존 플레이어가 goalCellIndex에 도달할 때만, 정확히 1회 발행된다. |
| AC-RM-05 | `ROUND_CLEAR` 후 모든 스펙테이터 + 생존자는 다음 라운드 `ALIVE`로 마킹된다. |
| AC-RM-06 | `ROUND_END` 는 `ROUND_CLEAR` 로부터 `ROUND_CLEAR_DISPLAY_DURATION`(1500ms ±50ms) 후 발행된다. |
| AC-RM-07 | `ALIVE_COUNT = 0` 시 `GAME_OVER` 가 발행된다. |
| AC-RM-08 | 타이머 만료 시(`timeRemaining ≤ 0`, state == ROUND_ACTIVE) `GAME_OVER` 가 발행된다. |
| AC-RM-09 | 두 GAME_OVER 트리거가 동시 발생해도 `GAME_OVER` 이벤트는 1회만 발행된다. |
| AC-RM-10 | 사망 플레이어는 `PLAYER_KILLED` 수신 후 1프레임 내 `SPECTATOR` 상태로 전환된다. |
| AC-RM-11 | 스펙테이터 응원은 `currentTime - lastCheerTime < CHEER_COOLDOWN` 시 차단된다. |
| AC-RM-12 | `ROUND_CLEAR` 후 다음 `ROUND_STARTED` 시 스펙테이터는 경로 시작점(`pathCells[0]: CellCoord`)에서 `ALIVE`로 복귀한다. |
| AC-RM-13 | `PLAYER_KILLED` 발행 후 `ALIVE_COUNT_CHANGED` 가 즉시 발행된다. |
| AC-RM-14 | `ROUND_CLEAR_DISPLAY` 상태에서 수신된 `PLAYER_KILLED` 는 무시된다 (상태 변경 없음). |
| AC-RM-15 | `timeRemaining` 은 `ROUND_STARTED` 시점부터 `ROUND_TIME_LIMIT` → 0 으로 정확히 감소한다. |

### ADVISORY (수동 검증)

| ID | 조건 |
|----|------|
| AC-RM-16 | Goal Cell은 다른 모든 셀 상태(일반·경고·폭발)와 즉시 구분 가능한 비주얼을 가진다. |
| AC-RM-17 | ROUND_CLEAR 화면에서 부활하는 캐릭터 아이콘이 1500ms 내 표시된다. |
| AC-RM-18 | 스펙테이터 패턴 어노테이션이 실제 다음 사이클 폭발 예정 셀과 일치한다. |
| AC-RM-19 | 라운드 타이머 색상 전환(흰→노랑→빨강)이 10s 이하에서 명확히 인지된다. |

## Open Questions

**OQ-RM-1** — ~~`nextExplosionTime(i)` 쿼리 API 계약~~ **해소 (2026-04-21)**
`nextExplosionTime(cell: CellCoord): seconds` 공개 API가 grid-explosion.md A-8 섹션에 추가됨. round-manager는 `pathCells[N-1]: CellCoord`를 인자로 전달한다.
**상태: 해소**

**OQ-RM-2** — ~~`onCellArrived(playerId, cellIndex)` 이벤트 계약~~ **해소 (2026-04-21)**
`PLAYER_ARRIVED { playerId, cell: CellCoord, timestamp }` 이벤트가 player-movement.md에 추가됨. `cell`은 `CellCoord = {row: 0-7, col: 0-7}` 타입.
**상태: 해소**

**OQ-RM-3** — 멀티플레이어 동시 Goal Cell 도달 서버 처리
WebSocket 레이턴시 환경에서 EC-RM-3 케이스 발생 빈도 및 서버 타임스탬프 기반 처리 방식 검증 필요.
**우선순위: 중간** — 멀티플레이어 구현 단계 전 확정.

**OQ-RM-4** — `ROUND_TIME_LIMIT` 기본값 및 라운드 에스컬레이션
60s가 실기기 플레이테스트에서 적절한 긴장감을 주는지 미검증. 라운드 진행에 따른 타이머 단축(예: R1=60s, R2=55s, ...)도 미결.
**우선순위: 중간** — 플레이테스트 시 검증.

**OQ-RM-5** — 스펙테이터 패턴 어노테이션과 "공정한 죽음" 균형
어노테이션이 죽은 플레이어에게 살아있는 플레이어보다 더 많은 정보를 제공한다는 점에서 정보 비대칭 발생. on/off 토글 또는 어노테이션 제거 여부 검토 필요.
**우선순위: 낮음** — 스펙테이터 경험 폴리시 단계.
