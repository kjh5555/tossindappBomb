/**
 * ko.ts
 * Korean locale strings.
 *
 * Implements: production/sprints/sprint-7+ (TD-P1-01)
 *
 * 모든 키는 en.ts와 동일하게 유지 (누락 시 fallback). 새 string 추가는 en.ts와 함께.
 */

import type { LocaleMap } from '../ITranslator';

export const ko: LocaleMap = {
  // ─── Lobby ───────────────────────────────────────────────────────────
  'lobby.title': 'GRID REAPER',
  'lobby.tagline': '한 번의 탭, 한 번의 결단',
  'lobby.start': '시작',
  'lobby.settings': '설정',

  // ─── HUD (in-match) ──────────────────────────────────────────────────
  'hud.round': '라운드 {round}',
  'hud.alive': '{count} 생존',
  'hud.time': '{time}초',

  // ─── Result Overlay ──────────────────────────────────────────────────
  'result.game_over': '게임 오버',
  'result.round_clear': '라운드 클리어',
  'result.final_round': '최종 라운드: {round}',
  'result.restart': '재시작',

  // ─── Pause Overlay ───────────────────────────────────────────────────
  'pause.title': '일시정지',
  'pause.resume': '재개',
  'pause.settings': '설정',
  'pause.restart': '다시 시작',
  'pause.restart_confirm': '다시 시작하시겠습니까?',
  'pause.confirm': '확인',
  'pause.cancel': '취소',

  // ─── Settings ────────────────────────────────────────────────────────
  'settings.title': '설정',
  'settings.volume_bgm': '배경 음악',
  'settings.volume_sfx': '효과음',
  'settings.volume_ui': 'UI 효과음',
  'settings.reduced_motion': '모션 감소',

  // ─── Common ──────────────────────────────────────────────────────────
  'common.loading': '잠시만 기다려주세요',
  'common.error': '오류가 발생했습니다',
  'common.retry': '다시 시도',
};
