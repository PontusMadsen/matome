import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { migrateFromFlax, rewriteIndexPaths } from '../src/main/migrate'

const setup = () => {
  const appData = mkdtempSync(join(tmpdir(), 'matome-mig-'))
  const old = join(appData, 'Flax')
  mkdirSync(join(old, 'Downloads'), { recursive: true })
  writeFileSync(join(old, 'client.json'), '{"clientId":"abc"}')
  writeFileSync(join(old, 'settings.json'), '{"skin":"classicmac"}')
  writeFileSync(join(old, 'token.bin'), 'secret')
  writeFileSync(join(old, 'cache.db'), 'cache')
  writeFileSync(join(old, 'Downloads', 'Dune (2021).mkv'), 'video')
  writeFileSync(join(old, 'downloads.json'), JSON.stringify([{ id: '1', state: 'done', path: join(old, 'Downloads', 'Dune (2021).mkv') }]))
  return { appData, old, neu: join(appData, 'Matome') }
}

test('first launch carries settings, client id and downloads over, and leaves sign-in and cache behind', () => {
  const { appData, old, neu } = setup()
  mkdirSync(neu) // Chromium has already created the (empty) folder
  const moved = migrateFromFlax(appData)
  expect(moved.sort()).toEqual(['Downloads', 'client.json', 'downloads.json', 'settings.json'])
  expect(readFileSync(join(neu, 'settings.json'), 'utf8')).toContain('classicmac')
  expect(readFileSync(join(neu, 'Downloads', 'Dune (2021).mkv'), 'utf8')).toBe('video')
  expect(JSON.parse(readFileSync(join(neu, 'downloads.json'), 'utf8'))[0].path).toBe(join(neu, 'Downloads', 'Dune (2021).mkv'))
  expect(existsSync(join(neu, 'token.bin'))).toBe(false)
  expect(existsSync(join(neu, 'cache.db'))).toBe(false)
  expect(existsSync(join(old, 'token.bin'))).toBe(true) // the old folder is not deleted
})

test('runs once: a folder that already has its own client.json is left alone', () => {
  const { appData, neu } = setup()
  mkdirSync(neu)
  writeFileSync(join(neu, 'client.json'), '{"clientId":"mine"}')
  expect(migrateFromFlax(appData)).toEqual([])
  expect(readFileSync(join(neu, 'client.json'), 'utf8')).toContain('mine')
})

test('nothing to do on a fresh install, and broken index files do not crash it', () => {
  expect(migrateFromFlax(mkdtempSync(join(tmpdir(), 'matome-mig-')))).toEqual([])
  expect(rewriteIndexPaths('not json', '/a', '/b')).toBe('not json')
  expect(rewriteIndexPaths('[{"path":"/a/x"},{"path":"/c/y"}]', '/a', '/b')).toBe('[{"path":"/b/x"},{"path":"/c/y"}]')
})
