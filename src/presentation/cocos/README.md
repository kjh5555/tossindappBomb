# Cocos Integration Layer — Sprint 7 Targets

> **Status**: Empty 디렉토리. Sprint 7 통합 작업의 1순위 (TD-P0-01).
> **Engine**: Cocos Creator 3.8.6 (TypeScript)
> **Written**: 2026-04-28 (Sprint 4-6 자동화 작업 완료 후)

---

## 목적

Sprint 5-6 동안 모든 Presentation 레이어 코드(`HUDLayer`, `GridLayer`, `ResultOverlay`, `PauseOverlay`, `MultichannelAudioOutput`)는 **Cocos-agnostic 인터페이스**(`IHUDLabel`, `IButton`, `IOverlayNode`, `IAudioChannel`)에만 의존하도록 작성됨.

이 디렉토리는 **그 인터페이스들을 실제 cc.* API로 wiring하는 thin wrapper들**을 담는다. 각 wrapper는 1:1 mapping이며 비즈니스 로직 없음 — 새 contributor가 한 sprint 내에 작성 가능.

---

## 작성해야 할 5개 wrapper

### 1. CocosLabel.ts

```typescript
import { Label } from 'cc';
import type { IHUDLabel, ILabel } from '../hud/HUDLayer';

/**
 * cc.Label 래핑 — string 속성을 그대로 IHUDLabel/ILabel 인터페이스로 노출.
 * HUDLayer / ResultOverlay / PauseOverlay 모두에서 사용.
 */
export class CocosLabel implements IHUDLabel, ILabel {
  constructor(private readonly label: Label) {}
  get string(): string { return this.label.string; }
  set string(value: string) { this.label.string = value; }
}
```

### 2. CocosButton.ts

```typescript
import { Button, EventHandler } from 'cc';
import type { IButton } from '../hud/ResultOverlay';

/**
 * cc.Button 래핑 — onClick을 Button.node.on(Button.EventType.CLICK, ...) 패턴으로 변환.
 * ResultOverlay (1 button), PauseOverlay (5 buttons) 모두에서 사용.
 */
export class CocosButton implements IButton {
  private handlers = new Map<() => void, () => void>();
  constructor(private readonly button: Button) {}

  onClick(handler: () => void): void {
    const wrapped = () => handler();
    this.handlers.set(handler, wrapped);
    this.button.node.on(Button.EventType.CLICK, wrapped, this);
  }

  offClick(handler: () => void): void {
    const wrapped = this.handlers.get(handler);
    if (wrapped) {
      this.button.node.off(Button.EventType.CLICK, wrapped, this);
      this.handlers.delete(handler);
    }
  }
}
```

### 3. CocosOverlayNode.ts

```typescript
import { Node } from 'cc';
import type { IOverlayNode } from '../hud/ResultOverlay';

/**
 * cc.Node visibility 래핑 — active 속성을 IOverlayNode.visible로 노출.
 */
export class CocosOverlayNode implements IOverlayNode {
  constructor(private readonly node: Node) {}
  get visible(): boolean { return this.node.active; }
  set visible(value: boolean) { this.node.active = value; }
}
```

### 4. CocosAudioChannel.ts

```typescript
import { AudioSource, AudioClip, resources } from 'cc';
import type { IAudioChannel } from '../audio/IAudioChannel';

/**
 * cc.AudioSource 래핑 — 3 채널(BGM/SFX/UIFeedback) 각각 인스턴스 1개.
 *
 * MultichannelAudioOutput이 채널별 AudioKey 라우팅을 담당하므로 이 래퍼는
 * 실제 cc.AudioClip 로딩 + play/playOneShot/stop/setVolume만 처리.
 *
 * NOTE: cc.AudioSource는 3.8.6에서 .play()를 동일 material로 재호출 시 무시될 수 있음.
 *       playOneShot()을 SFX/UIFeedback에서 사용하면 회피됨.
 */
export class CocosAudioChannel implements IAudioChannel {
  constructor(
    private readonly source: AudioSource,
    private readonly clipMap: Record<string, AudioClip>,
  ) {}

  play(clipKey: string): void {
    const clip = this.clipMap[clipKey];
    if (!clip) {
      console.warn(`[CocosAudioChannel] missing clip: ${clipKey}`);
      return;  // silent fallback per S5-S1 contract
    }
    this.source.playOneShot(clip);
  }

  playLooped(clipKey: string): void {
    const clip = this.clipMap[clipKey];
    if (!clip) return;
    this.source.stop();
    this.source.clip = clip;
    this.source.loop = true;
    this.source.play();
  }

  stop(): void {
    this.source.stop();
  }

  setVolume(v: number): void {
    this.source.volume = v;
  }

  getVolume(): number {
    return this.source.volume;
  }
}
```

