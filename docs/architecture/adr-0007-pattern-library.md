# ADR-0007: Pattern Library 데이터 스키마 + 로딩/선택 전략

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — 순수 TypeScript 타입 및 데이터 구조 결정. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | 각 tier 풀 ≥6 패턴 확인. bfsVerified=true 패턴 전체 BFS 단위 테스트 통과 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (PATTERN_REJECTED, GRID_STALLED 이벤트), ADR-0005 (CellCoord 타입) |
| **Enables** | ADR-0009 (GRID_STALLED 3자 체인 — PatternLibrary 재선택 흐름 포함) |
| **Blocks** | PatternLibrary 구현, GridSimulation 패턴 수신 구현 |
| **Ordering Note** | ADR-0005 확정 후 작성. GridSimulation 구현 전 패턴 데이터 타입 확정 필요 |

## Context

### Problem Statement

패턴 라이브러리는 16개 패턴(T1×6 + T2×5 + T3×5 초기 세트)을 어떤 형식으로 저장하고, 어떻게 런타임에 로드하며, 어떻게 선택하는지 결정되지 않으면:

1. **로딩 불일치**: Cocos `resources.load()` 비동기 로딩은 게임 루프 시작 타이밍 복잡성 증가 → 패턴 로드 전 패턴 요청 시 크래시 또는 방어 코드 필요
2. **타입 안전성 손실**: JSON 파일 직접 사용 시 `CellCoord` 타입 검증 없음 — 빌드 타임 오류 대신 런타임 오류
3. **풀 크기 미확정**: `N_recent = min(3, floor(pool/2))`에서 풀 크기가 충분하지 않으면 항상 동일 패턴 반복 또는 `GRID_STALLED` 오발행

### Constraints

- MVP 범위: 패턴 수 최소화 (T1×6 + T2×6 + T3×6 = 18개 초기 세트)
- 패턴 데이터는 코드 리뷰로 관리 — 별도 콘텐츠 파이프라인 불필요 (MVP)
- BFS 검증은 빌드 타임(단위 테스트)에 완료 → `bfsVerified` 플래그 사전 설정
- OQ-2 (SaveStore 필요 여부): MVP에서 패턴 데이터는 세션 내 메모리 전용 — 저장 불필요

### Requirements

- `PatternRecord` 스키마를 TypeScript 인터페이스로 단일 정의
- `GridSimulation`이 수신하는 `ExplodePattern` 계약 타입 분리
- 로딩 시점: 게임 초기화 동기 완료 — 비동기 없음
- Tier별 풀 크기 ≥6 (N_recent=3 보장, 후보 ≥3 항상 확보)
- 선택 알고리즘: 서버 시드 기준 결정론적 (동일 seed + tier → 동일 패턴)

## Decision

**TypeScript 상수 배열**로 패턴 데이터를 정의하고 `static import`로 로딩한다. 별도 비동기 자산 로딩 없음.

- 패턴 데이터: `src/core/patterns/PatternData.ts` — `PatternRecord[]` 상수 배열
- 선택 로직: `src/core/patterns/PatternLibrary.ts` — `IPatternLibrary` 인터페이스
- BFS 검증: `tests/unit/patterns/pattern_bfs_test.ts` — 빌드 전 실행, `bfsVerified` 플래그 설정 근거

### 데이터 스키마

```typescript
// src/core/patterns/PatternData.ts

import { CellCoord } from '../grid/CellCoord';

export type PatternCategory = 'LINE' | 'CROSS' | 'DIAGONAL' | 'ISLAND' | 'COMPOSITE';
export type PatternSymmetry = 'H' | 'V' | 'BOTH' | 'NONE';

export interface PatternRecord {
  readonly patternId:    string;            // 고유 식별자 (예: "LINE_H_R3_T1")
  readonly cells:        CellCoord[];       // 폭발 셀 좌표 목록
  readonly tier:         1 | 2 | 3;        // 난이도 등급
  readonly category:     PatternCategory;   // 형태 카테고리
  readonly symmetryAxis: PatternSymmetry;   // 대칭 축 ("읽으면 이긴다" 검증 지표)
  readonly bfsVerified:  boolean;           // 빌드 타임 BFS 연결성 검증 통과 여부
}

// GridSimulation이 수신하는 계약 타입
// PatternRecord 전체를 전달하지 않음 — 게임 로직에 불필요한 메타데이터 제거
export interface ExplodePattern {
  readonly cells:     CellCoord[];
  readonly patternId: string;
}

// DifficultyContext — RoundEscalation → PatternLibrary 입력
export interface DifficultyContext {
  readonly tier:        1 | 2 | 3;
  readonly roundNumber: number;
}

// Invariants:
// 1. safeCellCount는 저장하지 않음 — 64 - cells.length로 파생
// 2. bfsVerified=false인 패턴은 선택 후보에서 제외 (런타임 필터)
// 3. Tier별 풀 크기 >= 6 (PatternData.ts 작성 시 준수)
```

