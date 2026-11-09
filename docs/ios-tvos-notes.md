# iPad / iPhone / Apple TV: notes for a later version

Status: research only, nothing built. Written 2026-11-09.

## Scope decision
- Downloads / offline playback are an iPad + iPhone feature only. Mac and Apple TV stream.
- Order: iPad (and iPhone) first, Apple TV second.

## Legal (checked against Plex Terms of Service, "Interfacing Software")
- Third-party client apps are explicitly allowed. Conditions: you are responsible for the app and its data collection;
  include a privacy notice; keep a "Copyright (c) <year> <holder>" line in the source; grant Plex a licence to promote or
  redistribute the app; do not replicate Plex Pass features or get around paywalls.
- The Plex API is only semi-documented; there is no guarantee it stays stable.
- Do not use "Plex" in the app name or any Plex logo.
- Plex's remote-streaming paywall probably applies to third-party clients too (staff statement, not in the ToS).
- Not checked: trademark for "Matome" (common Japanese word; search J-PlatPat before App Store branding).

## Technical plan (not verified)
- Electron does not run on iPadOS/tvOS: this is a rewrite. One SwiftUI multiplatform project, shared Swift package
  (Plex auth/discovery, models, merge), iOS/iPadOS target and tvOS target, roughly 70% shared.
- Merge: either port to Swift using the existing merge test vectors, or bundle the pure TS module and call it via
  JavaScriptCore so the Mac and Apple apps cannot drift.
- Playback: AVPlayer on Plex's HLS transcode (same as the Mac app). Direct play of MKV/DTS needs a custom player library
  (as Infuse does); leave that out of the first version.
- Sign-in: Plex PIN flow, which suits TVs.
- Apple TV: focus-based UI for a remote, no offline mode.
- Building: needs macOS + Xcode. Use GitHub macOS runners (as the Mac releases do); a real device is needed to judge feel.

## Distribution
- Apple Developer Program, about $99/year.
- Personal use: TestFlight or Xcode install, no review.
- Public: App Store review needs a demo Plex account with a populated server, a privacy policy URL and privacy labels; the
  seller address is shown (a company enrolment avoids the personal address).
- Japan's smartphone competition act may allow alternative iOS stores, not tvOS. Unverified.
- Competition on Apple TV: Infuse and other Plex-compatible clients.
