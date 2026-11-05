import { useEffect, useState } from 'react'
import { useRefresh } from '../api'
import s from './NoServers.module.css'

/** Signed in, but no server has shown up (yet). The first seconds after sign-in look the same as "none", so wait before saying so. */
export function NoServers() {
  const refresh = useRefresh()
  const [busy, setBusy] = useState(false)
  const [late, setLate] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 12_000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={s.box}>
      {late ? (
        <>
          <h3>No Plex servers found on this account</h3>
          <p>Matome only shows servers your Plex account can reach. Check that your server is running and signed in to this account, or that a friend has shared theirs with you.</p>
          <div className={s.actions}>
            <button className="btn btn-primary" disabled={busy} onClick={() => { setBusy(true); void refresh().finally(() => setBusy(false)) }}>{busy ? 'Looking…' : 'Look again'}</button>
            <button className="btn" onClick={() => void window.matome.invoke('auth:signOut', undefined)}>Use another account</button>
          </div>
        </>
      ) : (
        <>
          <h3>Looking for your servers…</h3>
          <p>This takes a few seconds the first time. Libraries appear as each server answers.</p>
          <div className={`skeleton ${s.bar}`} />
        </>
      )}
    </div>
  )
}
