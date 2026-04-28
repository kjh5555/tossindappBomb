# 패턴 라이브러리 (Pattern Library)

> **Status**: Draft — Review Pending
> **Author**: 김재현 + agents
> **Last Updated**: 2026-04-21
> **Implements Pillar**: 읽으면 이긴다, 공정한 죽음

## Summary

패턴 라이브러리(Pattern Library)는 GRID REAPER의 **폭발 데이터 공급원(Foundation Layer)**이다. 매 라운드 그리드 폭발 시스템이 "무엇이 터질지"를 처리하기 전에, 이 시스템이 "어떤 패턴으로 터질지"를 결정하고 전달한다. 이 분리 덕분에 그리드 폭발 시스템은 판정 로직에만 집중하고, 패턴의 다양성과 난이도 곡선은 이 시스템이 전적으로 책임진다.

> **Quick reference** — Layer: `Foundation` · Priority: `MVP` · Key deps: 없음 · Depended on by: `그리드 폭발 시스템`, `라운드 에스컬레이션 시스템`

## Overview

패턴 라이브러리는 폭발 패턴 레코드의 정적 집합을 저장하는 데이터 계층이다. 각 레코드는 8×8 그리드 위에서 이번 라운드에 폭발할 셀들의 좌표 목록(`CellCoord[]`)과 고유 식별자(`patternId`)로 구성되며, 그리드 폭발 시스템이 요구하는 `ExplodePattern { cells: CellCoord[], patternId: string }` 스키마를 그대로 준수한다. 라운드 시작 신호를 수신하면 현재 난이도 컨텍스트에 적합한 패턴 1개를 선택하고, 전달 전에 `MIN_SAFE_CELLS = 8` 이상의 Idle 셀 보장 및 BFS 연결성 조건이 충족되는지를 자체 검증한다 — 계약 위반 패턴은 전달하지 않으며, 검증 통과 패턴만 그리드 폭발 시스템으로 전송된다. 이 시스템이 그리드 폭발 시스템과 분리되어 독립적으로 존재하는 이유는 **단일 책임 원칙** 때문이다: 그리드 폭발 시스템은 "어떤 패턴이 왜 선택되었는가"를 알지 못해야 하며, 알 필요도 없다 — 폭발 판정, 상태 기계, 이벤트 발행이라는 판정 책임을 순수하게 유지하기 위해서다. MVP 목표인 20개 패턴은 세 가지 원칙으로 구성된다: **형태 다양성**(직선형·십자형·대각선형·섬 고립형 등 읽기 패턴의 폭), **난이도 기울기**(안전 칸이 넓고 집중된 입문 패턴에서 안전 칸이 분산되고 좁은 고밀도 패턴까지 연속적인 스펙트럼), **"읽으면 이긴다" 검증**(모든 패턴은 패턴 구조를 이해한 플레이어가 안전 칸을 1회 이동 이내로 예측 가능해야 한다).

## Player Fantasy

**리듬이 형상으로 드러난다**

플레이어는 그리드 위에서 시간을 읽는다. 라운드가 시작되면 바닥이 숨을 쉬고, 경고가 피고, 폭발이 온다 — 이것이 리듬이다. 하지만 리듬은 비어 있지 않다. 매 박자마다 죽음은 **형상**을 띠고 나타난다. 십자 모양의 교차, 한쪽으로 쏠린 대각선의 사선, 구석에서 안쪽으로 조여오는 고리. 플레이어가 실제로 마주하는 적은 타이머가 아니라 이 형상들이다. 패턴은 각기 다른 성격을 가진 적이며, 그 성격을 읽어내는 것이 생존의 전부다.

