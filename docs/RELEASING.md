# Releasing Fläx

Releases are built by `.github/workflows/release.yml` on a GitHub macOS runner. You never need a terminal.

## Publish a version
1. Bump `version` in `package.json` (e.g. `1.0.1`) and merge it to `main`.
2. Start the release: GitHub -> Actions -> release -> Run workflow, tag `v1.0.1` (it creates the tag on `main` itself). Or push a tag with the same number: `git tag v1.0.1 && git push origin v1.0.1`. (Or in GitHub: Releases -> Draft a new release -> create the tag `v1.0.1` on `main` and publish; the tag push starts the same build.)
3. The workflow builds arm64 + x64, signs and notarizes, starts the app once as a smoke test, then creates the GitHub Release (if it doesn't exist yet) and attaches `Flax-<version>-<arch>.dmg/.zip` and `SHA256SUMS.txt` (about 10 minutes). A build whose app doesn't start is never published.
4. Installed apps pick it up within 30 minutes. Pre-releases and drafts are ignored by the updater.

If the build fails, fix it and run the workflow manually (Actions -> release -> Run workflow -> enter the tag). Files are replaced.

## One-time: Apple signing secrets
Without these, the workflow still builds but **unsigned** (users must right-click → Open; the updater skips the signature check). Add under repo Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `CSC_LINK` | base64 of your **Developer ID Application** certificate (.p12) |
| `CSC_KEY_PASSWORD` | password you set when exporting the .p12 |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | created at appleid.apple.com → Sign-In and Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-character Team ID from developer.apple.com → Membership |

Getting the .p12: Xcode → Settings → Accounts → Manage Certificates → + → *Developer ID Application*; then Keychain Access → right-click the certificate → Export (.p12). Base64 it with `base64 -i cert.p12 | pbcopy`.

The updater requires an update to carry the same Team ID as the installed app, so keep using the same certificate.

## Bundle id
`build.appId` in `package.json` (`app.flax.mac`) identifies the app to macOS (keychain, preferences). Choose it before the first public release; changing it later makes users re-sign-in.
