# External Integrations

**Analysis Date:** 2026-01-08

## APIs & External Services

**No External HTTP APIs:**
- This is a local board game engine
- No REST/GraphQL API clients
- No third-party API keys required

## Local Monorepo Integration

**BoardSmith Framework Packages:**
- `@boardsmith/engine` - Core game engine (Game, Player, Card, Deck, Grid)
  - Connection: file:// protocol in package.json
  - Used for: Game state, actions, flow system

- `@boardsmith/session` - Session management
  - Connection: file:// protocol
  - Used for: Player sessions, lobby management

- `@boardsmith/ui` - UI component library
  - Connection: file:// protocol
  - Used for: GameShell, board interaction, Die3D (Three.js)

- `@boardsmith/runtime` - Game execution runtime (dev dependency)
  - Connection: file:// protocol
  - Used for: Development server, game execution

- `@boardsmith/cli` - Command-line interface (dev dependency)
  - Connection: file:// protocol
  - Used for: `boardsmith dev`, `boardsmith build`

- `@boardsmith/testing` - Test utilities (dev dependency)
  - Connection: file:// protocol
  - Used for: `createTestGame()`, `simulateAction()`

- `@boardsmith/ai` - AI player logic (workspace dependency)
  - Connection: workspace:*
  - Used for: AI decision making

## Data Storage

**JSON Data Files:**
- `data/mercs.json` - MERC unit definitions
- `data/equipment.json` - Equipment card data
- `data/sectors.json` - Map sector definitions
- `data/dictators.json` - Dictator character data
- `data/dictator-tactics.json` - Tactics card definitions
- `data/setup.json` - Game setup configuration

**CSV Source Files:**
- `data/*.csv` - Source spreadsheets for JSON generation

**State Management:**
- In-memory via BoardSmith engine
- `persistentMap()` for HMR-safe state
- `game.settings` for ephemeral state

## Database (Optional)

**SQLite (via @boardsmith/cli):**
- Package: better-sqlite3 11.0.0
- Purpose: Save/replay storage (optional)
- Not used in game rules themselves

## Networking (via @boardsmith/cli)

**WebSocket Server:**
- Package: ws 8.16.0
- Purpose: Real-time multiplayer synchronization
- Configuration: Managed by BoardSmith runtime

**HTTP Server:**
- Package: express 4.18.0
- Purpose: Development server, static file serving
- Configuration: Managed by BoardSmith CLI

## 3D Graphics

**Three.js (via @boardsmith/ui):**
- Package: three 0.160.0
- Purpose: 3D dice rendering, board visualization
- Used in: `CombatPanel.vue` imports Die3D

## Authentication & Identity

**Auth Provider:**
- None - Local game or session-based multiplayer
- Sessions managed by @boardsmith/session

## Monitoring & Observability

**Error Tracking:**
- None - Console logging only

**Analytics:**
- None

**Logs:**
- `game.message()` for game events
- Console output for debug

## CI/CD & Deployment

**Hosting:**
- Local development via Vite
- Production: Static hosting or BoardSmith platform

**Build:**
- Vite build to `dist/`
- No CI/CD configuration in this repo

## Environment Configuration

**Development:**
- No .env files required
- Configuration via `boardsmith.json`
- Debug config via `src/rules/debug-config.ts`

**Production:**
- Same configuration approach
- No environment-specific differences

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-01-08*
*Update when adding/removing external services*