초반 라운드에서 형상은 단정하다. 대칭이고, 넓고, 안전한 칸이 명확하게 남아 있다. 플레이어는 몇 초 만에 "저기는 안전하다"라고 말할 수 있다. 이때의 감정은 **침착한 확신** — 나는 이 형상을 안다, 나는 여기를 빠져나간다. 라운드가 깊어지면 형상이 낯설어진다. 대칭이 무너지고, 안전지대가 좁아지고, 읽는 데 걸리는 시간이 경고 시간을 넘어선다. 플레이어는 자신이 "읽고 있다"는 사실 자체를 의식하게 된다. 불확실성이 들어오고, 시선은 바닥을 훑으며 형상의 논리를 붙잡으려 한다. 이 구간의 감정은 **압박 속의 계산** — 안다고 믿었던 문법이 흔들리고, 대신 순간의 판단이 그 자리를 채운다.

가장 깊은 라운드의 형상들은 다른 결을 가진다. 비대칭이고, 예측의 결을 비껴가고, 여러 형상이 겹쳐 한 박자에 여러 모양을 동시에 읽어야 한다. 이곳에서 플레이어는 더 이상 "안전지대를 찾는다"라고 느끼지 않는다. 대신 몸이 먼저 움직이고, 눈이 뒤따른다. 수십 번의 라운드를 거치며 축적된 형상 기억이 근육에 스며들어 있기 때문이다. 이때의 감정은 **체화된 직감** — 한 번도 본 적 없는 형상조차도, 본 적 있는 형상들의 변주임을 몸이 먼저 안다. 여섯 명 중 넷이 쓰러진 뒤에도 살아남은 자는 이 경지에 닿은 자다.

**앵커 모먼트**: 4라운드, 화면 위에 처음 보는 형상이 떠오른다. 비대칭이고, 중앙의 안전칸이 한 칸뿐이다. 플레이어는 0.3초 사이에 그 한 칸을 본다 — 본다기보다는, 이전 세 라운드에서 익혔던 형상들의 잔상이 그 칸의 자리를 먼저 가리킨다. 몸이 움직이고, 폭발이 주변을 삼킨다. 플레이어는 자신이 왜 거기에 섰는지 설명하지 못한다. 하지만 살아남았다는 것만은 안다. 이것이 패턴을 읽는 자의 승리다.

## Detailed Design

### Core Rules

**CR-1. 불변 정적 저장소**
패턴 라이브러리는 빌드 타임에 정의된 불변 레코드 집합이다. 런타임에 패턴이 추가·수정·삭제되지 않는다.

**CR-2. 난이도 등급 (Tier)**
패턴은 3개 난이도 등급으로 분류된다.

| Tier | 명칭 | 정의 | MVP 패턴 수 |
|------|------|------|------------|
| 1 | 입문 | 안전 구역이 넓고 집중됨. 초반 라운드 전용 | 7개 |
| 2 | 중급 | 안전 구역이 중간 분산. 세션 중반 | 8개 |
| 3 | 고난이도 | 안전 구역이 좁고 분산됨. 세션 후반 | 5개 |

합계 20개. 각 카테고리(LINE/CROSS/DIAGONAL/ISLAND/COMPOSITE)는 Tier별 최소 1개씩 존재해야 한다.

**CR-3. 형태 카테고리 (Category)**

| Category | 정의 |
|----------|------|
| LINE | 가로 또는 세로 직선 폭발 |
| CROSS | 십자형 폭발 |
| DIAGONAL | 대각선 방향 폭발 |
| ISLAND | 안전 구역이 2개 이상으로 분리된 패턴 |
| COMPOSITE | 위 카테고리 2개 이상이 조합된 패턴 |

**CR-4. 자체 검증 의무**
ExplodePattern을 그리드 폭발 시스템에 전달하기 전, 다음 두 조건을 반드시 검증한다.

- 조건 1: `64 - cells.length >= MIN_SAFE_CELLS (= 8)`
- 조건 2: 안전 셀이 BFS 기준 단일 연결 구역을 형성함

검증 실패 → PATTERN_REJECTED `{ patternId, reason, timestamp }` 이벤트 발행 후 재선택.
3회 연속 실패 → GRID_STALLED `{ roundNumber, timestamp }` 이벤트 발행.

