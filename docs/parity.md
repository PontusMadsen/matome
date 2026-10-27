# Parity matrix
status: todo | wip | done | blocked-hw | skipped (user decision). "done" = built AND exercised against a real Plex account/server by the user; "wip" = built, tests pass against mock only (or partially built).

| Feature | Endpoint | Phase | Status |
|---|---|---|---|
| Sign in (PIN) | plex.tv/api/v2/pins | P1 | done |
| Sign out | local | P1 | done |
| Server list (own + shared), best connection, status chips | plex.tv/api/v2/resources | P1 | done |
| Movies library, merged across servers | /library/sections/{id}/all | P2 | done |
| TV Shows library, merged across servers | /library/sections/{id}/all | P2 | done |
| Sort / genre / unwatched / server filters | client-side | P2 | wip |
| Unwatched-episode badge on shows | leafCount/viewedLeafCount | P2 | wip |
| Recently added row (merged) | client-side | P2 | wip |
| Poster loading with per-server fallback + disk cache | thumb via main proxy | P2 | done |
| Detail page (metadata, cast, source picker) | /library/metadata/{id} | P3 | done |
| Seasons/episodes merged across servers | /library/metadata/{id}/children | P3 | done |
| HLS transcode playback | /video/:/transcode/universal | P3 | done |
| Audio/subtitle track select (movies) | stream ids | P3 | done |
| Audio/subtitle track select (episodes) | stream ids | P3 | done |
| Resume position | viewOffset | P3 | done |
| Progress reporting | /:/timeline | P3 | done |
| Mark watched on all servers when played | /:/scrobble | P3 | done |
| Source failover on playback error | client | P3 | wip |
| Keyboard + media keys | MediaSession | P3 | done |
| Custom player controls (scrubber, preview time, volume, quality, speed) | client | P3 | done |
| In-player quality picker (1-20 Mbps) | maxVideoBitrate | P3 | done |
| Pen/mouse-only scrolling (drag-to-scroll, overlay scrollbar, keyboard) | client | P5 | done |
| Command palette (Cmd/Ctrl+K) | client | P4 | done |
| Motion system / shared-element transitions | client | P5 | done |
| Right-click: mark watched, remove from Watchlist | scrobble, watchlist | P8 | done |
| Seasons newest-first | client | P3 | done |
| Auto-play next episode | client | P3 | wip |
| Home: Continue Watching (merged) | /library/onDeck | P4 | done |
| Home: Recently Added Movies/Shows | client-side | P4 | wip |
| Home: Watchlist items now available | discover | P4 | wip |
| Search: local merged | client-side | P4 | wip |
| Search: Plex Discover (not on servers) | discover.provider.plex.tv/library/search | P4 | wip |
| Watchlist view + add/remove | discover.provider.plex.tv | P4 | wip |
| Settings: server include/exclude | local | P5 | wip |
| Settings: streaming quality cap | maxVideoBitrate | P5 | wip |
| Offline browsing from cache | sqlite | P5 | wip |
| macOS .app / .dmg packaging | electron-builder | P5 | done |
| Standalone app, no terminal | CI build + self-update | P5 | done |
| Draggable window | CSS app-region | P5 | done |
| mpv direct play (movies) | Part.key | P6 | wip |
| mpv: episodes | Part.key | P6 | todo |
| Skip intro | Marker | P6 | wip |
| Skip credits | Marker | P6 | todo |
| Auto-play next in mpv | client | P6 | todo |
| Chapter / seek thumbnails (BIF) | /library/parts/{id}/indexes/sd | P6 | todo |
| Playback speed / audio boost / sub size | mpv props | P6 | wip |
| Subtitle styling (color/outline) | mpv props | P6 | todo |
| Collections (merged by name) | /library/sections/{id}/collections | P7 | wip |
| Video playlists: list/create/add | /playlists | P7 | wip |
| Playlist: remove item / reorder / delete | /playlists/{id}/items | P7 | todo |
| Music: artists/albums/tracks (merged) | /library/sections (artist) | P7 | skipped (not used) |
| Music player (gapless, queue) | /library/parts | P7 | skipped (not used) |
| Lyrics / sonic / radio | /library/metadata/{id}/lyrics | P7 | todo |
| Photos library | /library/sections (photo) | P7 | todo |
| Other Videos libraries | /library/sections (movie, no agent) | P7 | todo |
| Browse by genre/decade/studio/actor | /library/sections/{id}/genre etc | P7 | todo |
| Discover feed | discover.provider.plex.tv | P7 | todo |
| Ratings badges (RT/IMDb) | Rating[] in metadata | P7 | todo |
| Mark watched/unwatched | /:/scrobble /:/unscrobble | P8 | wip |
| Rate (stars) | /:/rate | P8 | wip |
| Managed users / Plex Home switch + PIN | plex.tv/api/v2/home/users | P8 | todo |
| Per-user watch state | user token | P8 | todo |
| Friends activity feed | discover.provider.plex.tv/activities | P8 | todo |
| Reviews / share / recommend | discover | P8 | todo |
| Play Next / Add to queue | client | P8 | todo |
| Play Together | none documented | P8 | blocked-hw (no public API found) |
| Live TV & DVR guide | /livetv, /media/grabbers | P9 | blocked-hw (needs tuner + Plex Pass) |
| Recordings / schedule | /media/subscriptions | P9 | blocked-hw (needs tuner + Plex Pass) |
| Downloads / offline sync | /sync | P9 | blocked-hw (needs server-side Plex Pass) |
| Online media sources / podcasts / webshows | discover | P9 | todo |
| Library scan / refresh | /library/sections/{id}/refresh | P9 | todo |
| Metadata refresh / fix match / edit | /library/metadata/{id}/match | P9 | todo |
| Subtitle management | /library/metadata/{id}/subtitles | P9 | todo |
| Empty trash / dashboard / activity | /library/sections/{id}/emptyTrash, /activities | P9 | todo |
| Now Playing / Control Center | Electron MediaSession | P10 | todo |
| Menu bar / app menu | Electron Menu | P10 | todo |
| Fullscreen (PiP todo) | HTML5 | P10 | done |
| Window-state restore | local | P10 | wip |
| Remote control (Plex companion /player/*) | companion | P10 | todo |
| Cast out (Chromecast/AirPlay) | companion/cast | P10 | blocked-hw (needs cast devices) |
| Keyboard shortcut set | local | P10 | wip |
| Auto-update (private repo, token, CI-built releases) | GitHub releases API | P10 | done |
| Settings: language / accessibility / privacy / network / advanced | local | P10 | todo |
| Windows / Linux builds | electron-builder | P10 | todo |

| In-player text subtitles (SRT/VTT/ASS) + stream-carried tracks | /library/streams/{id}, HLS EXT-X-MEDIA | P3 | done |
| One transcode session per playback; stop on close | /video/:/transcode/universal/stop | P3 | done |
