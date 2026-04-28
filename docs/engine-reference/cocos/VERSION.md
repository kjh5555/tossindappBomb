# Cocos Creator — Version Reference

| Field | Value |
|-------|-------|
| **Engine Version** | Cocos Creator 3.8.6 |
| **Release Date** | 2025 (exact date TBD) |
| **Project Pinned** | 2026-04-21 |
| **Last Docs Verified** | 2026-04-21 |
| **LLM Knowledge Cutoff** | May 2025 |
| **Risk Level** | MEDIUM — 3.8.x base is within training data; 3.8.6 specifics may not be |

## Knowledge Gap Warning

The LLM's training data covers Cocos Creator up to approximately 3.8.x base.
Patch-level changes in 3.8.5 and 3.8.6 may not be known. Always verify against
official docs before using APIs introduced or changed after early 2025.

## Known Breaking Changes in 3.8.6

| Change | Impact | Action Required |
|--------|--------|-----------------|
| **Bloom intensity parameter** | Bloom now has an intensity param; upgrading from 3.8.4–3.8.5 defaults to 2.3 | Set intensity back to 1.0 if upgrading from earlier 3.8.x |
| **UISkew component** | `setSkew()` now requires UISkew component to be added to the node first | Add UISkew component before calling `setSkew()` |
| **Renderer.setSharedMaterial** | Same material object no longer updates without `forceUpdate` param | Pass `forceUpdate: true` when reapplying the same material |

## Verified Sources

- Official docs: https://docs.cocos.com/creator/3.8/manual/en/
- Release notes: https://docs.cocos.com/creator/3.8/manual/en/release-notes/
- 3.0 upgrade guide: https://docs.cocos.com/creator/3.8/manual/en/release-notes/upgrade-guide-v3.0.html
- Forum release thread: https://forum.cocosengine.org/t/cocos-creator-3-8-is-here-learn-more-about-it-in-our-release-notes/59194

## Toss 인토스 Integration Notes

- Toss officially supports Cocos Creator for in-app webview games
- SDK: `@apps-in-toss/web-framework` (`ait init` CLI, `granite.config.ts`)
- Workflow: 로컬 개발 → 샌드박스 앱 테스트 → 토스 앱 검증 → 배포
- Config required: `appName`, `displayName`, `icon`, `color` in `granite.config.ts`
- Real device testing: set `web.host` and `web.port` for network accessibility

## Run `/setup-engine refresh` to update these docs when upgrading or before major work.