빌드 타임 `bfsVerified` 플래그는 1차 가드 (패턴 레코드 품질 보증).
런타임 검증은 2차 가드 — 직전 라운드 DANGER_ZONE 잔류 상태에서의 실효 안전 칸을 확인한다. 두 계층 모두 필수다.

**CR-5. 반복 방지**
직전 N_recent 라운드에서 사용된 `patternId`는 선택 후보에서 제외된다.

`N_recent = min(3, floor(tier_pool_size / 2))`

`tier_pool_size`가 작을 때 N_recent가 자동 축소되어 선택 불가 상황을 방지한다.

**CR-6. 서버 시드 기준 선택**
멀티플레이어 세션에서 모든 플레이어는 동일한 패턴을 수신한다. 패턴 선택의 랜덤성은 라운드 단위 서버 시드 기준이며, 시드는 WebSocket 네트워킹 시스템이 공급한다. 패턴 라이브러리는 시드를 입력받아 결정론적 선택을 수행한다 — 패턴 동기화 책임은 네트워킹 시스템에 있다.

### Pattern Data Schema

```typescript
type CellCoord = { row: number; col: number }; // row, col: 0–7

type PatternCategory = 'LINE' | 'CROSS' | 'DIAGONAL' | 'ISLAND' | 'COMPOSITE';
type PatternSymmetry = 'H' | 'V' | 'BOTH' | 'NONE';

interface PatternRecord {
  patternId:    string;           // 고유 식별자 (예: "LINE_H_R3")
  cells:        CellCoord[];      // 폭발 셀 좌표 목록
  tier:         1 | 2 | 3;       // 난이도 등급
  category:     PatternCategory;  // 형태 카테고리
  symmetryAxis: PatternSymmetry;  // 대칭 축 — "읽으면 이긴다" 검증 지표
  bfsVerified:  boolean;          // 빌드 타임 BFS 연결성 검증 통과 여부
}

// 그리드 폭발 시스템이 수신하는 계약 타입
interface ExplodePattern {
  cells:     CellCoord[];
  patternId: string;
}
```

`safeCellCount`는 저장하지 않는다 — `64 - cells.length`로 파생하며, 저장 시 `cells`와의 불일치 버그 위험이 생긴다.

### Pattern Selection Logic

```
입력: DifficultyContext { tier: 1|2|3, roundNumber: number }, seed: number
출력: ExplodePattern

Step 1. tier 필터 + bfsVerified 필터
        record.tier === tier AND record.bfsVerified === true 인 후보 추출

Step 2. 반복 제외
        N_recent = min(3, floor(후보.length / 2))
        최근 N_recent 라운드 사용 patternId를 후보에서 제거

Step 3. 결정론적 선택
        selected = 후보[seed % 후보.length]

Step 4. 런타임 2차 검증
        64 - selected.cells.length >= 8                        AND
        BFS(selected.cells, 8×8 그리드) == 단일 연결 구역

Step 5. 검증 통과
        → ExplodePattern { cells, patternId } 그리드 폭발 시스템으로 전달

        검증 실패
        → PATTERN_REJECTED { patternId, reason, timestamp } 발행
        → 재시도 횟수 +1, Step 1로 복귀 (다른 후보 선택)

Step 6. 재시도 횟수 >= 3
        → GRID_STALLED { roundNumber, timestamp } 발행
        (그리드 폭발 시스템이 처리 — grid-explosion EC-6 참조)
```

### Interactions with Other Systems

| 방향 | 대상 시스템 | 데이터 | 소유권 |
|------|-----------|--------|-------|
| **입력** | 라운드 에스컬레이션 시스템 | `DifficultyContext { tier, roundNumber }` | 에스컬레이션 시스템 |
| **입력** | WebSocket 네트워킹 시스템 | `seed: number` (라운드 단위 서버 시드) | 네트워킹 시스템 |
| **출력** | 그리드 폭발 시스템 | `ExplodePattern { cells, patternId }` | 패턴 라이브러리 |
| **이벤트 발행** | 그리드 폭발 시스템 | `PATTERN_REJECTED { patternId, reason, timestamp }` | 패턴 라이브러리 |

