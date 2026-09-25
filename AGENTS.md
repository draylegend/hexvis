# HexVis Instructions

## Rules

- **Development only on specific branch** — working on dev is prohibited and gets rejected on GitHub.
- **Dev workflow** — always make sure a branch is checked out. Branch creation happens mostly in GH UI. Branch name format: issue_number-issue-title.
- **Concise issue title** — only simple and minimal issue titles so branch names are short as well.
- **Remove local branch after successful PR merge/squash/etc**.
- **No commits without explicit user review** — show the diff, wait for approval, then commit.
- **No pushes unless explicitly asked** — commits stay local until the user says otherwise.
- **No new dependencies** (npm packages, CLIs, tools) without explicit approval.
- **No destructive operations** — don't reset, revert, or delete user work; ask first.
- **Latest framework features**

## Environment & Commands

- Runtime & Package Manager: Bun (`bun i`, `bun test`)
- UI Framework: Angular Standalone Components (Signals for state management)
- Desktop Shell: Electron

## Spec-Driven Workflow

Every behavior change needs a spec first.

Workflow: Propose → Review → Tasks → Implement → Verify

1. **Propose** — copy `specs/spec-template.md` to `specs/NNNN-<slug>.md` (NNNN = zero-padded sequence). Status: `draft`.
2. **Review** — human approves the spec (in chat or PR). Status: `approved`.
3. **Tasks** — break into ordered tasks, each mapped to a requirement with a verify command.
4. **Implement** — one task at a time, tick boxes. Update the spec _before_ the code if behavior changes mid-flight.
5. **Verify** — walk requirements one by one, record evidence. Status: `verified`.

Status lifecycle: `draft → approved → in-progress → verified`

Rules:

- Exempt from specs: docs, typos, comments, formatting — anything that changes no behavior.
- Before modifying a feature, read its `specs/NNNN-*.md` first.
- When code and spec disagree, fix one deliberately — never silently.
- Commit the spec change, the implementation, and the status update as separate commits (`feat(spec): ...` → `feat(...): implement (R1–R3)` → `docs(spec): ... → verified`).
