# Technology Stack

**Analysis Date:** 2026-01-08

## Languages

**Primary:**
- TypeScript 5.7.0 - All application code (`package.json`, `tsconfig.json`)

**Secondary:**
- Vue 3 templates - Single File Components (`src/ui/components/*.vue`)
- JavaScript ES2022 - Compiled output target (`tsconfig.json`)

## Runtime

**Environment:**
- Node.js - Development and build tools (no .nvmrc specified)
- Browser-based - Vue 3 SPA for game rendering
- ES Modules - `"type": "module"` in `package.json`

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (lockfileVersion 3)

## Frameworks

**Core:**
- Vue 3.4.0 - UI framework (`src/ui/App.vue`, `src/main.ts`)
- @boardsmith/engine - Game engine framework (local monorepo package)
- @boardsmith/session - Session management (local monorepo package)
- @boardsmith/ui - UI component library with Three.js 3D rendering

**Testing:**
- Vitest 2.0.0 - Unit testing framework (`tests/*.test.ts`)
- @boardsmith/testing - Custom test utilities (createTestGame, simulateAction)
- Puppeteer 24.34.0 - Browser automation

**Build/Dev:**
- Vite 5.4.0 - Build tool and dev server (`vite.config.ts`)
- @vitejs/plugin-vue 5.0.0 - Vue plugin for Vite
- esbuild 0.21.5 - Used by Vite for bundling

## Key Dependencies

**Critical:**
- @boardsmith/engine - Core game state, actions, flow system
- @boardsmith/session - Player session and lobby management
- @boardsmith/ui - GameShell, board interaction, 3D rendering
- @boardsmith/runtime - Game execution runtime (dev dependency)
- @boardsmith/ai - AI player logic (workspace dependency)

**UI:**
- vue 3.4.0 - Reactive UI framework
- three 0.160.0 - 3D graphics for dice and board visualization (via @boardsmith/ui)

**Infrastructure:**
- better-sqlite3 11.0.0 - SQLite database (in @boardsmith/cli)
- express 4.18.0 - Web server (in @boardsmith/cli)
- ws 8.16.0 - WebSocket for multiplayer (in @boardsmith/cli)

## Configuration

**Environment:**
- No .env files required
- Game configuration via `boardsmith.json`
- Debug configuration via `src/rules/debug-config.ts`

**Build:**
- `tsconfig.json` - TypeScript: ES2022 target, ESNext modules, bundler resolution, strict mode
- `vite.config.ts` - Vite bundler configuration

## Platform Requirements

**Development:**
- Any platform with Node.js
- No external service dependencies
- All dependencies from local BoardSmith monorepo

**Production:**
- Browser-based deployment
- Served via Vite dev server or static hosting
- Real-time multiplayer via BoardSmith runtime WebSocket server

---

*Stack analysis: 2026-01-08*
*Update after major dependency changes*