## Formulas

**F-1. 안전 칸 수 (Safe Cell Count)**

```
N_safe = 64 - |cells|
```

- `|cells|`: PatternRecord.cells 배열의 길이 (폭발 셀 수)
- 유효 범위: N_safe ∈ [8, 56]
  - 하한 8: MIN_SAFE_CELLS 제약 (grid-explosion A-7)
  - 상한 56: 최소 폭발 셀 수 8개 기준
- 예시: cells.length = 30 → N_safe = 34

**F-2. 반복 방지 윈도우 (Recency Window)**

```
N_recent = min(3, floor(tier_pool_size / 2))
```

- `tier_pool_size`: DifficultyContext.tier에 해당하는 유효 패턴 수 (bfsVerified === true만 계산)
- 예시:
  - Tier 1 풀 7개: N_recent = min(3, floor(7/2)) = 3
  - Tier 3 풀 5개: N_recent = min(3, floor(5/2)) = 2
  - 풀 4개(비정상): N_recent = min(3, floor(4/2)) = 2

**F-3. 결정론적 패턴 선택 (Deterministic Selection)**

```
selected_index = seed mod |candidate_pool|
```

- `seed`: 라운드 단위 서버 시드 (WebSocket 네트워킹 시스템 공급)
- `|candidate_pool|`: Step 2 반복 제외 후 남은 후보 수
- 같은 seed + 같은 후보 풀 → 항상 동일한 패턴 선택 → 멀티플레이어 동기화 보장의 전제 조건

**F-4. 커버리지 최소 보장 (Coverage Invariant)**

```
∀ tier ∈ {1, 2, 3},
∀ cat ∈ {LINE, CROSS, DIAGONAL, ISLAND, COMPOSITE}:
  count(tier, cat) >= 1
```

총 15개 슬롯 (5카테고리 × 3티어)의 최소 커버리지 보장.
여유 5개는 ISLAND(Tier 2/3)와 COMPOSITE(Tier 3) 보강에 할당 권고.

**F-5. BFS 연결성 검증 (BFS Connectivity)**

grid-explosion F-6과 동일한 알고리즘을 공유한다.

안전 셀 집합 `S = { (r, c) | (r, c) ∉ cells }` 에 대해:
- `|S| >= 8`
- 임의의 `s₀ ∈ S`에서 BFS 탐색 후 도달 가능한 셀 수 == `|S|`

→ 조건 충족 시 단일 연결 구역 보장 (플레이어 이동 경로 단절 없음)
시간 복잡도: O(64) — 그리드 고정 크기

## Edge Cases

**EC-1. 유효 패턴 풀이 비어있음**
조건: 특정 tier에서 bfsVerified=true인 패턴이 0개
→ Step 1 필터 후 후보 = [] → seed % 0 연산 불가
→ GRID_STALLED 즉시 발행. 재시도 없이 그리드 폭발 시스템으로 전달.
예방: 빌드 타임에 모든 tier가 최소 1개 이상의 bfsVerified=true 패턴을 보유하도록 CI 검증.

**EC-2. 반복 제외 후 후보가 0개**
조건: N_recent 제외 적용 후 후보 풀이 비어짐
→ N_recent를 1씩 줄여 재계산: N_recent-1, N_recent-2, … 0까지 시도
→ N_recent=0에서도 후보 없으면(=EC-1 상황) → GRID_STALLED 발행
이 케이스는 tier_pool_size 기반 N_recent 공식으로 방지하지만, 런타임 bfsVerified 검증에서 풀이 줄어드는 경우 발생 가능.

