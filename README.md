<p align="center"><img src="brand/svg/flax-horizontal-color.svg" alt="Fläx" width="220"></p>

# Fläx

A Mac app for Plex that puts **every movie and show from every server your account can reach into one view**. The same title on three servers is one card. It also has search, watchlist, continue watching, playback with subtitles and quality control, and it updates itself.

Fläx is an independent project and is not affiliated with or endorsed by Plex, Inc. It only talks to your own Plex account and the servers you already have access to.

## Install
1. Download `Flax-<version>-arm64.dmg` (Apple Silicon) or `Flax-<version>-x64.dmg` (Intel) from the [latest release](../../releases/latest).
2. Drag Fläx to Applications and open it. Sign in with your Plex account.

Fläx checks for new releases at launch and every 30 minutes, verifies the download (SHA-256, plus the code signature on signed builds), and shows **Restart to update** in Settings → Updates.

macOS only, by design.

## Privacy
- Your Plex token is stored in the macOS keychain (Electron `safeStorage`) and never leaves the main process; the UI never sees it.
- Fläx contacts plex.tv, your Plex servers, and api.github.com (update checks). No analytics, no telemetry.
- Logs stay on your machine (`~/Library/Application Support/Flax/flax.log`).

## Develop
Needs Node 22+ and pnpm.
```
pnpm install
pnpm run rebuild      # rebuilds better-sqlite3 for Electron (NOT the built-in `pnpm rebuild`)
pnpm dev
pnpm typecheck && pnpm lint && pnpm test
pnpm dist             # local macOS build in release/
```
Tests run against fixtures and `tools/mock-plex`; no Plex account is needed. UI tests: `pnpm exec playwright test`.

Layout: `src/main/plex/` all Plex network code; `src/main/merge/` pure merge logic (GUIDs, then title+year); `src/shared/ipc.ts` the typed IPC contract; `src/renderer/` the UI. Feature status is in [docs/parity.md](docs/parity.md).

Releases: see [docs/RELEASING.md](docs/RELEASING.md).

## License
Code: MIT. The Fläx name and logo are not under that license; see [brand/GUIDELINES.md](brand/GUIDELINES.md).
