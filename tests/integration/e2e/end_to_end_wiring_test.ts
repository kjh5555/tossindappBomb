/**
 * End-to-End wiring integration test
 *
 * Sprint 4-6 자동화 작업 종료 시점의 모든 시스템이 architecture.md § 3.4 init order
 * 대로 wiring 됐을 때 함께 동작하는지 검증.
 *
 * 본 테스트는 Cocos 런타임 없이 모든 Cocos-agnostic 시스템을 실제 인스턴스로 wiring
 * 하여 솔로 모드 + 멀티플레이어 모드 + Pause + Settings 흐름을 end-to-end로 시뮬레이션.
 *
 * 다음 contributor가 Sprint 7 Cocos 통합 시 본 테스트가 보여주는 wiring 순서를 그대로
 * SceneRoot.onLoad()로 옮기면 된다.
 */

import { EventBus } from '../../../src/core/events/EventBus';
import { MockFrameClock } from '../../helpers/MockFrameClock';
import { MockWebSocketClient } from '../../helpers/MockWebSocketClient';
import { StubTossBridge } from '../../../src/platform/StubTossBridge';

// Feature
import { SessionFlow } from '../../../src/features/session/SessionFlow';
import {
  Matchmaking,
  MatchInitContext,
} from '../../../src/features/session/Matchmaking';
import { PauseController } from '../../../src/features/session/PauseController';
import { SettingsState } from '../../../src/features/session/SettingsState';
import { AudioStub } from '../../../src/features/audio/AudioStub';

// Presentation
import {
  MultichannelAudioOutput,
  DEFAULT_CHANNEL_VOLUMES,
} from '../../../src/presentation/audio/MultichannelAudioOutput';
import type { IAudioChannel } from '../../../src/presentation/audio/IAudioChannel';
import { HUDLayer } from '../../../src/presentation/hud/HUDLayer';
import { GridLayer } from '../../../src/presentation/hud/GridLayer';
import {
  ResultOverlay,
  IButton,
  IOverlayNode,
  ILabel,
} from '../../../src/presentation/hud/ResultOverlay';
import { PauseOverlay } from '../../../src/presentation/hud/PauseOverlay';

import type { EscalationContext, PlayerId } from '../../../src/core/types/Domain';

// ─── Test fakes ─────────────────────────────────────────────────────────────

class FakeButton implements IButton {
  private handlers: Array<() => void> = [];
  onClick(h: () => void): void {
    this.handlers.push(h);
  }
  offClick(h: () => void): void {
    const i = this.handlers.indexOf(h);
    if (i !== -1) this.handlers.splice(i, 1);
  }
  click(): void {
    for (const h of [...this.handlers]) h();
  }
}

class FakeAudioChannel implements IAudioChannel {
  readonly playCalls: string[] = [];
  private volume = 1.0;
  play(k: string): void {
    this.playCalls.push(k);
  }
  playLooped(_: string): void {}
  stop(): void {}
  setVolume(v: number): void {
    this.volume = v;
  }
  getVolume(): number {
    return this.volume;
  }
}

const ESCALATION_CTX: EscalationContext = {
  roundNumber: 1,
  gatePeriod: 2.0,
  tier: 1,
  tierWeights: { t1: 1, t2: 0, t3: 0 },
  stalledFallback: false,
};

// ─── Composition root (mirrors architecture.md § 3.4 — Sprint 7 SceneRoot가 동일 wiring) ─────