**EC-3. 런타임 검증 3회 연속 실패**
조건: Step 4에서 3개 후보 모두 검증 실패 (예: DANGER_ZONE 잔류로 실효 안전 칸 < 8)
→ GRID_STALLED { roundNumber, timestamp } 발행
→ 그리드 폭발 시스템이 EC-6 처리 절차에 따라 라운드 스킵 또는 Tier 강등 후 재시도
패턴 라이브러리는 GRID_STALLED 발행 이후 추가 처리를 하지 않는다.

**EC-4. 유효하지 않은 DifficultyContext.tier 값**
조건: tier가 1/2/3 외의 값 (예: 0, 4, undefined)
→ PATTERN_REJECTED { patternId: null, reason: 'INVALID_TIER', timestamp } 발행
→ tier=1로 폴백하여 선택 재시도 1회
에러 로그에 원본 tier 값 기록. 재시도도 실패하면 GRID_STALLED.

**EC-5. 세션 첫 라운드 (roundNumber=1)**
조건: 최근 사용 기록이 없음
→ N_recent 계산에 사용할 최근 patternId 목록이 비어있음
→ Step 2 제외 적용 없이 전체 tier 풀에서 선택 → 정상 작동
예외 처리 불필요 — 빈 최근 기록은 "제외 없음"과 동일하게 처리된다.

**EC-6. bfsVerified=false 패턴이 런타임에서 발견됨**
조건: 빌드 파이프라인 오류로 bfsVerified=false 패턴이 라이브러리에 포함
→ Step 1에서 bfsVerified 필터로 제외됨
→ 모든 패턴이 bfsVerified=false이면 EC-1로 귀결
런타임 2차 검증(Step 4)은 bfsVerified=true임에도 런타임 상태에서 실패하는 케이스의 방어선이다 — bfsVerified=false 패턴의 방어선이 아님.

## Dependencies

### 이 시스템이 의존하는 시스템 (Upstream)

없음 — 패턴 라이브러리는 Foundation Layer다. 다른 게임 시스템에 의존하지 않는다.
패턴 레코드는 빌드 타임에 정의된 정적 데이터이며, 런타임 의존성이 없다.

### 이 시스템에 의존하는 시스템 (Downstream)

| 시스템 | 의존 내용 | 인터페이스 |
|--------|----------|-----------|
| **그리드 폭발 시스템** | 라운드마다 폭발 패턴 수신 | `ExplodePattern { cells, patternId }` |
| **라운드 에스컬레이션 시스템** | DifficultyContext를 공급하여 난이도 기반 패턴 선택 요청 | `DifficultyContext { tier, roundNumber }` |

### 런타임 입력 공급자 (Runtime Providers)

패턴 라이브러리가 런타임에 입력을 받는 시스템. 의존 관계는 아니며, 데이터 공급 계약이다.

| 공급자 | 제공 데이터 | 필요 시점 |
|--------|-----------|---------|
| **라운드 에스컬레이션 시스템** | `DifficultyContext { tier, roundNumber }` | 라운드 시작 신호와 함께 |
| **WebSocket 네트워킹 시스템** | `seed: number` (라운드 단위 서버 시드) | 라운드 시작 신호와 함께 |

### 역방향 문서화 요구사항

- `design/gdd/grid-explosion.md` — Dependencies 섹션에 "패턴 라이브러리 (upstream)" 명시 필요
- `design/gdd/round-escalation.md` (미작성) — Dependencies 섹션에 "패턴 라이브러리 (downstream)" 명시 필요
- `design/gdd/websocket-networking.md` (미작성) — Dependencies 섹션에 "패턴 라이브러리로 seed 공급" 명시 필요

## Tuning Knobs

