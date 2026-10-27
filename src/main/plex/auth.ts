import { authAppUrl, pinsUrl, pinUrl } from './endpoints'
import { plexFetch, type ClientIdentity } from './client'

interface Pin {
  id: number
  code: string
  authToken: string | null
}

export interface PinSession {
  id: number
  code: string
  authUrl: string
}

export async function startPin(id: ClientIdentity): Promise<PinSession> {
  const pin = await plexFetch<Pin>(id, pinsUrl(true), { method: 'POST' })
  return { id: pin.id, code: pin.code, authUrl: authAppUrl(id.clientId, pin.code) }
}

/** Returns the auth token once the user has approved the PIN, else null. */
export async function checkPin(id: ClientIdentity, pinId: number): Promise<string | null> {
  const pin = await plexFetch<Pin>(id, pinUrl(pinId))
  return pin.authToken
}

export async function pollPin(
  id: ClientIdentity,
  pinId: number,
  { intervalMs = 1500, timeoutMs = 300_000 } = {},
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const t = await checkPin(id, pinId)
    if (t) return t
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('PIN login timed out')
}