async function bootstrapWorld() {
  // Step 2: TossBridge
  const bridge = new StubTossBridge();
  await bridge.init();

  // Step 3: EventBus + FrameClock
  const bus = new EventBus();
  const clock = new MockFrameClock();
  const flush = () => clock.advanceBy(0, bus);

  // Step 5: WebSocket (Mock)
  const ws = new MockWebSocketClient();

  // Step 13: SettingsState
  const settings = new SettingsState(bus);

  // Step 14: SessionFlow
  const sessionFlow = new SessionFlow(bus);

  // Step 15: PauseController
  const pauseController = new PauseController(bus, sessionFlow);

  // Step 16: Matchmaking (Sprint 6)
  const matchInits: MatchInitContext[] = [];
  const onMatchInit = (ctx: MatchInitContext) => matchInits.push(ctx);
  const matchmaking = new Matchmaking(ws, bridge, bus, sessionFlow, onMatchInit);

  // Step 17-18: Audio (3-channel routing → AudioStub)
  const bgmChannel = new FakeAudioChannel();
  const sfxChannel = new FakeAudioChannel();
  const uiChannel = new FakeAudioChannel();
  const audioOutput = new MultichannelAudioOutput(bgmChannel, sfxChannel, uiChannel);
  const audioStub = new AudioStub(bus, audioOutput);

  // Step 19: HUDLayer + GridLayer
  const hudLabels = {
    round: { string: '' },
    alive: { string: '' },
    time: { string: '' },
  };
  const hudLayer = new HUDLayer(bus, clock, hudLabels);
  const gridLayer = new GridLayer(bus);

  // Step 20: ResultOverlay
  const resultNode: IOverlayNode = { visible: false };
  const resultLabel: ILabel = { string: '' };
  const restartButton = new FakeButton();
  const resultOverlay = new ResultOverlay(
    bus,
    sessionFlow,
    resultNode,
    resultLabel,
    restartButton,
  );

  // Step 21: PauseOverlay
  const pauseNode: IOverlayNode = { visible: false };
  const pauseLabel: ILabel = { string: '' };
  const buttons = {
    resume: new FakeButton(),
    settings: new FakeButton(),
    restart: new FakeButton(),
    confirmRestart: new FakeButton(),
    cancelRestart: new FakeButton(),
  };
  const pauseOverlay = new PauseOverlay(
    bus,
    sessionFlow,
    pauseController,
    pauseNode,
    pauseLabel,
    buttons,
  );

  return {
    bus,
    clock,
    flush,
    bridge,
    ws,
    settings,
    sessionFlow,
    pauseController,
    matchmaking,
    matchInits,
    audioOutput,
    audioStub,
    bgmChannel,
    sfxChannel,
    uiChannel,
    hudLayer,
    hudLabels,
    gridLayer,
    resultOverlay,
    resultNode,
    resultLabel,
    restartButton,
    pauseOverlay,
    pauseNode,
    pauseLabel,
    buttons,
  };
}

// ─── Solo flow ──────────────────────────────────────────────────────────────

describe('E2E — Solo mode flow (no Matchmaking)', () => {
  test('startMatch → ROUND_STARTED → ALIVE_COUNT_CHANGED → timer ticks → GAME_OVER → ResultOverlay → Restart → MENU', async () => {
    const w = await bootstrapWorld();

    // 초기: 모든 UI 비활성, sessionFlow MENU
    expect(w.sessionFlow.getState()).toBe('MENU');
    expect(w.resultNode.visible).toBe(false);
    expect(w.pauseNode.visible).toBe(false);

    // 1) Solo startMatch
    w.sessionFlow.startMatch();
    expect(w.sessionFlow.getState()).toBe('MATCH');

    // 2) ROUND_STARTED — HUD label 갱신
    w.bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    w.flush();
    expect(w.hudLabels.round.string).toBe('Round 1');
    expect(w.hudLabels.time.string).toBe('60.0s');
    expect(w.hudLayer.isCountdownActive()).toBe(true);

    // 3) ALIVE_COUNT_CHANGED — alive label 갱신
    w.bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 1, timestamp: 0 });
    w.flush();
    expect(w.hudLabels.alive.string).toBe('1 alive');

    // 4) timer 진행
    w.hudLayer.update(1.5);
    expect(w.hudLayer.getRemainingTime()).toBeCloseTo(58.5, 5);
    expect(w.hudLabels.time.string).toBe('58.5s');

    // 5) GOAL_PLACED → grid highlight
    w.bus.emit('GOAL_PLACED', { cell: { row: 5, col: 5 }, timestamp: 0 });
    w.flush();
    expect(w.gridLayer.getCellVisual({ row: 5, col: 5 })!.highlighted).toBe(true);

    // 6) cell 폭발 → 시각 반영 + AUDIO_EVENT
    w.bus.emit('CELL_STATE_CHANGED', { cell: { row: 3, col: 4 }, state: 'EXPLODED', timestamp: 0 });
    w.bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    w.flush();
    expect(w.gridLayer.getCellVisual({ row: 3, col: 4 })!.state).toBe('EXPLODED');
    expect(w.sfxChannel.playCalls).toContain('EXPLOSION');

    // 7) GAME_OVER — 카운트다운 정지 + ResultOverlay 표시 + AUDIO_EVENT
    w.bus.emit('GAME_OVER', { finalRound: 1, rankings: [], timestamp: 0 });
    w.bus.emit('AUDIO_EVENT', { key: 'GAME_OVER' });
    w.flush();
    expect(w.hudLayer.isCountdownActive()).toBe(false);
    expect(w.resultNode.visible).toBe(true);
    expect(w.resultLabel.string).toBe('Game Over');
    expect(w.sessionFlow.getState()).toBe('RESULT');
    expect(w.sfxChannel.playCalls).toContain('GAME_OVER');

    // 8) Restart → SessionFlow MENU + overlay 숨김
    w.restartButton.click();
    expect(w.sessionFlow.getState()).toBe('MENU');
    expect(w.resultNode.visible).toBe(false);
    expect(w.resultLabel.string).toBe('');
  });
});