| 변수 | 현재값 | 안전 범위 | 영향 게임플레이 |
|------|--------|---------|--------------|
| `MIN_SAFE_CELLS` | 8 | 6–12 | 안전 칸 최소 보장. 낮추면 고밀도 패턴 가능, 높이면 난이도 상한 제한. grid-explosion과 공유 상수 — 양쪽 동시 변경 필요. |
| `MAX_RECENT_WINDOW` | 3 (cap) | 2–5 | 반복 방지 강도. 낮추면 패턴 반복 빈도 증가, 높이면 짧은 세션에서 선택 불가 위험. |
| `MAX_RETRY_COUNT` | 3 | 2–5 | 런타임 검증 실패 시 재시도 횟수. 낮추면 GRID_STALLED 빈도 증가, 높이면 라운드 시작 지연. |
| `TIER_DIST_T1` | 7 | 5–10 | Tier 1 패턴 수. 낮추면 초반 다양성 감소, 높이면 후반 풀 상대적 약화. |
| `TIER_DIST_T2` | 8 | 6–10 | Tier 2 패턴 수. 세션 중반 체감 난이도 곡선의 핵심. |
| `TIER_DIST_T3` | 5 | 3–8 | Tier 3 패턴 수. 낮추면 후반 반복 빠르게 발생, 높이면 고난이도 체감 강화. |

### 튜닝 가이드

- **초반 너무 쉬움**: TIER_DIST_T1 감소 또는 Tier 1 패턴 내 `cells.length` 증가 (패턴 데이터 수정)
- **후반 너무 어려움**: TIER_DIST_T3 증가 또는 Tier 3 패턴에 symmetryAxis=H/V 패턴 추가
- **패턴 반복 체감**: MAX_RECENT_WINDOW 증가 (단, tier_pool_size ≥ MAX_RECENT_WINDOW × 2 조건 확인)
- **GRID_STALLED 빈번 발생**: MAX_RETRY_COUNT 증가 또는 MIN_SAFE_CELLS 감소 (단, grid-explosion 동시 변경)

## Visual/Audio Requirements

패턴 라이브러리는 순수 데이터 레이어다. 직접적인 시각/음향 출력이 없다.

패턴 데이터에서 파생되는 시각 표현은 그리드 폭발 시스템의 렌더링 책임이다
(grid-explosion Visual/Audio Requirements 참조). 패턴 라이브러리는
`ExplodePattern { cells, patternId }`만 전달하며, 그 이후의 시각화는 관여하지 않는다.

## UI Requirements

패턴 라이브러리는 플레이어에게 직접 노출되는 UI가 없다.

`patternId`는 디버그 모드 HUD에서 현재 패턴 식별용으로 표시될 수 있으나,
이는 개발 편의 기능이며 HUD 시스템의 구현 책임이다.

## Acceptance Criteria

### BLOCKING (자동화 — CI 또는 단위 테스트)

**AC-PL-1**: 빌드 타임 BFS 검증
모든 PatternRecord.bfsVerified === true. CI 빌드에서 bfsVerified=false 레코드가 1개라도 있으면 빌드 실패.

**AC-PL-2**: 안전 칸 최소 보장
모든 PatternRecord에서 `64 - cells.length >= 8`. 패턴 데이터 로드 시 단위 테스트로 전수 확인.

**AC-PL-3**: MVP 패턴 수 충족
PatternRecord 총 개수 === 20. Tier별: T1=7, T2=8, T3=5.

**AC-PL-4**: 카테고리 커버리지
5개 카테고리(LINE/CROSS/DIAGONAL/ISLAND/COMPOSITE) × 3개 Tier = 15개 슬롯 전부 최소 1개 이상 존재.

**AC-PL-5**: 결정론적 선택
동일 seed + 동일 후보 풀 입력 시, 100회 반복 호출에서 항상 동일한 patternId 반환.

**AC-PL-6**: 반복 방지 작동
N_recent 라운드 내에서 동일 patternId가 연속 선택되지 않음.
tier_pool_size별 N_recent 계산값 검증 (Tier 1: 7개 풀 → N_recent=3, Tier 3: 5개 풀 → N_recent=2).

**AC-PL-7**: PATTERN_REJECTED 이벤트 발행
런타임 검증 실패(조건 1 또는 2 위반) 시 PATTERN_REJECTED { patternId, reason, timestamp } 이벤트 발행 확인.

