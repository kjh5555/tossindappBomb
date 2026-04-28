/**
 * en.ts
 * English locale strings — fallback locale for GRID REAPER.
 *
 * Implements: production/sprints/sprint-7+ (TD-P1-01)
 *
 * 키 명명 규칙: `[screen|category].[purpose]`. 예: 'lobby.start', 'hud.round'.
 * 새 string 추가 시 ko.ts에도 동일 키 추가 필수.
 */

import type { LocaleMap } from '../ITranslator';

export const en: LocaleMap = {
  // ─── Lobby ───────────────────────────────────────────────────────────
  'lobby.title': 'GRID REAPER',
  'lobby.tagline': 'One tap. One decision.',
  'lobby.start': 'START',
  'lobby.settings': 'Settings',

  // ─── HUD (in-match) ──────────────────────────────────────────────────
  'hud.round': 'Round {round}',
  'hud.alive': '{count} alive',
  'hud.time': '{time}s',

  // ─── Result Overlay ──────────────────────────────────────────────────
  'result.game_over': 'Game Over',
  'result.round_clear': 'Round Clear',
  'result.final_round': 'Final Round: {round}',
  'result.restart': 'RESTART',

  // ─── Pause Overlay ───────────────────────────────────────────────────
  'pause.title': 'PAUSED',
  'pause.resume': 'RESUME',
  'pause.settings': 'Settings',
  'pause.restart': 'Restart',
  'pause.restart_confirm': 'Restart match?',
  'pause.confirm': 'CONFIRM',
  'pause.cancel': 'CANCEL',

  // ─── Settings ────────────────────────────────────────────────────────
  'settings.title': 'SETTINGS',
  'settings.volume_bgm': 'BGM',
  'settings.volume_sfx': 'SFX',
  'settings.volume_ui': 'UI Feedback',
  'settings.reduced_motion': 'Reduced Motion',

  // ─── Common ──────────────────────────────────────────────────────────
  'common.loading': 'Loading...',
  'common.error': 'Something went wrong',
  'common.retry': 'Retry',
};
