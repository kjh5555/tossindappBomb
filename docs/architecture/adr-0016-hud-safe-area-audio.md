# ADR-0016: HUD Safe Area 레이아웃 + Audio 채널 분리

## Status
Accepted

## Date
2026-04-22

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Cocos Creator 3.8.6 (TypeScript) |
| **Domain** | Presentation / UI + Audio |
| **Knowledge Risk** | MEDIUM — `cc.AudioSource` / `cc.AudioClip` API 및 webview visibility 이벤트 동작은 3.8.6 실기기 확인 필요 |
| **References Consulted** | `docs/engine-reference/cocos/VERSION.md`, `ADR-0004` (TossBridge.getSafeArea()) |
| **Post-Cutoff APIs Used** | `cc.AudioSource.playOneShot()`, `cc.game.on(cc.Game.EVENT_SHOW/HIDE)` — 3.8.x 동작 확인 필요 |
| **Verification Required** | AC-HUD-01~04 실기기(토스 샌드박스) + 단위 테스트. Safe Area 값이 실제 기기 노치와 일치하는지 확인. 오디오 채널 독립 볼륨 제어 확인 |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (EventBus — 라운드 이벤트 구독), ADR-0003 (Presentation 레이어 경계), ADR-0004 (TossBridge.getSafeArea() — 안전 영역 좌표), ADR-0011 (RoundManager FSM — ROUND_STARTED/CLEAR/END/GAME_OVER 이벤트), ADR-0013 (ALIVE_COUNT_CHANGED — 생존자 카운트) |
| **Enables** | 없음 (최종 Presentation ADR) |
| **Blocks** | HUD 구현, AudioManager 구현 |
| **Ordering Note** | ADR-0015 (FairFeedback 레이어 z-order) 확정 후 작성. HUDLayer z-order가 ADR-0015와 계약됨 |

## Context

GRID REAPER는 Toss 인토스 webview 내에서 실행된다. 두 가지 Presentation 계층 결정이 필요하다:

**HUD Safe Area**: iPhone 노치(상단 44pt), 홈바(하단 34pt) 등 기기별 안전 영역이 HUD 요소를 가릴 수 있다. ADR-0004의 `TossBridge.getSafeArea()`가 이 값을 제공한다. HUD 레이아웃이 이를 어떻게 소비하는가?

**Audio 채널 분리**: 게임 이벤트 SFX(폭발, 라운드 클리어), FairFeedback SFX(피드백 핑), BGM이 독립적으로 볼륨 제어되어야 한다. Cocos Creator `cc.AudioSource`를 어떻게 구성하는가?

**HUD가 구독하는 이벤트** (round-manager.md 계약):
- `ROUND_STARTED` → 라운드 번호 표시, 타이머 시작
- `ALIVE_COUNT_CHANGED` → 생존자 수 표시
- `ROUND_CLEAR` → 클리어 연출 트리거
- `GAME_OVER` → 게임오버 화면 전환
- `timeRemaining` → 카운트다운 업데이트 (틱 이벤트 또는 폴링)

## Decision

### 1. HUD Safe Area — SafeArea 인셋을 HUDLayer 앵커에 직접 적용

`TossBridge.init()` 완료 후 `getSafeArea()`를 한 번 호출하고, 반환된 `{ top, bottom, left, right }` 값을 `HUDLayer` 노드의 ContentSize 및 자식 앵커에 적용한다.

```typescript
// src/presentation/hud/HUDLayer.ts

async initialize(bridge: ITossBridge): Promise<void> {
  const safeArea = bridge.getSafeArea();  // { top: 44, bottom: 34, left: 0, right: 0 }
  this.applyInsets(safeArea);
}

private applyInsets(sa: SafeArea): void {
  // HUDLayer 전체 컨텐트 영역을 safe area 안쪽으로 축소
  const screen = cc.view.getVisibleSize();
  this.node.setContentSize(
    screen.width  - sa.left  - sa.right,
    screen.height - sa.top   - sa.bottom,
  );
  // HUDLayer 원점을 (left, bottom)으로 이동
  this.node.setPosition(sa.left, sa.bottom);
}
```

HUD 자식 노드(라운드 카운터, 생존자 표시, 타이머)는 모두 HUDLayer 로컬 좌표 기준으로 배치 — 절대 화면 좌표 금지.

**z-order 계약** (ADR-0015와 연속):
```
HUDLayer          z: 30  ← 최상위
FairFeedbackLayer z: 20
GridLayer         z: 10
BackgroundLayer   z:  0
```