### 선택 알고리즘 (Pattern Selection Logic)

```typescript
// src/core/patterns/PatternLibrary.ts

export interface IPatternLibrary {
  // 패턴 선택 — DifficultyContext + seed → ExplodePattern
  // 3회 연속 실패 시 GRID_STALLED 발행
  selectPattern(ctx: DifficultyContext, seed: number): ExplodePattern;
}

// 선택 순서 (GDD CR-4, CR-5, CR-6 구현):
// Step 1. tier 필터 + bfsVerified 필터
// Step 2. N_recent 반복 제외 (N_recent = min(3, floor(pool/2)))
// Step 3. 결정론적 선택: candidates[seed % candidates.length]
// Step 4. 런타임 2차 검증:
//         - 64 - cells.length >= 8 (MIN_SAFE_CELLS)
//         - BFS(cells, 8x8) == 단일 연결 구역 (safe cells)
// Step 5. 통과 → ExplodePattern 반환
//         실패 → PATTERN_REJECTED 발행, 재시도
//         3회 연속 실패 → GRID_STALLED 발행
```

### Tier 풀 크기 계약

```
MIN_POOL_PER_TIER = 6

이유:
  N_recent = min(3, floor(6/2)) = min(3, 3) = 3
  최악 후보 수 = 6 - 3 (N_recent) = 3
  → 최소 3개 후보 항상 확보. 선택 가능 상태 유지.

MVP 초기 세트: T1 × 6 + T2 × 6 + T3 × 6 = 18 패턴
```

### Architecture Diagram

```
PatternData.ts (static import)
  PATTERNS: PatternRecord[]
      │
      ▼
PatternLibrary (IPatternLibrary)
  ├── 입력: DifficultyContext { tier, roundNumber } + seed
  ├── 필터: tier + bfsVerified
  ├── 필터: N_recent 반복 제외
  ├── 선택: candidates[seed % candidates.length]
  ├── 검증: safeCellCount >= 8 + BFS
  ├── 성공 → ExplodePattern → GridSimulation
  └── 실패 3회 → GRID_STALLED → EventBus
```

### 로딩 전략

```typescript
// GameRoot.onLoad() 초기화 순서
// (TossBridge.init() 이후, EventBus 이후)

// PatternLibrary는 생성자에서 PATTERNS 배열 정적 참조 — 비동기 없음
const patternLib = new PatternLibrary(eventBus, PATTERNS);

// PATTERNS는 PatternData.ts에서 직접 import:
import { PATTERNS } from './PatternData';
// → 번들 시 포함. 별도 로딩 없음.
```

## Alternatives Considered

### Alternative A: Cocos 자산 파이프라인 (JSON 파일 + resources.load())
- **Description**: `assets/data/patterns.json` 파일로 저장 → `cc.resources.load()` 비동기 로딩
- **Pros**: 코드 배포 없이 콘텐츠 업데이트 가능. 번들 크기 분리.
- **Cons**: 비동기 로딩 → 게임 초기화 시퀀스에 로딩 상태 추가 필요. JSON은 TypeScript 타입 검증 없음 (`CellCoord[]` 런타임에서만 오류 감지). MVP에서 콘텐츠 업데이트 필요 없음.
- **Rejection Reason**: MVP 범위 초과. 비동기 복잡성 대비 이점 없음. 타입 안전성 저하.

### Alternative B: 서버에서 패턴 다운로드
- **Description**: 게임 서버가 매 라운드 `ExplodePattern`을 직접 전송 — 클라이언트는 저장 없음
- **Pros**: 서버 권위 강화. 클라이언트 패턴 데이터 노출 없음.
- **Cons**: WebSocket 레이턴시 의존 → 패턴 수신 전 라운드 시작 지연. OQ-1(서버 구현체 미확정) 상태에서 설계 불가.
- **Rejection Reason**: OQ-1 미해소. 레이턴시 의존은 결정론적 재생(DeathReplay) 설계와 충돌. MVP에서 서버는 seed만 전달, 패턴 선택은 클라이언트 결정론.

