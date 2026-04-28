/**
 * Cocos wrapper integration tests — Sprint 7 TD-P0-01
 *
 * 4개 wrapper가 cc-mock에 대해 정확히 동작하는지 검증:
 *  - CocosLabel: cc.Label.string getter/setter pass-through
 *  - CocosButton: onClick → cc.Button.node.on(EventType.CLICK, ...) 변환
 *  - CocosOverlayNode: visible ↔ cc.Node.active
 *  - CocosAudioChannel: play / playLooped / stop / volume 매핑
 *
 * 이 테스트가 통과하면 Sprint 7 Cocos Editor 통합 시 wrapper 자체는 검증된 상태.
 * 남은 것은 (1) 실제 cc API 동작 확인 (Editor에서 1회), (2) 노드 binding.
 */

import { Label, Button, Node, AudioSource, AudioClip } from 'cc';
import { CocosLabel } from '../../../src/presentation/cocos/CocosLabel';
import { CocosButton } from '../../../src/presentation/cocos/CocosButton';
import { CocosOverlayNode } from '../../../src/presentation/cocos/CocosOverlayNode';
import { CocosAudioChannel } from '../../../src/presentation/audio/CocosAudioChannel';

// ─── CocosLabel ─────────────────────────────────────────────────────────────

describe('CocosLabel — cc.Label.string pass-through', () => {
  test('초기 string은 cc.Label의 초기값을 그대로 반환', () => {
    const label = new Label();
    label.string = 'initial';
    const wrapper = new CocosLabel(label);

    expect(wrapper.string).toBe('initial');
  });

  test('wrapper.string 설정 시 cc.Label.string도 갱신', () => {
    const label = new Label();
    const wrapper = new CocosLabel(label);

    wrapper.string = 'updated';

    expect(label.string).toBe('updated');
    expect(wrapper.string).toBe('updated');
  });

  test('빈 문자열 설정 가능', () => {
    const label = new Label();
    label.string = 'something';
    const wrapper = new CocosLabel(label);

    wrapper.string = '';

    expect(label.string).toBe('');
  });

  test('IHUDLabel + ILabel 인터페이스 호환 — HUDLayer/ResultOverlay에서 사용 가능', () => {
    const label = new Label();
    const wrapper = new CocosLabel(label);

    // Type-level test — 컴파일이 통과하면 OK
    const asHUDLabel: { string: string } = wrapper;
    asHUDLabel.string = 'hud';
    expect(label.string).toBe('hud');
  });
});

// ─── CocosButton ────────────────────────────────────────────────────────────

describe('CocosButton — IButton ↔ cc.Button.node click events', () => {
  test('onClick 등록 시 cc.Button.node에 핸들러 등록됨', () => {
    const button = new Button();
    const wrapper = new CocosButton(button);
    let fired = 0;

    wrapper.onClick(() => fired++);
    button.node.emit(Button.EventType.CLICK);

    expect(fired).toBe(1);
  });

  test('동일 핸들러 중복 onClick 시 한 번만 등록됨 (idempotent)', () => {
    const button = new Button();
    const wrapper = new CocosButton(button);
    let fired = 0;
    const handler = (): void => {
      fired++;
    };

    wrapper.onClick(handler);
    wrapper.onClick(handler);
    button.node.emit(Button.EventType.CLICK);

    expect(fired).toBe(1);
  });

  test('offClick 시 핸들러 호출되지 않음', () => {
    const button = new Button();
    const wrapper = new CocosButton(button);
    let fired = 0;
    const handler = (): void => {
      fired++;
    };

    wrapper.onClick(handler);
    wrapper.offClick(handler);
    button.node.emit(Button.EventType.CLICK);

    expect(fired).toBe(0);
  });

  test('등록되지 않은 handler offClick은 no-op', () => {
    const button = new Button();
    const wrapper = new CocosButton(button);

    expect(() => wrapper.offClick(() => {})).not.toThrow();
  });

  test('두 개의 다른 핸들러 — 모두 클릭 시 호출됨', () => {
    const button = new Button();
    const wrapper = new CocosButton(button);
    let fired1 = 0;
    let fired2 = 0;

    wrapper.onClick(() => fired1++);
    wrapper.onClick(() => fired2++);
    button.node.emit(Button.EventType.CLICK);

    expect(fired1).toBe(1);
    expect(fired2).toBe(1);
  });

  test('한 핸들러만 offClick 시 다른 핸들러는 계속 동작', () => {
    const button = new Button();
    const wrapper = new CocosButton(button);
    let fired1 = 0;
    let fired2 = 0;
    const h1 = (): void => {
      fired1++;
    };
    const h2 = (): void => {
      fired2++;
    };

    wrapper.onClick(h1);
    wrapper.onClick(h2);
    wrapper.offClick(h1);
    button.node.emit(Button.EventType.CLICK);

    expect(fired1).toBe(0);
    expect(fired2).toBe(1);
  });
});