### 2. Audio 채널 — 3채널 AudioManager

씬에 `AudioManager` 노드를 배치하고 세 개의 `cc.AudioSource` 컴포넌트를 자식 노드로 구성한다.

```
AudioManager
├── BGMSource       (cc.AudioSource, loop: true,  volume: 0.5)
├── SFXSource       (cc.AudioSource, loop: false, volume: 0.8)
└── UIFeedbackSource (cc.AudioSource, loop: false, volume: 0.9)
```

| 채널 | 용도 | 볼륨 기본값 | playOneShot 허용 |
|------|------|-----------|----------------|
| BGM | 배경 음악 — 게임 중 루프 | 0.5 | 아니오 (play/stop) |
| SFX | 게임 이벤트 (폭발, ROUND_CLEAR, GAME_OVER) | 0.8 | 예 |
| UIFeedback | FairFeedback 핑, HUD 알림음 | 0.9 | 예 |

```typescript
// src/presentation/audio/AudioManager.ts

export class AudioManager {
  playBGM(clip: cc.AudioClip): void {
    this.bgmSource.clip = clip;
    this.bgmSource.play();
  }

  stopBGM(): void { this.bgmSource.stop(); }

  playSFX(clip: cc.AudioClip): void {
    this.sfxSource.playOneShot(clip);
  }

  playUIFeedback(clip: cc.AudioClip): void {
    this.uiFeedbackSource.playOneShot(clip);
  }
}
```

### 3. AUDIO_EVENT 라우팅

FairFeedback 시스템이 발행하는 `AUDIO_EVENT`를 AudioManager가 소비하여 채널에 라우팅한다.

```typescript
// AudioManager EventBus 구독
this.eventBus.on('AUDIO_EVENT', (e: AudioEventPayload) => {
  switch (e.channel) {
    case 'SFX':         this.playSFX(e.clip);         break;
    case 'UI_FEEDBACK': this.playUIFeedback(e.clip);  break;
    case 'BGM':         this.playBGM(e.clip);         break;
  }
});
```

**AUDIO_EVENT 페이로드**:
```typescript
interface AudioEventPayload {
  channel: 'BGM' | 'SFX' | 'UI_FEEDBACK';
  clip: cc.AudioClip;       // 미리 로드된 클립 레퍼런스
  volume?: number;          // 선택적 1회성 볼륨 오버라이드
}
```

### 4. Webview 가시성 — BGM 일시정지/재개

Toss webview가 백그라운드로 전환될 때 BGM이 계속 재생되는 것을 방지한다.

```typescript
// AudioManager.onLoad()
cc.game.on(cc.Game.EVENT_HIDE, () => this.bgmSource.pause(), this);
cc.game.on(cc.Game.EVENT_SHOW, () => this.bgmSource.resume(), this);
```

**검증 필요**: `cc.Game.EVENT_HIDE/SHOW`가 Cocos Creator 3.8.6 webview 환경에서 발생하는지 실기기 확인.

### 5. HUD 이벤트 구독

```typescript
// HUDLayer.ts EventBus 구독

this.eventBus.on('ROUND_STARTED', e => {
  this.roundLabel.string = `Round ${e.roundNumber}`;
  this.startCountdown(ROUND_TIME_LIMIT);
});

this.eventBus.on('ALIVE_COUNT_CHANGED', e => {
  this.aliveLabel.string = `${e.aliveCount} alive`;
});

this.eventBus.on('ROUND_CLEAR', () => {
  this.stopCountdown();
  this.showClearBanner();
});

this.eventBus.on('GAME_OVER', () => {
  this.stopCountdown();
  this.showGameOverScreen();
});
```

타이머 카운트다운: `update(dt)` 내 `this.remainingTime -= dt` 후 `timeLabel` 업데이트. FrameClock.simulatedTime 기준.

## Consequences

### 긍정적 결과
- **Safe Area 단일 적용점**: `HUDLayer.applyInsets()` 한 곳에서만 safe area를 처리 — 각 HUD 요소가 개별적으로 safe area를 알 필요 없음.
- **채널 독립 볼륨**: BGM/SFX/UIFeedback을 독립적으로 조절 가능. 플레이테스트 피드백 반영 용이.
- **AUDIO_EVENT 추상화**: FairFeedback/RoundManager가 cc.AudioSource를 직접 접촉하지 않음 — 테스트 시 MockAudioManager 주입 가능.

