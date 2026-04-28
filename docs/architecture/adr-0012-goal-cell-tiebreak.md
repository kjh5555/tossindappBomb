# ADR-0012: Goal Cell 동시 도착 Tie-Break — 서버 수신 순서 FIFO

## Status
Accepted

## Date
2026-04-22

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Feature / Scripting |
| **Knowledge Risk** | LOW — 순수 TypeScript 조건 분기. 엔진 API 비의존 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md` |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | AC-TIE-01~04 단위 테스트 통과 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — PLAYER_ARRIVED 이벤트 수신 순서), ADR-0010 (Server Authority — 서버 수신 순서가 canonical truth), ADR-0011 (RoundManager FSM — phase guard가 두 번째 도착을 자동 차단) |
| **Enables** | 없음 (EC-RM-3 완전 해소) |
| **Blocks** | RoundManager 다중 플레이어 Goal Cell 처리 구현 |
| **Ordering Note** | ADR-0011 (RoundManager FSM) 작성 후 작성. phase guard가 이 ADR의 핵심 enforcement 메커니즘임 |

## Context

GRID REAPER는 최대 6인 멀티플레이어 게임이다. 라운드 클리어는 "생존 플레이어 중 최초로 Goal Cell(경로 N-1)에 도달한 플레이어"가 트리거한다(RM-4). 네트워크 레이턴시가 존재하는 환경에서 두 플레이어가 동일 FrameClock 틱에 Goal Cell에 도달할 수 있다 — 특히 GATE_PERIOD가 짧아지는 후반 라운드에서.

**문제**: `PLAYER_ARRIVED` 이벤트 두 건이 서버에 동일 프레임(또는 연속 프레임)에 도착했을 때, RoundManager가 `ROUND_CLEAR`를 두 번 발행하거나 상태 불일치가 발생하는 것을 방지해야 한다.

**GDD 출처**: `design/gdd/round-manager.md` EC-RM-3

> "두 플레이어가 동일 프레임에 N-1 도달. 처리: 서버 수신 순서 기준으로 먼저 처리된 플레이어가 클리어 트리거. 두 번째는 이미 ROUND_CLEAR 상태이므로 추가 이벤트 없이 무시한다."

**아키텍처 리뷰 TR 추적**: TR-roundmanager-003 (EC-RM-3 처리)

## Decision

**서버 수신 순서 FIFO — 두 번째 도착은 FSM phase guard로 자동 차단.**

RoundManager는 `PLAYER_ARRIVED` 핸들러 진입 시 `this.phase === 'ROUND_ACTIVE'` 를 검사한다(ADR-0011 구현). 첫 번째 도착이 `ROUND_CLEAR` → `ROUND_CLEAR_DISPLAY` 전환을 완료하면, 두 번째 `PLAYER_ARRIVED`가 도착할 때 phase는 이미 `ROUND_CLEAR_DISPLAY`이므로 guard가 조기 return한다. 추가 로직 불필요.

**비기(tie) 개념 없음**: 클라이언트와 서버 모두 "두 명이 동시에 클리어했다"는 상태를 노출하지 않는다. 서버 수신 순서상 먼저 처리된 한 명이 클리어하고, 두 번째 플레이어는 그 라운드의 생존자로 포함된다(스펙테이터가 아닌 살아있는 플레이어이므로, ROUND_CLEAR 시 전원 부활 처리에 포함됨).

**서버 권위 보장(ADR-0010)**: 클라이언트는 `PLAYER_ARRIVED`를 로컬에서 예측하지 않는다. 서버가 이벤트를 수신하고 RoundManager가 처리한 결과만 canonical하다. 클라이언트는 서버가 발행한 `ROUND_CLEAR`를 수신했을 때 클리어 연출을 시작한다.

## Consequences

### 긍정적 결과
- **Zero-code tie-break**: 추가 tie-break 로직이 필요 없다. ADR-0011의 phase guard가 자동으로 처리.
- **단순한 서버 모델**: 서버는 PLAYER_ARRIVED를 수신 순서대로 처리하면 된다. 동시성 처리 로직 없음.
- **공정성 불변**: 두 클라이언트 모두 최선의 이동을 했음. 네트워크 레이턴시 차이가 유일한 결정 요인 — "공정한 죽음" 원칙과 동등하게 취급.

### 부정적 결과
- **레이턴시 종속**: OQ-7(WebSocket 실기기 레이턴시) 미해소 시, 동일 프레임 도착 빈도가 예상보다 높을 수 있다. 플레이테스트로 검증 필요.
- **클라이언트 시각적 불일치**: 두 클라이언트가 각자 "내가 먼저 도달했다"고 로컬에서 인지할 수 있다. 서버가 ROUND_CLEAR를 발행하면 한 명은 클리어 연출, 다른 한 명은 클리어된 라운드의 생존자로 처리됨 — 짧은 시각적 불일치가 발생할 수 있다. 허용 가능한 수준으로 판단하며, Presentation layer에서 완화 가능.

## Alternatives Considered

### A. 타임스탬프 기반 정렬 (PLAYER_ARRIVED.timestamp 비교)

`PLAYER_ARRIVED { playerId, cell, timestamp }` 이벤트에는 클라이언트 타임스탬프가 포함된다. 이를 비교해 더 이른 타임스탬프를 가진 플레이어를 클리어 플레이어로 결정하는 방안.

**기각 이유**: 클라이언트 클록은 신뢰할 수 없다(ADR-0010 Server Authority). 클라이언트 타임스탬프를 클리어 결정에 사용하면 클락 조작이나 시스템 클록 차이로 결과가 왜곡될 수 있다. PLAYER_ARRIVED.timestamp는 fair-feedback 시스템(ADR-0015)의 참고 데이터이지 판정 데이터가 아니다.

### B. "두 명 동시 클리어" 처리 (dual-clear)

두 플레이어 모두 클리어로 처리하고 클리어 카운트를 증가시키는 방안.

**기각 이유**: GDD RM-4가 "최초로 도달한 플레이어"를 명시한다. 동시 클리어는 GDD 계약 위반. 또한 클리어 카운트 또는 스코어 시스템이 없는 현재 구조에서 의미 없다.

### C. 별도 tie-break 큐 (동시 도착 이벤트를 버퍼링 후 정렬)

동일 FrameClock 틱에 도착한 PLAYER_ARRIVED를 버퍼에 모아 정렬 후 처리.

**기각 이유**: 복잡도 대비 이득 없음. 서버 수신 순서는 이미 FrameClock 결정론적 처리 흐름(ADR-0002)에서 직렬 처리된다. 추가 버퍼링은 레이턴시만 늘린다.

## Implementation Guidelines

### RoundManager.onPlayerArrived() — 기존 phase guard가 전부

```typescript
// src/features/round/RoundManager.ts
onPlayerArrived(event: PlayerArrivedEvent): void {
  // ADR-0011 phase guard — 두 번째 동시 도착 자동 차단
  if (this.phase !== 'ROUND_ACTIVE') return;

  const { playerId, cell } = event;
  if (!coordEqual(cell, this.goalCell)) return;  // Goal Cell이 아닌 도착 무시

  // 첫 번째 도착자만 이 라인에 도달
  this.triggerRoundClear(playerId);
}

