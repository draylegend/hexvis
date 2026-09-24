# HexVis Instructions

## Environment & Commands

- Runtime & Package Manager: Bun (`bun i`, `bun test`)
- UI Framework: Angular Standalone Components (Signals for state management)
- Desktop Shell: Electron

## Hard Application Rules

1. Rune Page Prefix: Every app-created or modified rune page MUST strictly end with the solid vertical hexagon token `⬢`.
2. Non-Destructive Prefill: NEVER overwrite or edit user rune pages missing the `⬢` icon token prefix.
3. Overlay Click-Through Mode: Overlays default to `setIgnoreMouseEvents(true)` unless global edit mode is active via IPC.
4. No In-Game Chat Automation: Overlays display visual UI output only.
