/**
 * CocosAudioChannel.ts
 * cc.AudioSource 래핑 — IAudioChannel 인터페이스 구현.
 *
 * Implements: production/sprints/sprint-7 (TD-P0-01)
 * Governed by: ADR-0016 § 2 (3-channel AudioManager), src/presentation/cocos/README.md
 *
 * GRID REAPER는 BGM/SFX/UIFeedback 3개 cc.AudioSource를 별도 인스턴스로 보유.
 * 각 인스턴스를 본 wrapper로 감싸면 MultichannelAudioOutput에서 IAudioChannel
 * 인터페이스로 일관되게 다룰 수 있음.
 *
 * Clip key → cc.AudioClip 매핑은 생성 시점에 주입 (clipMap). MVP에서는 씬
 * 시작 시 모든 클립을 미리 로드해 매핑을 채운다 (ADR-0016 Consequences).
 *
 * Engine note (Cocos 3.8.6):
 *  - playOneShot(clip, volume?): SFX/UIFeedback 일회성 재생 — overlap 가능.
 *  - play() + clip 할당: BGM 루프 재생. 동일 clip 재할당 시 forceUpdate 필요할 수 있음
 *    (3.8.6 setSharedMaterial 이슈와 동일 패턴 — VERSION.md 참조). 본 wrapper는
 *    안전을 위해 stop() → clip = newClip → play() 순서로 명시 처리.
 */

import { AudioSource, AudioClip } from 'cc';
import type { IAudioChannel } from './IAudioChannel';

export class CocosAudioChannel implements IAudioChannel {
  /**
   * @param source  - cc.AudioSource 컴포넌트 (씬에서 노드 부착)
   * @param clipMap - clipKey → cc.AudioClip 사전 매핑. 누락된 키는 silent fallback.
   */
  constructor(
    private readonly source: AudioSource,
    private readonly clipMap: Record<string, AudioClip>,
  ) {}

  /** 일회성 재생 (SFX/UIFeedback). 누락된 클립은 콘솔 경고 후 무시. */
  play(clipKey: string): void {
    const clip = this.clipMap[clipKey];
    if (!clip) {
      // eslint-disable-next-line no-console
      console.warn(`[CocosAudioChannel] missing clip for key '${clipKey}' — silent fallback`);
      return;
    }
    this.source.playOneShot(clip);
  }

  /** 루프 재생 (BGM). stop() → clip 재할당 → play() 순서로 안정성 확보. */
  playLooped(clipKey: string): void {
    const clip = this.clipMap[clipKey];
    if (!clip) {
      // eslint-disable-next-line no-console
      console.warn(`[CocosAudioChannel] missing clip for key '${clipKey}' — silent fallback`);
      return;
    }
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
