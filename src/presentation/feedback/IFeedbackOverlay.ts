/**
 * IFeedbackOverlay.ts
 * FairFeedback 시각 오버레이 추상화 — Cocos cc.Graphics 의존성 격리.
 *
 * Implements: production/sprints/sprint-7+ (TD-P2-03 — FairFeedback / DeathReplay)
 * Governed by: ADR-0015 (DeathReplay Rendering)
 *
 * Real Cocos 구현체 (Sprint 7+ FairFeedbackLayer):
 *   - cc.Graphics 컴포넌트로 Death Rose `#FF3366` fill + stroke
 *   - cc.Node visibility로 활성/비활성 토글
 *   - touch event capture phase 등록 (탭-to-skip)
 *
 * 본 인터페이스는 GRID REAPER가 사용하는 최소 surface만 제공 (showCells/dismiss/onSkipTap).
 */

import type { CellCoord } from '../../core/types/Domain';

export interface IFeedbackOverlay {
  /**
   * 오버레이 표시 — killer cell 좌표로 시각 강조.
   * @param cells — 사망 원인 cell들. 단일 cell도 array로 전달.
   */
  showCells(cells: CellCoord[]): void;

  /** 오버레이 숨김. */
  dismiss(): void;

  /**
   * 사용자 탭 (skip) 알림 핸들러 등록.
   * Cocos 구현은 cc.Node.on('touchstart', ..., true) (capture phase)로 wiring.
   */
  onSkipTap(handler: () => void): void;

  /** 핸들러 등록 해제 (FairFeedback.dispose() 시). */
  offSkipTap(handler: () => void): void;
}