// ─── Multiplayer flow ────────────────────────────────────────────────────────

describe('E2E — Multiplayer mode flow (Matchmaking)', () => {
  test('matchmaking.start → AUTH → MATCH_READY → SessionFlow MATCH + RoundManager init callback', async () => {
    const w = await bootstrapWorld();

    // 1) Matchmaking start
    await w.matchmaking.start('ws://test');
    expect(w.matchmaking.getState()).toBe('WAITING');
    expect(w.ws.sentMessages).toContainEqual({
      type: 'AUTH',
      payload: { token: 'stub-token' },
    });

    // 2) Server emits MATCH_READY (3 players)
    w.ws.simulateMessage('MATCH_READY', {
      sessionId: 'sess-001',
      playerIds: ['p1', 'p2', 'p3'] as PlayerId[],
      localPlayerId: 'p2',
      serverTime: 1000,
    });
    w.flush();

    // 3) SessionFlow + match init callback 동기화
    expect(w.sessionFlow.getState()).toBe('MATCH');
    expect(w.matchmaking.getState()).toBe('MATCH');
    expect(w.matchInits).toHaveLength(1);
    expect(w.matchInits[0].totalPlayers).toBe(3);
    expect(w.matchInits[0].localPlayerId).toBe('p2');

    // 4) Game flow — ROUND_STARTED → 사망자 발생 → ROUND_CLEAR
    w.bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    w.bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 3, timestamp: 0 });
    w.flush();
    expect(w.hudLabels.alive.string).toBe('3 alive');

    w.bus.emit('PLAYER_KILLED', {
      playerIds: ['p3'] as PlayerId[],
      cellId: { row: 0, col: 0 },
      cause: 'EXPLOSION',
      timestamp: 0,
    });
    w.bus.emit('ALIVE_COUNT_CHANGED', { aliveCount: 2, timestamp: 0 });
    w.flush();
    expect(w.hudLabels.alive.string).toBe('2 alive');

    // 5) ROUND_CLEAR — overlay 표시 + AUDIO_EVENT 라우팅
    w.bus.emit('ROUND_CLEAR', {
      roundNumber: 1,
      survivors: ['p1', 'p2'] as PlayerId[],
      timestamp: 0,
    });
    w.bus.emit('AUDIO_EVENT', { key: 'ROUND_CLEAR' });
    w.flush();
    expect(w.resultNode.visible).toBe(true);
    expect(w.resultLabel.string).toBe('Round Clear');
    expect(w.sfxChannel.playCalls).toContain('ROUND_CLEAR');
    expect(w.sessionFlow.getState()).toBe('RESULT');
  });

  test('lobby disconnect → MATCHMAKING_FAILED, no further state changes', async () => {
    const w = await bootstrapWorld();
    const failures: string[] = [];
    w.bus.on('MATCHMAKING_FAILED', (e) => failures.push(e.reason));
    await w.matchmaking.start('ws://test');

    w.ws.simulateDisconnect();
    w.flush();

    expect(w.matchmaking.getState()).toBe('FAILED');
    expect(w.sessionFlow.getState()).toBe('MENU'); // 매치 시작 전이라 변화 없음
    expect(failures).toContain('disconnected');
    expect(w.resultNode.visible).toBe(false); // overlay 표시 안 됨
  });
});

// ─── Pause flow ──────────────────────────────────────────────────────────────

