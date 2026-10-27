// Pure helpers for the self-updater (no Electron imports so they are unit-testable).
export interface ReleaseAsset { name: string; browser_download_url: string; digest?: string | null }
export interface Release { tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: ReleaseAsset[] }
export interface UpdateInfo { version: string; url: string; name: string; sha256: string | null; sumsUrl: string | null }

type Ver = [number, number, number]

export function parseVersion(v: string): Ver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1
  return 0
}

export const isNewer = (current: string, latest: string): boolean => compareVersions(current, latest) < 0

/** Release assets are published as `Flax-<version>-<arch>.zip`; GitHub exposes `digest: sha256:<hex>` per asset. */
export function parseRelease(r: Release, arch: string): UpdateInfo | null {
  if (r.draft || r.prerelease || !r.tag_name) return null
  const v = parseVersion(r.tag_name)
  if (!v) return null
  const version = v.join('.')
  const name = `Flax-${version}-${arch}.zip`
  const asset = r.assets?.find((a) => a.name === name)
  if (!asset) return null
  const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')?.[1]?.toLowerCase() ?? null
  const sums = r.assets?.find((a) => a.name === 'SHA256SUMS' || a.name === 'SHA256SUMS.txt')
  return { version, url: asset.browser_download_url, name, sha256, sumsUrl: sums?.browser_download_url ?? null }
}

/** Parses `shasum -a 256` output: `<hex>  <name>` per line. */
export function parseSums(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line)
    if (m?.[1] && m[2]) out[m[2]] = m[1].toLowerCase()
  }
  return out
}

export const bundlePath = (execPath: string): string | null => {
  const m = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)
  return m?.[1] ?? null
}

/** Extracts the Team ID from `codesign -dv` output. */
export const teamIdOf = (codesignOutput: string): string | null => /TeamIdentifier=([A-Z0-9]{10})/.exec(codesignOutput)?.[1] ?? null

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** Shell script: wait for the app to exit, swap the bundle, relaunch. Runs detached after quit. */
export function swapScript(o: { pid: number; bundle: string; newBundle: string; log: string }): string {
  return `#!/bin/bash
exec >> ${q(o.log)} 2>&1
echo "== update $(date)"
while kill -0 ${o.pid} 2>/dev/null; do sleep 0.3; done
BK=${q(o.bundle + '.old')}
rm -rf "$BK"
mv ${q(o.bundle)} "$BK" || exit 1
if ditto ${q(o.newBundle)} ${q(o.bundle)}; then
  xattr -cr ${q(o.bundle)} 2>/dev/null
  rm -rf "$BK"
  open ${q(o.bundle)}
else
  echo "copy failed, restoring"
  rm -rf ${q(o.bundle)}; mv "$BK" ${q(o.bundle)}; open ${q(o.bundle)}
fi
`
}
