Description in `./README.md`.

## Rules

- **NEVER CHANGE REPO without permissions** — you're allowed to modify/delete only when you asked, and you were granted to proceed.
- **Communication/chat** — omit chit-chat and verbosity, write simple. explain only if asked. You should work, not chat.
- **Research** — always research before writing answer. No assumptions at all. Only up-to-date facts, numbers or data. Anything else is strictly prohibited. Ask if anything is unclear.
  Search order: first locally in installed packages (`node_modules`, lockfile — they define what actually runs), then online — packages can be outdated.
- **Verification** — prove changes before commit review:
  - `bunx nx run-many -t lint --fix && bunx nx run-many -t test build` zero errors
  - report evidence: command → result, one line each
  - no unverified claims — state explicitly what can't be proven (e.g. needs live LoL client).
- **Development only on specific branch** — working on dev is prohibited and gets rejected on GitHub.
- **Dev workflow** — always make sure a branch is checked out. Branch creation happens mostly in GH UI. Branch name format: issue_number-issue-title.
- **Concise issue title** — lower case, only simple and minimal issue titles so branch names are short as well.
- **Remove local branch after successful PR merge/squash/etc**.
- **No commits without explicit user review** — present a compliant commit message as plain, copyable text at the very end of your response. The user will review the changes in the IDE source control and commit them. Sometimes you'll be allowed to commit and push.
- **Commit format** — strictly follow the Conventional Commits specification (`feat(tracker): ...`, `fix(overlay): ...`). The commit message must be automatically suggested by the agent after each implemented code block at the very end of your response: one header line, then a body of concise bullet points (`- ...`), each bullet ≤100 chars.
- **Roadmap execution** — you are prohibited from modifying `roadmap.md`. Marking milestones and checking off steps `[x]` is strictly reserved for human developers during review.
- **No new dependencies** (npm packages, CLIs, tools) without explicit approval.
- **No destructive operations** — don't reset, revert, or delete user work; ask first.
- **Latest framework features** — enforce modern Angular style: strictly use the `inject()` function for dependency injection over constructors. Leverage Signals (`input`, `model`, `computed`, `effect`) for reactive state. Use `protected` on class members bound in templates and `readonly` for Angular-initialized properties. Prefer native class/style bindings over `ngClass`/`ngStyle`.
- **File names** — strictly follow the official Angular Style Guide: separate words with hyphens, matching the TypeScript identifier exactly (`user-profile.ts`, `champ-select.ts`). Shared names for template/styles (`user-profile.html`, `user-profile.css`). Unit tests must end with `.spec.ts` (`user-profile.spec.ts`). Avoid overly generic file names like helpers or utils.
- **Var names** — camelCase.
- **Const names** — SNAKE_CASE (screaming) for data constants (primitives, patterns,
  config); callable consts (promisified/wrapped functions) keep camelCase.
- **Import paths** — extensionless across the whole workspace; configs in TypeScript where supported.
- **@Component keys** — semantic order: `selector` (if exists), `imports`, `templateUrl`/`template`, `styles`/`styleUrl`. Never alphabetized; no linter automation exists for custom key order (hence `sort-keys` off).
- **Class members** — omit `public`; `#field` for private (convention — no oxlint rule exists); `protected` stays for template-bound members.
- **Comments after imports** — no comments before imports.
- **Server & Database** — Electron main process (Node) paired with embedded SurrealDB engine (`surrealkv://`).
- **AI Core Interfacing** — Strictly non-autoregressive single-forward-pass calls to local Laya API (`/v1/systemone`). No external LLM calls or token streaming.
- **Runtime & Package Manager** — App runtime: Electron (Node). Bun is the package manager and test runner (`bun i`, `bun test`).
- **UI Framework** — Angular latest/next version (Strictly standalone components, zero boilerplate modules, organize subdirectories strictly by feature areas).
- **Desktop Shell** — Electron

## App rules

- Modify only app-created rune pages. Never modify/delete user-owned rune pages.
- Overlays passthrough (`win.setIgnoreMouseEvents(true)` activation during live match state).
- Real-time only.

## Coding

- **Minimal code** — the best code is never written. Before writing, stop at the first rung that holds: needed at all (YAGNI) → already in codebase → Bun/Web/Angular/Electron native API → installed dep → one-liner → minimum code.
- **Minimal, but proper** — smallest correct solution; no hacks, no debt. `// ponytail:` tags mark capacity ceilings only, never corner-cutting.
- **No unrequested abstractions** — no interface with one implementation, no config for a value that never changes, no boilerplate.
- **Root cause, not symptom** — grep every caller, fix the shared function once.
- **Shortest working diff** — deletion over addition, boring over clever, fewest files.
- **Never simplify away** — validation at trust boundaries (LCU API, Live Client API port 2999, Electron IPC), error handling that prevents data loss (rune pages), security, accessibility.
- **Non-trivial logic leaves one test** — the smallest thing that fails if it breaks; trivial one-liners need none.
