<p align="center"><img src="brand/lockup/matome-lockup-horizontal-teal.svg" alt="Matome" width="320"></p>

A Mac app for Plex that puts **every movie and show from every server your account can reach into one view**. The same title on three servers is one card, and you pick which server to play from.

Matome is an independent project and is not affiliated with or endorsed by Plex, Inc. It only talks to your own Plex account and the servers you already have access to.

## What it does
- **One library:** movies and TV shows from your own and friends' servers, merged by IDs (TMDB/IMDb/TVDB), then by title and year. Server badges and an offline chip show where things live; a dead or slow server never blocks the app.
- **Browse and find:** per-server browsing, collections and playlists, filters and sorting, search across your servers and Plex Discover, the Plex Watchlist, a command palette (⌘K).
- **Home:** Continue Watching merged across servers, recently added, watchlist titles that became available. An option hides watched titles.
- **Title pages:** cast, IMDb and Rotten Tomatoes scores (as reported by Plex), episode air dates tagged New or Upcoming, rating, mark as watched on every server.
- **Playback:** streams through the server's transcoder with resume, audio and subtitle track choice, a quality cap, speed, next episode, progress and watched reporting back to Plex, and automatic failover to another server that has the same title. Text subtitles are drawn by the app; image subtitles (PGS, VobSub) are burned in by the server, which can be heavy on a small server.
- **Downloads and offline:** download the original file from servers that allow it, into the app's own folder (Application Support/Matome/Downloads), and play it later without a connection. A **Downloaded** section appears once you have something and lets you delete files. Which servers allow downloads is decided by their owners; Matome hides the button where a server refuses.
- **Skins:** Default (dark, teal) and Classic Mac (1984 black and white with dithered shadows).
- **Made for a pen or tablet too:** drag-to-scroll, no wheel-only interactions.
- **Updates itself:** checks at launch and every 30 minutes; **Restart to update** appears in Settings → Updates.
- **Optional mpv:** direct play of any codec, HDR and ASS/PGS subtitles, if you install [mpv](https://mpv.io) (`brew install mpv`) and switch it on in Settings. Experimental.

## Install
1. Download `Matome-<version>-arm64.dmg` (Apple Silicon) or `Matome-<version>-x64.dmg` (Intel) from the [latest release](../../releases/latest).
2. Drag Matome to Applications and open it, then choose **Sign in with Plex** (a browser window opens, no password is typed into Matome).

Releases are signed and notarized by Apple. The updater verifies each download (SHA-256, and the code signature on signed builds) and only accepts updates signed by the same Apple team as the installed app.

macOS only, by design.

**Coming from Fläx/Flax?** Matome is the same app under a new name. It can't update an old Fläx install by itself: install Matome from the release page once and sign in to Plex again. Your settings, window position and downloaded files are carried over automatically; the old `Flax` folder is left where it is and can be deleted.

## Limits worth knowing
- Plex's own rules apply: remote streaming and downloads depend on the server owner's settings and Plex Pass status, and Plex may treat third-party apps differently from its own. Matome only uses what Plex lets your account do.
- The Plex API is only partly documented and can change; if something stops working after a Plex update, please open an issue with the last lines of the log.
- Not included: music, photos, live TV, and iPad/iPhone/Apple TV apps (see [docs/ios-tvos-notes.md](docs/ios-tvos-notes.md) for the research).

## Privacy
- Your Plex token is encrypted with the macOS keychain (Electron `safeStorage`) and never leaves the main process; the UI never sees it. It is never logged.
- Matome contacts plex.tv (sign-in, server list), Plex Discover (watchlist, search), your Plex servers, and GitHub (update checks and downloads). No analytics, no telemetry.
- Logs stay on your machine: `~/Library/Application Support/Matome/matome.log`. Settings → Troubleshooting → **Show in Finder** opens it.

## Develop
Needs Node 22+ and pnpm.
```
pnpm install
pnpm run rebuild      # rebuilds better-sqlite3 for Electron (NOT the built-in `pnpm rebuild`)
pnpm dev
pnpm typecheck && pnpm lint && pnpm test
pnpm build && pnpm test:ui     # UI tests (Playwright, against a mocked bridge); set CHROMIUM_PATH to use your own Chromium
pnpm dist             # local macOS build in release/
```
Tests run against fixtures and `tools/mock-plex`; no Plex account is needed.

Layout: `src/main/plex/` all Plex network code; `src/main/merge/` pure merge logic; `src/shared/ipc.ts` the typed IPC contract; `src/renderer/` the UI. Ground rules for changes are in [CONTRIBUTING.md](CONTRIBUTING.md).

Releases: see [docs/RELEASING.md](docs/RELEASING.md).

## License
Code: MIT. The Matome name and logo are not under that license; see [brand/GUIDELINES.md](brand/GUIDELINES.md).
