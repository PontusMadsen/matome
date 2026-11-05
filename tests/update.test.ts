import { expect, test } from 'vitest'
import { swapBlocker, bundlePath, compareVersions, isNewer, parseRelease, parseSums, parseVersion, swapScript, teamIdOf } from '../src/main/update-logic'

const sha = 'a'.repeat(64)
const rel = (over = {}) => ({
  tag_name: 'v1.2.3',
  assets: [
    { name: 'Matome-1.2.3-x64.zip', browser_download_url: 'https://x/x64', digest: null },
    { name: 'Matome-1.2.3-arm64.zip', browser_download_url: 'https://x/arm', digest: `sha256:${sha}` },
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://x/sums' },
  ],
  ...over,
})

test('versions parse and compare numerically', () => {
  expect(parseVersion('v1.10.0')).toEqual([1, 10, 0])
  expect(parseVersion('latest')).toBeNull()
  expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
  expect(isNewer('0.9.0', 'v1.0.0')).toBe(true)
  expect(isNewer('1.0.0', '1.0.0')).toBe(false)
  expect(isNewer('2.0.0', '1.0.0')).toBe(false)
})

test('parseRelease picks this arch, digest and sums; ignores drafts/prereleases/bad tags', () => {
  expect(parseRelease(rel(), 'arm64')).toEqual({ version: '1.2.3', url: 'https://x/arm', name: 'Matome-1.2.3-arm64.zip', sha256: sha, sumsUrl: 'https://x/sums' })
  expect(parseRelease(rel(), 'x64')?.sha256).toBeNull()
  expect(parseRelease(rel(), 'ia32')).toBeNull()
  expect(parseRelease(rel({ draft: true }), 'arm64')).toBeNull()
  expect(parseRelease(rel({ prerelease: true }), 'arm64')).toBeNull()
  expect(parseRelease(rel({ tag_name: 'latest' }), 'arm64')).toBeNull()
})

test('parseSums reads shasum output', () => {
  expect(parseSums(`${sha}  Matome-1.2.3-arm64.zip\n${'b'.repeat(64)} *other.dmg\njunk`)).toEqual({ 'Matome-1.2.3-arm64.zip': sha, 'other.dmg': 'b'.repeat(64) })
})

test('teamIdOf reads codesign output', () => {
  expect(teamIdOf('Identifier=app.matome.mac\nTeamIdentifier=AB12CD34EF\n')).toBe('AB12CD34EF')
  expect(teamIdOf('TeamIdentifier=not set')).toBeNull()
})

test('bundlePath finds the .app from the executable', () => {
  expect(bundlePath('/Applications/Matome.app/Contents/MacOS/Matome')).toBe('/Applications/Matome.app')
  expect(bundlePath('/usr/bin/node')).toBeNull()
})

test('swap script waits for pid, keeps backup, restores on failure, quotes paths', () => {
  const s = swapScript({ pid: 123, bundle: "/Users/o'brien/Applications/Matome.app", newBundle: '/tmp/n/Matome.app', log: '/tmp/l' })
  expect(s).toContain('kill -0 123')
  expect(s).toContain("'/Users/o'\\''brien/Applications/Matome.app'")
  expect(s).toContain('restoring')
  expect(s).toContain('xattr -cr')
})

test('swapBlocker: a disk image or a quarantined download cannot be replaced in place', () => {
  expect(swapBlocker('/Applications/Matome.app')).toBeNull()
  expect(swapBlocker('/Users/me/Applications/Matome.app')).toBeNull()
  expect(swapBlocker('/Volumes/Matome 0.10.2/Matome.app')).toMatch(/Applications folder/)
  expect(swapBlocker('/private/var/folders/x/AppTranslocation/ABC/d/Matome.app')).toMatch(/Applications folder/)
})

test('swap script keeps and reopens the old app when it cannot be moved aside', () => {
  const s = swapScript({ pid: 1, bundle: '/Applications/Matome.app', newBundle: '/tmp/n/Matome.app', log: '/tmp/l' })
  expect(s).toContain('if ! mv')
  expect(s).toContain('keeping it')
})