private triggerRoundClear(clearerId: PlayerId): void {
  if (this.phase !== 'ROUND_ACTIVE') return;  // dedup guard (EC-RM-4)

  this.phase = 'ROUND_CLEAR_DISPLAY';
  // 전원(스펙테이터 포함) 다음 라운드 ALIVE 마킹
  this.markAllAliveForNextRound();
  this.eventBus.emit('ROUND_CLEAR', { clearerId, roundNumber: this.roundNumber });
  // ROUND_CLEAR_DISPLAY 타이머 시작 (ADR-0011 F-RM-4)
  this.frameClock.schedule(ROUND_CLEAR_DISPLAY_DURATION, () => this.onClearDisplayExpired());
}
```

**규칙**:
- `onPlayerArrived`에 별도 tie-break 분기 추가 금지 — phase guard가 유일한 enforcement
- `PLAYER_ARRIVED.timestamp` 비교 로직 추가 금지 (클라이언트 클록 불신뢰)
- `markAllAliveForNextRound()`는 클리어 시점 생사 상태와 무관하게 전원을 포함 — 이미 죽은 스펙테이터도 포함

### 서버 처리 순서 보장

Node.js 서버(ADR-0010)는 단일 스레드 이벤트 루프를 통해 `PLAYER_ARRIVED` 메시지를 직렬 처리한다. 추가 동기화 메커니즘 불필요. 이 특성은 ADR-0010의 Node.js 선택에 명시적으로 의존한다.

## GDD Requirements Addressed

| TR-ID | GDD | 요구사항 | 처리 방식 |
|-------|-----|---------|---------|
| TR-roundmanager-003 | round-manager.md | EC-RM-3: 동시 Goal Cell 도착 | phase guard FIFO |

## Validation Criteria

- **AC-TIE-01**: 두 `PLAYER_ARRIVED` 이벤트가 동일 FrameClock 틱에 도착해도 `ROUND_CLEAR`는 단 1회만 발행된다
- **AC-TIE-02**: 두 번째 `PLAYER_ARRIVED`는 `ROUND_CLEAR` 발행 없이 무시된다 (상태 변경 없음)
- **AC-TIE-03**: 두 플레이어 모두 다음 라운드에 `ALIVE`로 마킹된다 (`markAllAliveForNextRound` 호출 시 두 번째 도착자 포함)
- **AC-TIE-04**: `PLAYER_ARRIVED.timestamp` 값은 클리어 결정에 사용되지 않는다 (단위 테스트: timestamp가 다른 두 이벤트도 수신 순서로 처리됨을 검증)