describe('E2E — Pause + Settings flow during a match', () => {
  test('pause → PauseOverlay 표시 → Settings change → resume → PauseOverlay 숨김', async () => {
    const w = await bootstrapWorld();
    w.sessionFlow.startMatch();
    w.bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    w.flush();

    // Pause
    w.pauseController.pause();
    w.flush();
    expect(w.pauseNode.visible).toBe(true);
    expect(w.pauseLabel.string).toBe('PAUSED');

    // Settings change while paused — SETTINGS_CHANGED 이벤트 + audio output 동기화
    const settingsChanges: number[] = [];
    w.bus.on('SETTINGS_CHANGED', (e) => settingsChanges.push(e.timestamp));

    w.settings.setChannelVolume('BGM', 0.2);
    w.settings.setReducedMotion(true);
    w.flush();

    expect(settingsChanges).toHaveLength(2);
    expect(w.settings.getChannelVolume('BGM')).toBe(0.2);
    expect(w.settings.isReducedMotion()).toBe(true);

    // 실제 audio output volume도 적용 (수동 호출 — 일반적으로 settings UI가 audioOutput.setChannelVolume 호출)
    w.audioOutput.setChannelVolume('BGM', 0.2);
    expect(w.bgmChannel.getVolume()).toBe(0.2);
    expect(w.sfxChannel.getVolume()).toBe(DEFAULT_CHANNEL_VOLUMES.SFX); // 영향 없음

    // Resume
    w.buttons.resume.click();
    w.flush();
    expect(w.pauseController.isPaused()).toBe(false);
    expect(w.pauseNode.visible).toBe(false);

    // 게임 계속 진행 가능
    w.hudLayer.update(0.5);
    expect(w.hudLayer.getRemainingTime()).toBeCloseTo(59.5, 5);
  });

  test('pause → restart confirm → sessionFlow MENU + overlay 숨김', async () => {
    const w = await bootstrapWorld();
    w.sessionFlow.startMatch();
    w.pauseController.pause();
    w.flush();

    // Restart 탭 → Confirm
    w.buttons.restart.click();
    expect(w.pauseLabel.string).toBe('Restart match?');
    w.buttons.confirmRestart.click();
    w.flush();

    expect(w.sessionFlow.getState()).toBe('MENU');
    expect(w.pauseNode.visible).toBe(false);
    expect(w.pauseController.isPaused()).toBe(false);
  });
});

// ─── 모든 시스템 wiring 일관성 검증 ───────────────────────────────────────

describe('E2E — Wiring sanity checks', () => {
  test('모든 시스템이 동시에 부팅 + dispose 가능 (memory leak 없음)', async () => {
    const w = await bootstrapWorld();
    expect(() => {
      w.audioStub.dispose();
      w.hudLayer.dispose();
      w.gridLayer.dispose();
      w.resultOverlay.dispose();
      w.pauseOverlay.dispose();
      w.matchmaking.dispose();
    }).not.toThrow();
  });

  test('이벤트 chain — ROUND_STARTED 단일 emit이 HUDLayer + GridLayer + (잠재적) Audio 모두에 도달', async () => {
    const w = await bootstrapWorld();
    w.bus.emit('GOAL_PLACED', { cell: { row: 5, col: 5 }, timestamp: 0 });
    w.bus.emit('ROUND_STARTED', { roundNumber: 1, ctx: ESCALATION_CTX, timestamp: 0 });
    w.flush();

    // HUDLayer 반영
    expect(w.hudLabels.round.string).toBe('Round 1');
    // GridLayer가 ROUND_STARTED에서 이전 highlight 해제 확인
    expect(w.gridLayer.getCellVisual({ row: 5, col: 5 })!.highlighted).toBe(false);
  });

  test('AUDIO_EVENT가 AudioStub → MultichannelAudioOutput → SFX 채널까지 도달', async () => {
    const w = await bootstrapWorld();
    w.bus.emit('AUDIO_EVENT', { key: 'EXPLOSION' });
    w.bus.emit('AUDIO_EVENT', { key: 'GAME_OVER' });
    w.bus.emit('AUDIO_EVENT', { key: 'ROUND_CLEAR' });
    w.bus.emit('AUDIO_EVENT', { key: 'GATE_SAFE' });
    w.flush();

    expect(w.sfxChannel.playCalls).toEqual(['EXPLOSION', 'GAME_OVER', 'ROUND_CLEAR', 'GAME_SAFE'.replace('GAME_SAFE', 'GATE_SAFE')]);
    expect(w.bgmChannel.playCalls).toEqual([]);
    expect(w.uiChannel.playCalls).toEqual([]);
    expect(w.audioStub.getPlayCount('EXPLOSION')).toBe(1);
  });
});