### 5. SceneRoot.ts (cc.Component)

```typescript
import { _decorator, Component, Node, view, AudioSource, Label, Button, Sprite } from 'cc';
import { EventBus } from '../../core/events/EventBus';
import { FrameClock } from '../../core/time/FrameClock';
import { TossBridge } from '../../platform/TossBridge';   // 또는 StubTossBridge in dev
import { GridSimulation } from '../../core/grid/GridSimulation';
import { PatternLibrary } from '../../core/patterns/PatternLibrary';
import { PlayerMovement } from '../../core/player/PlayerMovement';
import { TouchInputAdapter } from '../../core/input/TouchInputAdapter';
import { RoundManager } from '../../features/round/RoundManager';
import { SessionFlow } from '../../features/session/SessionFlow';
import { PauseController } from '../../features/session/PauseController';
import { SettingsState } from '../../features/session/SettingsState';
import { Matchmaking } from '../../features/session/Matchmaking';
import { AudioStub } from '../../features/audio/AudioStub';
import { MultichannelAudioOutput } from '../audio/MultichannelAudioOutput';
import { HUDLayer } from '../hud/HUDLayer';
import { GridLayer } from '../hud/GridLayer';
import { ResultOverlay } from '../hud/ResultOverlay';
import { PauseOverlay } from '../hud/PauseOverlay';
import { CocosLabel } from './CocosLabel';
import { CocosButton } from './CocosButton';
import { CocosOverlayNode } from './CocosOverlayNode';
import { CocosAudioChannel } from '../audio/CocosAudioChannel';

const { ccclass, property } = _decorator;

/**
 * SceneRoot — composition root following architecture.md § 3.4.
 * 모든 시스템을 wire하고 매 프레임 FrameClock.tick(dt)을 호출.
 * Pause 중에는 tick 호출을 건너뛴다.
 */
@ccclass('SceneRoot')
export class SceneRoot extends Component {
  // ─── Cocos node references (Editor에서 binding) ──────────────────
  @property(Node)           hudNode!: Node;
  @property(Label)          roundLabel!: Label;
  @property(Label)          aliveLabel!: Label;
  @property(Label)          timeLabel!: Label;
  @property(Node)           resultOverlayNode!: Node;
  @property(Label)          resultLabel!: Label;
  @property(Button)         restartButton!: Button;
  @property(Node)           pauseOverlayNode!: Node;
  @property(Label)          pauseLabel!: Label;
  @property(Button)         resumeButton!: Button;
  @property(Button)         pauseSettingsButton!: Button;
  @property(Button)         pauseRestartButton!: Button;
  @property(Button)         confirmRestartButton!: Button;
  @property(Button)         cancelRestartButton!: Button;
  @property(AudioSource)    bgmSource!: AudioSource;
  @property(AudioSource)    sfxSource!: AudioSource;
  @property(AudioSource)    uiSource!: AudioSource;

  // ─── System instances ─────────────────────────────────────────────
  private bus!: EventBus;
  private clock!: FrameClock;
  private pauseController!: PauseController;
  // ... (나머지 시스템들)

  async onLoad(): Promise<void> {
    // Step 1-3: Cocos director / TossBridge / EventBus / FrameClock
    const bridge = new TossBridge();   // 또는 StubTossBridge in dev mode
    await bridge.init();

    this.bus = new EventBus();
    this.clock = new FrameClock(this.bus);

    // Step 4-5: TouchInput / WebSocket  (생략 — 기존 구현 활용)
    // Step 6-9: PatternLibrary / GridSimulation / PlayerMovement / ServerAuthority (기존 wiring)
    // Step 11: RoundManager (생략)

    // Step 13-16: SettingsState / SessionFlow / PauseController / Matchmaking
    const sessionFlow = new SessionFlow(this.bus);
    this.pauseController = new PauseController(this.bus, sessionFlow);
    // (Matchmaking은 모드 분기 시점에 생성)

    // Step 17-18: Audio
    const audioOutput = new MultichannelAudioOutput(
      new CocosAudioChannel(this.bgmSource, /* clipMap */ {}),
      new CocosAudioChannel(this.sfxSource, /* clipMap */ {}),
      new CocosAudioChannel(this.uiSource, /* clipMap */ {}),
    );
    new AudioStub(this.bus, audioOutput);

    // Step 19: HUDLayer + GridLayer
    const hudLabels = {
      round: new CocosLabel(this.roundLabel),
      alive: new CocosLabel(this.aliveLabel),
      time: new CocosLabel(this.timeLabel),
    };
    const hudLayer = new HUDLayer(this.bus, this.clock, hudLabels);
    new GridLayer(this.bus);

    // Step 20: ResultOverlay
    new ResultOverlay(
      this.bus, sessionFlow,
      new CocosOverlayNode(this.resultOverlayNode),
      new CocosLabel(this.resultLabel),
      new CocosButton(this.restartButton),
    );

    // Step 21: PauseOverlay
    new PauseOverlay(
      this.bus, sessionFlow, this.pauseController,
      new CocosOverlayNode(this.pauseOverlayNode),
      new CocosLabel(this.pauseLabel),
      {
        resume: new CocosButton(this.resumeButton),
        settings: new CocosButton(this.pauseSettingsButton),
        restart: new CocosButton(this.pauseRestartButton),
        confirmRestart: new CocosButton(this.confirmRestartButton),
        cancelRestart: new CocosButton(this.cancelRestartButton),
      },
    );

    // Step 22: applyInsets — TossBridge.getSafeArea() 한 번만
    const sa = bridge.getSafeArea();
    const screen = view.getVisibleSize();
    const layout = hudLayer.applyInsets(sa, { width: screen.width, height: screen.height });
    this.hudNode.setPosition(layout.position.x, layout.position.y);
    // setContentSize는 cc.UITransform 사용

    // Step 23: 솔로 모드 startMatch (멀티는 Matchmaking.start)
    sessionFlow.startMatch();
  }

  /** cc.Component update hook — pause 중에는 tick 차단. */
  update(dt: number): void {
    if (this.pauseController?.isPaused()) return;
    this.clock?.tick(dt);
  }
}
```

