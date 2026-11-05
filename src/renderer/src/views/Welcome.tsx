import { useState } from 'react'
import { useAuth } from '../api'
import { Logo } from '../components/Logo'
import s from './Welcome.module.css'

/** First launch (or after signing out): nothing works without a Plex account, so this is the whole screen. */
export function Welcome() {
  const { data } = useAuth()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const waiting = starting || !!data?.pending
  const error = startError || data?.error

  const start = () => {
    setStarting(true)
    setStartError('')
    window.matome
      .invoke('auth:start', undefined)
      .catch((e: Error) => setStartError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
      .finally(() => setStarting(false))
  }

  return (
    <main className={s.page}>
      <div className={s.drag} />
      <div className={s.card}>
        <Logo />
        <h1>All your Plex libraries, in one place.</h1>
        <p>
          Sign in with your Plex account. Matome finds every server you can reach, yours and your friends', and merges their movies and shows into one library. A title that lives on three servers is one poster.
        </p>
        <div className={s.actions}>
          <button className="btn btn-primary btn-lg" onClick={start} disabled={waiting}>
            {waiting ? 'Waiting for you…' : 'Sign in with Plex'}
          </button>
        </div>
        {waiting && !error && (
          <p className={s.hint} role="status">
            A browser window opened. Approve <b>Matome</b> there, then come back here.{' '}
            <button className={s.link} onClick={start}>Open it again</button>
          </p>
        )}
        {error && (
          <p className={`${s.hint} ${s.err}`} role="alert">
            {error} <button className={s.link} onClick={start}>Try again</button>
          </p>
        )}
        <p className={s.fine}>
          You approve on plex.tv, so Matome never sees your password. The sign-in token is kept in your Mac's Keychain and never leaves this app. Matome is independent and not affiliated with Plex.
        </p>
      </div>
    </main>
  )
}
