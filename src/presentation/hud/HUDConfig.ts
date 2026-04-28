/**
 * HUDConfig.ts
 * HUD layout/timing constants. Loaded from data file at runtime in production builds.
 *
 * Implements: production/epics/hud/story-001-round-state-display.md
 * Governed by: ADR-0016 (HUD Safe Area + Audio)
 *
 * NOTE: Per coding standards, gameplay values must be data-driven. These exports
 * serve as the canonical defaults referenced by config loaders.
 */

/** Round duration in seconds. round-manager.md F-RM-5 specifies 60s. */
export const ROUND_TIME_LIMIT = 60.0;

/** Format the remaining time for the timer label (one decimal place + 's' suffix). */
export function formatTime(remainingSeconds: number): string {
  return `${remainingSeconds.toFixed(1)}s`;
}