---

## 작업 절차 (Sprint 7 Day 1-3 권장)

1. **Cocos 프로젝트 환경 확인** — `granite.config.ts` + `package.json` 존재. Cocos Creator Editor 3.8.6 열어서 scene 생성.
2. **위 5개 wrapper 작성** — 각각 별도 파일. 30분 ~ 1시간 작업.
3. **scene/SceneRoot.scene 생성** — Cocos Creator Editor에서:
   - HUDLayer 노드 + 3개 cc.Label 자식 (round/alive/time)
   - GridLayer 노드 + 64개 cc.Sprite cell 자식 (8×8 격자, `cellToPixel`로 위치)
   - ResultOverlay 노드 + Label + Button
   - PauseOverlay 노드 + Label + 5 Button
   - 3개 cc.AudioSource 노드 (BGM/SFX/UIFeedback)
4. **Editor에서 SceneRoot 컴포넌트 부착 + binding** — `@property` 항목에 위 노드들 drag.
5. **`ait dev` 또는 동등 명령으로 Cocos preview 실행** — 솔로 라운드 시작 → HUD 표시 → 폭발 → GAME_OVER → ResultOverlay → Restart 흐름 확인.
6. **AC-HUD-01 (실기기 노치 검증)**: `ait deploy` → Toss 인토스 샌드박스에서 다양한 디바이스 확인.

---

## 통합 후 검증

5개 wrapper 작성 완료 후:
- [ ] Cocos preview에서 솔로 라운드 1회 진행 가능
- [ ] HUD label 3개가 ROUND_STARTED/ALIVE_COUNT_CHANGED/timer 갱신 반영
- [ ] Grid 8×8 표시 + IDLE/EXPLODED 색상 토글
- [ ] GOAL_PLACED → 골 셀 강조
- [ ] GAME_OVER → ResultOverlay 표시 → Restart → 메뉴 복귀
- [ ] Pause 버튼 (HUD) → PauseOverlay 표시 → Resume → 게임 재개
- [ ] Pause 중 FrameClock.tick 차단 확인 (timer 멈춤)
- [ ] AUDIO_EVENT('EXPLOSION') → SFX 채널에서 플레이백
- [ ] BGM 채널 볼륨 변경 → 즉시 반영

위 9개 모두 PASS 시 멀티플레이어(Matchmaking) 통합 시작 가능.

---

## 참조 문서

- `docs/architecture/architecture.md` § 3.4 — 정확한 init order (23-step)
- `docs/architecture/adr-0016-hud-safe-area-audio.md` — HUD/Audio 구현 가이드
- `design/ux/hud.md`, `design/ux/result.md`, `design/ux/pause.md`, `design/ux/settings.md` — UX 스펙
- `docs/tech-debt-register.md` § TD-P0-01 — 본 작업의 정의
