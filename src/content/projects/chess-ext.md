---
title: "Chess Ext"
description: "A browser extension that layers chess analysis helpers — move clocks, board coordinates, and in-page study notes — on top of lichess and chess.com."
pubDate: 2025-06-04
updated: 2026-02-11
icon: ♟️
status: archived
type: library
tags:
  - browser-extension
  - chess
  - typescript
  - open-source
stack:
  - TypeScript
  - Manifest V3
  - Stockfish WASM
---

Chess Ext keeps the parts of online chess I actually train on visible: move counts,
a per-move clock tracker, coordinates on demand, and study lines you can annotate
without leaving the game tab.

## Highlights

- **Manifest V3** — MV2 is deprecated; writing this meant staying current with Chrome
  and Firefox extension APIs.
- **Local analysis** — a bundled Stockfish (WASM) worker analyses positions entirely
  in the tab. No position ever leaves the browser, which is also the privacy story.
- **Site adapters** — DOM adapters for lichess and chess.com mean one core engine,
  two thin shells.

The extension is a favorite scratchpad for clean module boundaries: the analysis
engine, the DOM adapters, and the UI layer each know nothing about the other two.
