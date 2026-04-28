# ADR-0005: Cell 좌표 정규화 — CellCoord canonical + CellIndex serialization-only

## Status
Accepted

## Date
2026-04-21

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Core / Scripting |
| **Knowledge Risk** | LOW — 순수 TypeScript 타입 결정. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `CellCoord ↔ CellIndex` 변환 왕복 단위 테스트 (64개 전 셀) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (GameEvents — CellCoord 타입을 이미 페이로드에 사용), ADR-0003 (Core 레이어 귀속 확정) |
| **Enables** | ADR-0006 (GridSimulation gate 타이머 — CellCoord 기반), ADR-0007 (PatternLibrary 셀 오프셋 스키마), ADR-0008 (PlayerMovement 이벤트 페이로드), ADR-0009 (GRID_STALLED 흐름에서 셀 참조) |
| **Blocks** | GridSimulation, PatternLibrary, PlayerMovement 구현 전체 |
| **Ordering Note** | Core 레이어 구현 시작 전 반드시 확정. GameEvents 타입 파일과 동시 작성 |

## Context

### Problem Statement

8×8 그리드에서 셀 위치를 참조하는 방법이 확정되지 않으면:
- 개발자마다 `{row, col}`, `{x, y}`, `{col, row}`, 정수 인덱스 혼용 → **swap 버그** 발생
- WebSocket 직렬화 포맷과 게임 로직 내부 표현이 분리되지 않으면 → 서버-클라이언트 좌표 해석 불일치
- 동일한 셀을 두 표현으로 넘기는 함수 경계에서 타입 오류 미발생 → 런타임 버그

특히 `row` = 행(수직), `col` = 열(수평)의 의미가 `x`(수평), `y`(수직)와 반대이므로 혼용 시 diagonal 패턴이 transposed되어 나타나는 치명적 버그가 발생한다.

### Constraints

- TypeScript 타입 시스템으로 컴파일 타임 강제 가능 — 런타임 오버헤드 없음
- WebSocket 직렬화 시 최소 바이트 크기 선호 (0–63 정수)
- ADR-0001 GameEvents 인터페이스가 이미 `CellCoord` 타입을 참조 중 — 변경 시 ADR-0001 개정 필요

### Requirements

- 단일 canonical 타입으로 모든 게임 로직 내 셀 참조 통일
- 직렬화(WebSocket / 저장)에는 compact 정수 표현 허용
- 두 표현 간 변환 함수를 Core 레이어에서 단일 제공
- row/col 범위 위반(0-7 초과) 감지 가능한 타입 or 런타임 guard

## Decision

**`CellCoord = { row: number; col: number }` 을 게임 로직의 유일한 canonical 표현**으로 채택한다.
`CellIndex = number` (0–63, row*8+col 공식)는 **직렬화 전용** — 게임 로직 내부에서 사용 금지.

### 변환 규칙

```
CellIndex = row * 8 + col        (CellCoord → CellIndex, 직렬화 시)
row       = Math.floor(index / 8) (CellIndex → CellCoord, 역직렬화 시)
col       = index % 8
```

### Architecture Diagram

```
게임 로직 (Core / Feature / Presentation)
  GridSimulation, PlayerMovement, PatternLibrary, RoundManager
  ↕ 모두 CellCoord = {row, col} 사용

직렬화 경계 (WebSocket send / receive)
  송신: CellCoord → CellIndex  (cellToIndex)
  수신: CellIndex → CellCoord  (indexToCell)

저장/로드 경계 (SaveStore)
  동일 패턴: CellCoord ↔ CellIndex 변환 후 저장
```

### Key Interfaces

```typescript
// src/core/grid/CellCoord.ts

export interface CellCoord {
  readonly row: number;   // 0–7 (top=0, bottom=7)
  readonly col: number;   // 0–7 (left=0, right=7)
}

export type CellIndex = number;   // 0–63, row*8+col. 직렬화 전용.

// Invariants:
// 1. 게임 로직 내 모든 셀 참조는 CellCoord 사용. CellIndex는 직렬화 경계에서만 사용.
// 2. row, col 범위: 0–7. 범위 외 값은 isValidCell()로 guard.
// 3. CellIndex 0–63: cellToIndex(indexToCell(n)) === n (왕복 일치).

export function cellToIndex(c: CellCoord): CellIndex {
  return c.row * 8 + c.col;
}

export function indexToCell(index: CellIndex): CellCoord {
  return { row: Math.floor(index / 8), col: index % 8 };
}

export function isValidCell(c: CellCoord): boolean {
  return c.row >= 0 && c.row <= 7 && c.col >= 0 && c.col <= 7;
}

export function cellEquals(a: CellCoord, b: CellCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

// 사용 예시:
// const c: CellCoord = { row: 3, col: 5 };
// const idx: CellIndex = cellToIndex(c);   // 29
// const c2 = indexToCell(idx);             // { row: 3, col: 5 }
// assert(cellEquals(c, c2));               // true
```

