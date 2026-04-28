/**
 * FairFeedback.ts
 * Death Replay 오버레이 logic — PLAYER_KILLED 수신 시 killer cell 강조 + 700ms 자동 해제.
 *
 * Implements: production/sprints/sprint-7+ (TD-P2-03 closing)
 * Governed by:
 *   ADR-0015 (DeathReplay Rendering — 700ms timer, tap-to-skip, local filter)
 *   ADR-0001 (EventBus subscription)
 *   ADR-0002 (FrameClock.schedule 결정론)
 *
 * 핵심 동작:
 *   1. PLAYER_KILLED 수신 — playerIds에 localPlayerId 포함 시만 trigger (FF-7 — local filter)
 *   2. cellId를 IFeedbackOverlay.showCells로 강조
 *   3. 700ms 후 자동 dismiss (FrameClock.schedule)
 *   4. 사용자 탭 (skip) 시 즉시 dismiss
 *   5. 이미 활성 중이면 새 PLAYER_KILLED 무시 (race 방지)
 *
 * Cocos 통합 시: IFeedbackOverlay 자리에 FairFeedbackLayer (cc.Graphics 기반)를 wire.
 */

import type { IEventBus } from '../../core/events/IEventBus';
import type { IFrameClock } from '../../core/time/IFrameClock';
import type { GameEvents } from '../../core/events/GameEvents';
import type { PlayerId } from '../../core/types/Domain';
import type { IFeedbackOverlay } from './IFeedbackOverlay';

/** ADR-0015 § 3 — 700ms ± 50ms (FrameClock 초 단위). */
export const FEEDBACK_DURATION_SEC = 0.7;

export type DismissReason = 'TIMER' | 'SKIP' | 'DISPOSE';

export class FairFeedback {
  private active: boolean = false;
  /** dismiss 함수 reference — FrameClock.cancelSchedule로 취소 시 사용 (ADR-0002). */
  private scheduledDismissFn: (() => void) | null = null;
  private readonly subscriptions: Array<() => void> = [];
  private readonly skipTapHandler: () => void;

  /**
   * @param bus           - EventBus (PLAYER_KILLED 구독)
   * @param clock         - FrameClock (700ms schedule)
   * @param overlay       - 시각 오버레이 (Cocos FairFeedbackLayer or test fake)
   * @param localPlayerId - 자기 PlayerId — local filter (FF-7). null이면 모든 사망 trigger
   */
  constructor(
    private readonly bus: IEventBus,
    private readonly clock: IFrameClock,
    private readonly overlay: IFeedbackOverlay,
    private readonly localPlayerId: PlayerId | null = null,
  ) {
    const onKilled = (evt: GameEvents['PLAYER_KILLED']): void => this.onPlayerKilled(evt);
    bus.on('PLAYER_KILLED', onKilled);
    this.subscriptions.push(() => bus.off('PLAYER_KILLED', onKilled));

    this.skipTapHandler = (): void => this.dismiss('SKIP');
    overlay.onSkipTap(this.skipTapHandler);
  }

  isActive(): boolean {
    return this.active;
  }

  /** 정리 — 모든 subscription 해제 + 활성 시 dismiss. */
  dispose(): void {
    if (this.active) this.dismiss('DISPOSE');
    for (const off of this.subscriptions) off();
    this.subscriptions.length = 0;
    this.overlay.offSkipTap(this.skipTapHandler);
  }

  private onPlayerKilled(evt: GameEvents['PLAYER_KILLED']): void {
    // Local filter (FF-7) — localPlayerId가 사망자 명단에 없으면 무시
    if (this.localPlayerId !== null && !evt.playerIds.includes(this.localPlayerId)) {
      return;
    }
    // 이미 활성 중이면 새 trigger 무시 (FF-1 race)
    if (this.active) return;

    this.active = true;
    this.overlay.showCells([evt.cellId]);

    // 700ms 후 자동 dismiss — fn reference를 보관하여 취소 가능
    const fn = (): void => this.dismiss('TIMER');
    this.scheduledDismissFn = fn;
    this.clock.schedule(fn, FEEDBACK_DURATION_SEC);
  }

  private dismiss(_reason: DismissReason): void {
    if (!this.active) return;
    this.active = false;
    if (this.scheduledDismissFn) {
      this.clock.cancelSchedule(this.scheduledDismissFn);
      this.scheduledDismissFn = null;
    }
    this.overlay.dismiss();
  }
}
