<p align="center"><img src="brand/lockup/matome-lockup-horizontal-teal.svg" alt="Matome" width="320"></p>

A Mac app for Plex that puts **every movie and show from every server your account can reach into one view**. The same title on three servers is one card. It also has search, watchlist, continue watching, playback with subtitles and quality control, and it updates itself.

Matome is an independent project and is not affiliated with or endorsed by Plex, Inc. It only talks to your own Plex account and the servers you already have access to.

## Install
1. Download `Matome-<version>-arm64.dmg` (Apple Silicon) or `Matome-<version>-x64.dmg` (Intel) from the [latest release](../../releases/latest).
2. Drag Matome to Applications and open it. Sign in with your Plex account.

Matome checks for new releases at launch and every 30 minutes, verifies the download (SHA-256, plus the code signature on signed builds), and shows **Restart to update** in Settings → Updates.

macOS only, by design.

**Coming from Fläx/Flax?** Matome is the same app under a new name. It can't update an old Fläx install by itself: install Matome from the release page once and sign in to Plex again. Your settings, window position and downloaded files are carried over automatically; the old `Flax` folder is left where it is and can be deleted. The logo kit and its usage rules live in [`brand/`](brand/GUIDELINES.md).

## Privacy
- Your Plex token is stored in the macOS keychain (Electron `safeStorage`) and never leaves the main process; the UI never sees it.
- Matome contacts plex.tv, your Plex servers, and api.github.com (update checks). No analytics, no telemetry.
- Logs stay on your machine (`~/Library/Application Support/Matome/matome.log`).

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
Code: MIT. The Matome name and logo are not under that license; see [brand/GUIDELINES.md](brand/GUIDELINES.md).