// ─── CocosOverlayNode ───────────────────────────────────────────────────────

describe('CocosOverlayNode — visible ↔ cc.Node.active', () => {
  test('초기 visible는 cc.Node.active 초기값 (true)', () => {
    const node = new Node();
    const wrapper = new CocosOverlayNode(node);

    expect(wrapper.visible).toBe(true);
  });

  test('visible=false 설정 시 node.active=false', () => {
    const node = new Node();
    const wrapper = new CocosOverlayNode(node);

    wrapper.visible = false;

    expect(node.active).toBe(false);
    expect(wrapper.visible).toBe(false);
  });

  test('visible=true → false → true 토글', () => {
    const node = new Node();
    const wrapper = new CocosOverlayNode(node);

    wrapper.visible = false;
    expect(node.active).toBe(false);

    wrapper.visible = true;
    expect(node.active).toBe(true);
  });

  test('node.active 직접 변경도 wrapper.visible에 반영 (반향)', () => {
    const node = new Node();
    const wrapper = new CocosOverlayNode(node);

    node.active = false;
    expect(wrapper.visible).toBe(false);
  });
});

// ─── CocosAudioChannel ──────────────────────────────────────────────────────

describe('CocosAudioChannel — IAudioChannel implementation', () => {
  function makeChannel(clipMap: Record<string, AudioClip> = {}) {
    const source = new AudioSource();
    const channel = new CocosAudioChannel(source, clipMap);
    return { source, channel };
  }

  test('play(key) — clip이 있으면 cc.AudioSource.playOneShot 호출', () => {
    const explosionClip = new AudioClip('explosion');
    const { source, channel } = makeChannel({ EXPLOSION: explosionClip });

    channel.play('EXPLOSION');

    expect(source.playOneShotCalls).toHaveLength(1);
    expect(source.playOneShotCalls[0].clip).toBe(explosionClip);
  });

  test('play(key) — clip이 없으면 silent fallback (콘솔 경고만)', () => {
    const { source, channel } = makeChannel({});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    channel.play('MISSING_KEY');

    expect(source.playOneShotCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('playLooped(key) — stop → clip 할당 → play 순서', () => {
    const bgmClip = new AudioClip('bgm-main');
    const { source, channel } = makeChannel({ BGM_MAIN: bgmClip });

    channel.playLooped('BGM_MAIN');

    expect(source.stopCallCount).toBe(1);
    expect(source.clip).toBe(bgmClip);
    expect(source.loop).toBe(true);
    expect(source.playCalls).toHaveLength(1);
  });

  test('playLooped(key) — clip 없으면 silent fallback', () => {
    const { source, channel } = makeChannel({});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    channel.playLooped('MISSING');

    expect(source.stopCallCount).toBe(0);
    expect(source.playCalls).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('stop() — cc.AudioSource.stop 호출', () => {
    const { source, channel } = makeChannel();

    channel.stop();

    expect(source.stopCallCount).toBe(1);
  });

  test('setVolume / getVolume — cc.AudioSource.volume에 직접 매핑', () => {
    const { source, channel } = makeChannel();

    channel.setVolume(0.4);

    expect(source.volume).toBe(0.4);
    expect(channel.getVolume()).toBe(0.4);
  });

  test('setVolume 0/1 boundary', () => {
    const { source, channel } = makeChannel();

    channel.setVolume(0);
    expect(source.volume).toBe(0);

    channel.setVolume(1);
    expect(source.volume).toBe(1);
  });
});

// ─── Cross-wrapper integration ──────────────────────────────────────────────

describe('Cross-wrapper integration — ResultOverlay-style usage', () => {
  test('CocosLabel + CocosButton + CocosOverlayNode가 ResultOverlay 패턴으로 함께 동작', () => {
    // 이 테스트는 ResultOverlay 자체를 import하지 않고, 그것이 사용하는
    // 인터페이스 패턴이 wrapper 통해 정상 동작하는지 검증.
    const cocosLabel = new Label();
    const cocosButton = new Button();
    const cocosNode = new Node();

    const labelWrapper = new CocosLabel(cocosLabel);
    const buttonWrapper = new CocosButton(cocosButton);
    const nodeWrapper = new CocosOverlayNode(cocosNode);

    // ResultOverlay 패턴 시뮬레이션
    nodeWrapper.visible = false;
    labelWrapper.string = '';

    let restartCalled = 0;
    buttonWrapper.onClick(() => {
      restartCalled++;
      nodeWrapper.visible = false;
      labelWrapper.string = '';
    });

    // 게임 종료 시뮬레이션
    nodeWrapper.visible = true;
    labelWrapper.string = 'Game Over';

    expect(cocosNode.active).toBe(true);
    expect(cocosLabel.string).toBe('Game Over');

    // Restart 클릭
    cocosButton.node.emit(Button.EventType.CLICK);

    expect(restartCalled).toBe(1);
    expect(cocosNode.active).toBe(false);
    expect(cocosLabel.string).toBe('');
  });
});
