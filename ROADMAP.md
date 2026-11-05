# ROADMAP & MILESTONES

## 📌 RULES FOR THE AGENT

- You must follow this roadmap strictly step-by-step.
- Work on exactly ONE step at a time. Do not implement multiple steps or cross-milestone features at once.
- For every completed step, you must stop, run verification, ensure changes are visible in the IDE source control interface, and output a suggested Conventional Commit message as a plain, copyable text paragraph at the very end of your response.
- DO NOT attempt to check off the step or modify this file. Once the suggested commit message is presented, stop and wait for the next task. The developer will handle the commit, push to GitHub, and switch branches for the next issue.

## 📍 Milestone 1: Core Monorepo Infra

_Goal: Initialize the workspace architecture, the desktop application shell, and verify local container/database links._

- [x] **Step 1.1** `chore(workspace): init`
  - Setup root `package.json`, `oxfmt`, `commitlint` and `husky`.
- [x] **Step 1.2** `chore(docs): add agents.md`
- [x] **Step 1.3** `chore(apps): add angular`
- [x] **Step 1.4** `chore(deps): add electron`
- [x] **Step 1.5** `feat(desktop): generate application shell unifying electron main, backend entry, and angular renderer`
  - Extend `apps/app` with the main window management scripts, the typed IPC surface (`preload.ts` contextBridge), the backend entry running in the main process, and standard asset paths.
- [x] **Step 1.6** `feat(container): orchestrate local environment layout for non-autoregressive engine`
  - Write the `compose.yml` configuration and `.env` template targeting the local endpoint on port 8000.

### 📍 Milestone 2: Game Patch Sync & Embedded Storage RAG Setup

_Goal: Automatically fetch, translate, and populate the local database with official live-patch text parameters._

- [x] **Step 2.1** `feat(database): configure embedded database layer using local storage engine`
  - Connect the backend runtime to an isolated data directory inside the workspace utilizing split namespaces.
- [x] **Step 2.2** `feat(rag): implement automatic patch asset synchronization engine`
  - Fetch the latest available patch index from official servers, download metadata, and populate the local storage.
- [x] **Step 2.3** `feat(rag): build high-speed structural id-to-string translation database resolvers`
  - Write optimized database queries to instantly resolve raw champion and item IDs into readable semantic tags.

### 📍 Milestone 3: Client Ingestion & Pre-Game Lobby Automation

_Goal: Monitor game client states to automate queue acceptances, blocks, and choices filtered by role preferences._

- [x] **Step 3.1** `feat(lcu): implement automatic background credentials sniffing for local game instance`
  - Programmatically extract active client port keys and authentication tokens directly from local system layers.
- [x] **Step 3.2** `feat(automation): deploy automated match readiness check validation loop`
  - Capture client invitation events and instantly broadcast acceptance payloads back to the game engine.
- [ ] **Step 3.3** `feat(automation): integrate dynamic lane-based pick and ban execution triggers`
  - Map active lobby states to favorite arrays stored inside the database, sending lock signals for the active position.
- [ ] **Step 3.4** `feat(automation): apply client-recommended runes and summoner spells in champion select`
  - Read the client's recommended pages for the locked champion and position, write them to an app-created rune page and set the summoner spells.

### 📍 Milestone 4: Live-Match Data Ingestion & Strategic Engine Link

_Goal: Poll live game data, suggest items from ranked match statistics and patch data, and query the local execution layer for fuzzy decisions._

- [ ] **Step 4.1** `feat(live): implement live game telemetry collector on local port 2999`
  - Create a high-frequency polling loop targeting active player statistics, current inventories, and live event arrays.
- [ ] **Step 4.2** `feat(advisor): compute defensive item suggestions from enemy damage profile`
  - Split teams via `riotId`, derive the enemy AD/AP share from their item stats (champion `info` before items), rank completed items by effective-health gain per gold, top 3, reported when they change.
- [ ] **Step 4.3** `feat(stats): collect ranked item statistics via riot match api`
  - Sample Emerald+ ranked matches of the current patch within personal key rate limits, store completed items and wins per champion and position in the database.
- [ ] **Step 4.4** `feat(advisor): rank item candidates by win-rate lower bound`
  - Limit suggestions to items built on the champion and position, ordered by Wilson lower bound, with the defensive calculation picking the fit against current enemies.
- [ ] **Step 4.5** `feat(engine): connect advisor to local engine classification layer`
  - Post compact match state to the local single-forward-pass API for decisions the calculation cannot cover; measure accuracy before relying on it.

### 📍 Milestone 5: Control Dashboard & Transparent Overlay Interface

_Goal: Deliver a dual-window interface featuring a pre-game tier manager and a transparent, click-through gameplay HUD._

- [ ] **Step 5.1** `feat(dashboard): design tactical dashboard panel using standalone reactive primitives`
  - Build an interface for adjusting favorite configurations, tracking match logs, and displaying pre-game counters.
- [ ] **Step 5.2** `feat(overlay): deploy boundary-less click-through viewport on top of system visual layers`
  - Instantiate a hidden borderless browser shell that completely ignores all mouse pointer collision frames.
- [ ] **Step 5.3** `feat(overlay): tie ipc streaming channels for instantaneous real-time warnings`
  - Pipe engine classification states and propped enemy spell cooldown updates onto the active transparency layer.
