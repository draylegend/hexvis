Description in `./README.md`.

## Rules

- **NEVER CHANGE REPO without permissions** — you're allowed to modify/delete only when you asked, and you were granted to proceed.
- **Communication/chat** — omit chit-chat and verbosity, write simple. explain only if asked. You should work, not chat.
- **Research** — always research before writing answer. No assumptions at all. Only up-to-date facts, numbers or data. Anything else is strictly prohibited. Ask if anything is unclear.
- **Verification** — prove changes before commit review:
  - `bunx nx run-many -t lint --fix && bunx nx run-many -t test build` zero errors
  - report evidence: command → result, one line each
  - no unverified claims — state explicitly what can't be proven (e.g. needs live LoL client).
- **Development only on specific branch** — working on dev is prohibited and gets rejected on GitHub.
- **Dev workflow** — always make sure a branch is checked out. Branch creation happens mostly in GH UI. Branch name format: issue_number-issue-title.
- **Concise issue title** — lower case, only simple and minimal issue titles so branch names are short as well.
- **Remove local branch after successful PR merge/squash/etc**.
- **No commits without explicit user review** — show the diff, wait for approval, then commit.
- **No pushes unless explicitly asked** — commits stay local until the user says otherwise.
- **No new dependencies** (npm packages, CLIs, tools) without explicit approval.
- **No destructive operations** — don't reset, revert, or delete user work; ask first.
- **Latest framework features**
- **File names** — pascal-case.
- **Var names** — camelCase.
- **Const names** — SNAKE_CASE (screaming).
- **Server** — Bun API only.
- **Runtime & Package Manager** — Bun (`bun i`, `bun test`).
- **UI Framework** — Angular latest/next version.
- **Desktop Shell** — Electron

## App rules

- Modify only app-created rune pages. Never modify/delete user-owned rune pages.
- Overlays passthrough.
- Real-time only.

## Coding

- **Minimal code** — the best code is never written. Before writing, stop at the first rung that holds: needed at all (YAGNI) → already in codebase → Bun/Web/Angular/Electron native API → installed dep → one-liner → minimum code.
- **Minimal, but proper** — smallest correct solution; no hacks, no debt. `// ponytail:` tags mark capacity ceilings only, never corner-cutting.
- **No unrequested abstractions** — no interface with one implementation, no config for a value that never changes, no boilerplate.
- **Root cause, not symptom** — grep every caller, fix the shared function once.
- **Shortest working diff** — deletion over addition, boring over clever, fewest files.
- **Never simplify away** — validation at trust boundaries (LCU, IPC), error handling that prevents data loss (rune pages), security, accessibility.
- **Non-trivial logic leaves one test** — the smallest thing that fails if it breaks; trivial one-liners need none.
