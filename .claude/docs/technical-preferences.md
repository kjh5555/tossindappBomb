# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: Cocos Creator 3.8.6
- **Language**: TypeScript
- **Rendering**: 2D (Canvas / WebGL)
- **Physics**: Cocos Built-in 2D Physics

## Input & Platform

<!-- Written by /setup-engine. Read by /ux-design, /ux-review, /test-setup, /team-ui, and /dev-story -->
<!-- to scope interaction specs, test helpers, and implementation to the correct input methods. -->

- **Target Platforms**: 모바일 (토스 인토스 webview)
- **Input Methods**: Touch
- **Primary Input**: Touch
- **Gamepad Support**: None
- **Touch Support**: Full
- **Platform Notes**: 토스 인토스 webview 내 실행. `@apps-in-toss/web-framework` SDK 연동 필수. 모든 UI는 터치 전용으로 설계. hover 인터랙션 사용 금지. 안전 영역(safe area) 고려 필수.

## Naming Conventions

- **Classes**: PascalCase (e.g., `GridManager`, `PlayerNode`)
- **Variables**: camelCase (e.g., `moveSpeed`, `currentRound`)
- **Methods**: camelCase (e.g., `onCellExplode()`, `startRound()`)
- **Signals/Events**: on + PascalCase (e.g., `onGameOver`, `onRoundStart`)
- **Files**: PascalCase matching class (e.g., `GridManager.ts`, `PlayerNode.ts`)
- **Scenes/Prefabs**: PascalCase (e.g., `GameScene.scene`, `CellPrefab.prefab`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_ROUND`, `GRID_SIZE`, `EXPLOSION_DELAY`)

## Performance Budgets

- **Target Framerate**: 60fps
- **Frame Budget**: 16.6ms
- **Draw Calls**: ≤50 (모바일 webview 기준)
- **Memory Ceiling**: ≤150MB (모바일 webview 기준)

## Testing

- **Framework**: Cocos Creator 내장 테스트 또는 Jest (TypeScript unit tests)
- **Minimum Coverage**: 핵심 게임 로직 70% (그리드 폭발 시스템, 라운드 매니저, 멀티플레이어 동기화)
- **Required Tests**: 그리드 폭발 패턴 유효성, 라운드 에스컬레이션 로직, WebSocket 메시지 처리

## Forbidden Patterns

<!-- Add patterns that should never appear in this project's codebase -->
- [None configured yet — add as architectural decisions are made]

## Allowed Libraries / Addons

<!-- Add approved third-party dependencies here -->
- `@apps-in-toss/web-framework` — 토스 인토스 SDK (필수)

## Architecture Decisions Log

<!-- Quick reference linking to full ADRs in docs/architecture/ -->
- [No ADRs yet — use /architecture-decision to create one]

## Engine Specialists

<!-- Written by /setup-engine when engine is configured. -->
<!-- Read by /code-review, /architecture-decision, /architecture-review, and team skills -->
<!-- to know which specialist to spawn for engine-specific validation. -->

- **Primary**: gameplay-programmer
- **Language/Code Specialist**: gameplay-programmer (TypeScript 게임 로직)
- **Shader Specialist**: technical-artist (셰이더/비주얼 이펙트)
- **UI Specialist**: ui-programmer (UI 컴포넌트, 화면 전환)
- **Additional Specialists**: network-programmer (WebSocket 멀티플레이어 시스템)
- **Routing Notes**: gameplay-programmer를 게임 로직 및 아키텍처 기본으로 사용. UI 구현은 ui-programmer에 위임. WebSocket 서버 및 동기화 코드는 network-programmer에 위임. 비주얼 이펙트/파티클은 technical-artist에 위임.

### File Extension Routing

<!-- Skills use this table to select the right specialist per file type. -->

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| Game code (.ts files) | gameplay-programmer |
| UI / screen files (UI 컴포넌트, .ts + 씬) | ui-programmer |
| Shader / effect files | technical-artist |
| Scene / prefab / level files (.scene, .prefab) | gameplay-programmer |
| WebSocket / networking code | network-programmer |
| General architecture review | gameplay-programmer |
