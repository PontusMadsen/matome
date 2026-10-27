import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { newClientId, type ClientIdentity } from './plex/client'

const file = (n: string) => join(app.getPath('userData'), n)

export function clientIdentity(): ClientIdentity {
  const f = file('client.json')
  let clientId: string
  if (existsSync(f)) clientId = (JSON.parse(readFileSync(f, 'utf8')) as { clientId: string }).clientId
  else {
    clientId = newClientId()
    writeFileSync(f, JSON.stringify({ clientId }))
  }
  return { clientId, version: app.getVersion(), platform: process.platform === 'darwin' ? 'macOS' : process.platform }
}

/** Token is encrypted with the OS keychain via Electron safeStorage; never written in plaintext. */
export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain unavailable; refusing to store token in plaintext')
  writeFileSync(file('token.bin'), safeStorage.encryptString(token))
}

export function loadToken(): string | null {
  const f = file('token.bin')
  if (!existsSync(f) || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(f))
  } catch {
    return null
  }
}

export function clearToken(): void {
  rmSync(file('token.bin'), { force: true })
}
