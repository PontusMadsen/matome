import { createServer } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { MpvClient } from '../src/main/mpv/client'
import { markerAt } from '../src/main/mpv/markers'

function fakeMpv() {
  const path = join(mkdtempSync(join(tmpdir(), 'mpv-')), 'sock')
  const seen: unknown[][] = []
  const server = createServer((c) => {
    c.on('data', (d) => {
      for (const line of d.toString().split('\n').filter(Boolean)) {
        const m = JSON.parse(line) as { command: unknown[]; request_id: number }
        seen.push(m.command)
        if (m.command[0] === 'bad') c.write(JSON.stringify({ request_id: m.request_id, error: 'property not found' }) + '\n')
        else {
          // split a property event across chunks to exercise buffering
          c.write(JSON.stringify({ event: 'property-change', name: 'time-pos', data: 12.5 }).slice(0, 10))
          c.write(JSON.stringify({ event: 'property-change', name: 'time-pos', data: 12.5 }).slice(10) + '\n')
          c.write(JSON.stringify({ request_id: m.request_id, error: 'success', data: 'ok' }) + '\n')
        }
      }
    })
  })
  return new Promise<{ path: string; seen: unknown[][]; close: () => void }>((r) => server.listen(path, () => r({ path, seen, close: () => server.close() })))
}

test('mpv client: commands resolve, errors reject, events are parsed across chunks', async () => {
  const f = await fakeMpv()
  const c = new MpvClient()
  await c.connect(f.path, 5, 20)
  const props: unknown[] = []
  c.on('property', (n, v) => props.push([n, v]))
  expect(await c.set('pause', true)).toBe('ok')
  await expect(c.command('bad')).rejects.toThrow('property not found')
  expect(f.seen[0]).toEqual(['set_property', 'pause', true])
  expect(props[0]).toEqual(['time-pos', 12.5])
  c.close()
  f.close()
})

test('mpv client rejects when socket never appears', async () => {
  await expect(new MpvClient().connect('/nonexistent/sock', 1, 5)).rejects.toThrow(/could not connect/)
})

test('markerAt finds intro window and ignores the final 500ms', () => {
  const m = [{ type: 'intro' as const, startMs: 1000, endMs: 5000 }]
  expect(markerAt(m, 2000)?.type).toBe('intro')
  expect(markerAt(m, 500)).toBeUndefined()
  expect(markerAt(m, 4800)).toBeUndefined()
})

import { mpvArgs } from '../src/main/mpv/session'
import { DEFAULT_SETTINGS } from '../src/main/settings'

test('mpv args: hwdec, ipc socket, passthrough, no token in argv', () => {
  const a = mpvArgs('/tmp/s.sock', { ...DEFAULT_SETTINGS, audioBoostPct: 20, subScale: 1.5 })
  expect(a).toContain('--input-ipc-server=/tmp/s.sock')
  expect(a).toContain('--hwdec=auto-safe')
  expect(a).toContain('--volume=120')
  expect(a).toContain('--sub-scale=1.5')
  expect(a.join(' ')).not.toMatch(/token/i)
})
