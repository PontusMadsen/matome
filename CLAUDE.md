# CLAUDE.md — Matome

Mac-only Electron + TypeScript + React (electron-vite, pnpm) Plex client that merges all movies/shows across every reachable Plex server.

## Rules
1. All Plex network code lives in `src/main/plex/`. The renderer never sees the token; it talks over typed IPC (`src/shared/ipc.ts`).
2. Merge logic is a pure module `src/main/merge/` with tests. Key priority: tmdb/imdb/tvdb GUIDs, then normalized title + year. Never merge on title alone when the year differs.
3. Every Plex request sends the standard `X-Plex-*` headers (stable client id, Product=Matome) and `Accept: application/json`.
4. A dead or slow server must never block the UI (8s timeout, partial results, offline chip).
5. Token only in the OS keychain; never logged or committed. Don't invent Plex endpoints; cite the source in a comment.
6. Surgical changes, small files. Pen/tablet-friendly scrolling is a hard UI requirement (no wheel-only interactions).
7. Done = `pnpm typecheck && pnpm lint && pnpm test` pass, and Playwright UI tests for UI changes.