## Consequences

### Positive
- TypeScript 타입 검증으로 빌드 타임 `CellCoord` 형식 오류 감지
- 정적 import → 비동기 로딩 상태 없음, 초기화 단순
- BFS 검증을 단위 테스트로 분리 → CI에서 패턴 데이터 품질 자동 게이팅

### Negative
- 패턴 데이터가 코드 번들에 포함 → 패턴 추가/수정 시 빌드+배포 필요
- MVP 18패턴 세트를 실제로 설계해야 함 (T3 패턴 5개 디자인은 OQ-3)

### Risks
- **OQ-3 T3 패턴 미완성**: T3 패턴이 Vertical Slice 전까지 완성되지 않으면 T3 선택 시 `GRID_STALLED` 과다 발생. **Mitigation**: T3 풀 크기 부족 시 T2 패턴으로 폴백하는 임시 로직 또는 T3 구현 전까지 플레이어 수 제한.
- **BFS 런타임 검증 비용**: 64셀 BFS가 60fps 프레임 예산 내 완료되어야 함. **Mitigation**: 실제 런타임 BFS는 비상 폴백용 — `bfsVerified=true` 데이터는 빌드 타임 통과 보장이므로 런타임 BFS 미실행 옵션도 검토.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| pattern-library.md | PatternRecord 스키마 (CR-4, PatternData Schema 섹션) | TypeScript 인터페이스로 GDD 스키마 그대로 구현, CellCoord 타입 적용 |
| pattern-library.md | CR-5 N_recent 반복 제외 공식 | `N_recent = min(3, floor(pool/2))` 선택 알고리즘에 명시 |
| pattern-library.md | CR-6 서버 시드 기준 결정론적 선택 | `candidates[seed % candidates.length]` 공식 |
| pattern-library.md | 3회 연속 실패 → GRID_STALLED | GRID_STALLED 발행 조건 IPatternLibrary 계약에 명시 |

## Performance Implications
- **CPU**: 패턴 선택 = 배열 필터 + 나머지 연산 + BFS(최대 64셀). 매 라운드 1회 <1ms
- **Memory**: 18 PatternRecord × ~64 CellCoord 객체 ≈ 수 KB — 무시 가능
- **Load Time**: 정적 import → 추가 로딩 시간 없음 (번들에 포함)
- **Network**: 없음 (seed만 서버 수신, 패턴 데이터는 클라이언트 로컬)

## Migration Plan
신규 시스템 — 기존 코드 없음. 구현 순서:
1. `src/core/patterns/PatternData.ts` — 18개 패턴 데이터 + 빌드 타임 BFS 검증
2. `tests/unit/patterns/pattern_bfs_test.ts` — 전 패턴 BFS 단위 테스트
3. `src/core/patterns/PatternLibrary.ts` — 선택 로직 구현
4. T3 패턴 완성은 OQ-3 해소 후 진행

## Validation Criteria
- [ ] `PatternData.ts` 내 Tier별 패턴 수 ≥ 6 확인
- [ ] BFS 단위 테스트: 모든 `bfsVerified=true` 패턴에서 `64 - cells.length >= 8` AND safe cell BFS 단일 구역 확인
- [ ] `selectPattern(ctx, seed1) === selectPattern(ctx, seed1)` — 동일 입력 동일 출력 (결정론적)
- [ ] 3회 연속 검증 실패 시 `GRID_STALLED` 이벤트 발행 확인 (mock 주입 테스트)
- [ ] `N_recent` 제외 후 후보 수 ≥ 1 항상 보장 (pool ≥ 6 기준)

## Related Decisions
- ADR-0001: EventBus — PATTERN_REJECTED, GRID_STALLED 이벤트 정의
- ADR-0005: CellCoord — PatternRecord.cells 타입으로 CellCoord[] 사용
- ADR-0009: GRID_STALLED 3자 체인 — PatternLibrary 재선택 흐름의 전체 체인 정의
- `docs/architecture/architecture.md` § Core Layer, § Module Ownership