## Alternatives Considered

### Alternative B: CellIndex 정수 단일 표현
- **Description**: 게임 로직과 직렬화 모두 `0–63` 정수 사용. row/col 추출은 필요 시 인라인 계산.
- **Pros**: 직렬화 변환 불필요. 배열 인덱스로 직접 사용 가능.
- **Cons**: 함수 인자 순서 오류 감지 불가 (`fn(col, row)` vs `fn(row, col)` 모두 `number`). 패턴 오프셋 계산 시 row/col 의미 상실. 가독성 저하.
- **Rejection Reason**: TypeScript 타입 시스템이 `(row: number, col: number)` 순서 오류를 잡지 못함. swap 버그 방지 불가.

### Alternative C: {x, y} canonical
- **Description**: `x = col` (수평), `y = row` (수직)으로 매핑하여 수학적 좌표계 사용.
- **Pros**: 벡터 연산 라이브러리와 호환 용이.
- **Cons**: 그리드 맥락에서 row/col 언어로 GDD가 작성됨 — x/y로 매핑 시 모든 GDD 읽기에서 정신적 변환 필요. `row=3, col=5`를 `y=3, x=5`로 쓰는 것은 직관에 반함.
- **Rejection Reason**: GDD가 row/col 용어 전제로 작성됨. x/y 매핑은 혼란 가중.

## Consequences

### Positive
- `CellCoord` 구조체가 row/col 의미를 명시 → swap 버그 컴파일 타임 또는 코드 리뷰에서 감지 가능
- `cellToIndex` / `indexToCell` 단일 위치 정의 → 변환 로직 중복 없음
- 단위 테스트에서 64개 전 셀 왕복 검증으로 변환 정확성 보장

### Negative
- WebSocket 송수신마다 `cellToIndex` / `indexToCell` 호출 비용 — 무시 가능 (단순 사칙연산)
- `CellCoord` 객체 생성이 `number` 단일 값보다 약간 더 많은 메모리 사용 — 무시 가능

### Risks
- **GameEvents 타입 불일치**: ADR-0001이 이미 `CellCoord` 타입을 GameEvents 페이로드에 사용 중. 이 ADR이 다른 결정을 내렸다면 ADR-0001 개정 필요. → 현재 결정이 ADR-0001과 일치하므로 변경 없음.
- **8×8 고정 가정**: `CellIndex` 변환이 `row * 8 + col` 공식 — 그리드 크기 변경 시 `CellCoord.ts` 1개 파일만 수정 필요. **Mitigation**: GRID_SIZE 상수화.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| grid-explosion.md | 셀 폭발 타이밍과 위치가 서버-클라이언트 일치해야 함 | CellCoord canonical + CellIndex 직렬화 전용으로 wire format 분리 |
| player-movement.md | 플레이어 이동 목적지가 유효한 셀 범위여야 함 | `isValidCell()` guard로 범위 위반 감지 |
| pattern-library.md | 패턴이 셀 오프셋 배열로 정의됨 | CellCoord 기반 오프셋 표현으로 row/col 의미 보존 |

## Performance Implications
- **CPU**: `cellToIndex` / `indexToCell` 각 2회 사칙연산 — <0.001ms
- **Memory**: `CellCoord` 객체 64개 × 2 숫자 필드 — 무시 가능
- **Load Time**: 없음
- **Network**: `CellIndex` (0–63, 1바이트 정수) → WebSocket 페이로드 최소화 유지

## Migration Plan
신규 시스템 — 기존 코드 없음. `src/core/grid/CellCoord.ts` 파일을 Core 레이어 첫 파일로 생성. 이후 모든 시스템이 이 파일에서 `CellCoord`, `cellToIndex`, `indexToCell` import.

## Validation Criteria
- [ ] 64개 전 셀 `cellToIndex(indexToCell(i)) === i` 단위 테스트 통과
- [ ] `isValidCell({ row: -1, col: 0 })` → false, `isValidCell({ row: 8, col: 0 })` → false
- [ ] `GridSimulation`, `PlayerMovement`, `PatternLibrary` 구현에서 `CellIndex` 타입이 직렬화 경계 외 사용되지 않음 확인
- [ ] WebSocket 메시지 파싱 코드에서 `indexToCell()` 호출 확인 (역직렬화 경계 준수)

## Related Decisions
- ADR-0001: GameEvents — CellCoord 타입이 16개 이벤트 페이로드에 사용됨
- ADR-0003: Layer Boundaries — CellCoord.ts는 Core 레이어 (`src/core/grid/`) 귀속
- ADR-0006: Gate Period — GridSimulation이 CellCoord 기반 셀별 타이머 관리
- `docs/architecture/architecture.md` § Core Layer, § Key Contracts