### 부정적 결과
- **클립 사전 로드 필요**: `cc.AudioClip` 레퍼런스를 AUDIO_EVENT 페이로드에 포함하므로, 발행자가 클립을 미리 로드해야 함. Addressables 유사 로딩 전략 필요 (MVP: 씬 시작 시 전부 로드).
- **cc.Game.EVENT_HIDE 불확실**: webview 환경에서 발생 보장 없음. 미발생 시 BGM이 백그라운드 재생될 수 있으나 MVP에서는 허용 가능한 결함.

## Alternatives Considered

### A. HUD 자식마다 safe area 개별 적용

각 HUD 요소(라운드 카운터, 타이머 등)가 `getSafeArea()`를 직접 호출해 오프셋을 계산.

**기각 이유**: 중복 코드. safe area 값이 변경되면 모든 HUD 요소를 수정해야 함. HUDLayer 단위 인셋 적용이 단일 책임 원칙에 부합.

### B. 글로벌 cc.audioManager 직접 사용 (채널 없음)

`cc.audioManager.playEffect()` / `cc.audioManager.playMusic()`을 각 시스템이 직접 호출.

**기각 이유**: 채널별 볼륨 제어 불가. 테스트 시 모킹 어려움. 발행자가 오디오 구현에 직접 의존하게 됨 — 레이어 경계 위반(ADR-0003).

### C. AudioClip 대신 오디오 이벤트 ID (string key)

페이로드에 `clipId: string`을 전달하고 AudioManager가 내부 클립 맵에서 조회.

**기각 이유**: 타입 안전성 없음. 오타 시 런타임 오류. MVP에서는 cc.AudioClip 직접 전달이 더 단순. 에셋 수가 많아지면 ID 방식으로 전환 고려.

## Implementation Guidelines

**HUD 규칙**:
- `applyInsets()`는 `TossBridge.init()` 완료 직후 한 번만 호출 — 런타임 재호출 금지
- HUD 자식 노드는 HUDLayer 로컬 좌표 기준 배치 — `cc.view.getVisibleSize()` 직접 참조 금지
- `HUDLayer` z-order = 30 고정 (ADR-0015 레이어 계약)
- 텍스트 요소: `cc.Label` 컴포넌트 사용, 절대 픽셀 폰트 크기 하드코딩 금지 (`HUDConfig.ts`에서 읽음)

**Audio 규칙**:
- `cc.AudioClip`은 발행자(FairFeedback, RoundManager)가 미리 로드하여 `AUDIO_EVENT` 페이로드에 포함
- `AudioManager`는 클립 로딩 책임 없음 — 오직 재생 라우팅만
- BGM 클립 교체 시 `stopBGM()` → `playBGM(newClip)` 순서 — 직접 `.clip` 할당 후 `play()` 금지 (ADR-0003 "forbidden: skip API sequence")
- `playOneShot()` 검증 필요: Cocos Creator 3.8.6에서 `cc.AudioSource.playOneShot()` 시그니처 확인

## GDD Requirements Addressed

| TR-ID | GDD | 요구사항 | 처리 방식 |
|-------|-----|---------|---------|
| TR-foundation-004 | (TossBridge) | getSafeArea() HUD 레이아웃 적용 | HUDLayer.applyInsets() |
| (implicit) | round-manager.md | HUD가 ROUND_STARTED/CLEAR/GAME_OVER 소비 | EventBus 구독 |
| (implicit) | fair-feedback.md | AUDIO_EVENT(FEEDBACK_START) UIFeedback 채널 | AudioManager 라우팅 |

## Validation Criteria

- **AC-HUD-01**: 실기기에서 HUDLayer 컨텐트가 기기 노치/홈바 영역을 침범하지 않는다
- **AC-HUD-02**: `StubTossBridge(top=44, bottom=34)`로 HUDLayer 초기화 시 노드 position이 `(0, 34)`, size가 `(screenW, screenH-78)`이다 (단위 테스트)
- **AC-HUD-03**: `ROUND_STARTED` 수신 시 라운드 번호 레이블이 업데이트된다 (단위 테스트)
- **AC-HUD-04**: BGM, SFX, UIFeedback 채널의 볼륨이 독립적으로 설정 가능하다 (단위 테스트)
- **AC-HUD-05**: `cc.Game.EVENT_HIDE` 수신 시 BGM이 일시정지된다 (실기기 확인 — mock 불가)