**AC-PL-8**: GRID_STALLED 이벤트 발행
3회 연속 검증 실패 시 GRID_STALLED { roundNumber, timestamp } 이벤트 발행 확인. 재시도 횟수가 정확히 3회임을 검증.

**AC-PL-9**: 유효하지 않은 Tier 처리
DifficultyContext.tier = 0 입력 시 PATTERN_REJECTED { reason: 'INVALID_TIER' } 발행 후 tier=1 폴백 1회 재시도 확인.

**AC-PL-10**: N_recent 자동 축소
tier_pool_size가 4인 환경에서 N_recent = min(3, floor(4/2)) = 2로 자동 축소되어 선택 불가 상황 미발생.

**AC-PL-11**: ExplodePattern 계약 타입 준수
출력 ExplodePattern이 { cells: CellCoord[], patternId: string } 스키마를 정확히 준수. cells 배열 좌표 모두 row/col ∈ [0, 7] 범위 내.

### ADVISORY (수동 — 플레이테스트)

**AC-PL-12**: "읽으면 이긴다" 패턴 가독성
각 패턴을 처음 보는 플레이어가 T_warn(1.8s) 내에 안전 칸 방향을 결정할 수 있음. 플레이테스트 5인 중 4인 이상 통과 기준.

**AC-PL-13**: 난이도 기울기 체감
Tier 1 → Tier 3으로 갈수록 "어렵다" 체감이 증가함. 플레이테스트 세션 후 설문 확인.

## Open Questions

**OQ-PL-1 (우선순위 높음): 라운드 에스컬레이션 시스템 DifficultyContext 계약 확정**
패턴 라이브러리는 `DifficultyContext { tier, roundNumber }`를 입력으로 전제하나,
라운드 에스컬레이션 시스템 GDD가 아직 미작성이다.
tier 값의 결정 로직 (라운드 번호 → tier 매핑 공식)이 확정되어야
패턴 선택 로직이 실제 라운드 흐름과 정합하는지 검증 가능하다.
→ 해결: `/design-system round-escalation` GDD 작성 시 확정

**OQ-PL-2 (우선순위 중간): seed 공급 타이밍과 멀티플레이어 동기화 보장**
패턴 선택의 결정론은 서버 시드에 의존한다.
WebSocket 네트워킹 시스템 GDD 작성 전까지 "라운드 시작 시 seed가 모든 클라이언트에
동시 브로드캐스트된다"는 전제가 검증되지 않았다.
seed 수신이 지연된 클라이언트는 패턴 선택을 블로킹해야 하는지,
서버가 선택 결과를 직접 푸시하는지가 미확정이다.
→ 해결: `/design-system websocket-networking` GDD의 라운드 시작 메시지 스키마 확정 시 해결

**OQ-PL-3 (우선순위 낮음): GRID_STALLED 이후 Tier 강등 폴백의 책임 주체**
현재 설계: GRID_STALLED 발행 후 그리드 폭발 시스템이 후처리 (grid-explosion EC-6).
그러나 "Tier를 낮춰 재시도"는 실질적으로 DifficultyContext를 수정하는 행위이므로
라운드 에스컬레이션 시스템이 개입해야 할 수도 있다.
→ 해결: 라운드 에스컬레이션 GDD 작성 시 GRID_STALLED 이벤트 핸들러 책임 경계 확정

**OQ-PL-4 (우선순위 낮음): 패턴 회전/반전 변형 (augmentation) MVP 포함 여부**
20개 고정 좌표 패턴은 수십 판 플레이 후 위치 편향 학습 가능성이 있다.
PatternRecord에 `allowTransform: boolean` 필드를 MVP에 심어두면
후속 확장 비용이 최소화된다. MVP 범위에 포함할지 여부 미확정.
→ 해결: `/prototype grid-core` 플레이테스트 후 위치 편향 체감 여부 확인 시 결정
