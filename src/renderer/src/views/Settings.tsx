import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { QUALITY_OPTIONS, type Settings as Prefs } from '@shared/types'
import { useAuth, useRefresh, useServers } from '../api'
import { Icon } from '../components/Icon'
import s from './Settings.module.css'
import { SKINS, applySkin } from '../skins'
import { ScrollPage } from '../components/ScrollPage'

function ago(ms?: number): string {
  if (!ms) return ''
  const s = Math.round((Date.now() - ms) / 1000)
  return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`
}

function Updates() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data } = useQuery({
    queryKey: ['update'],
    queryFn: () => window.flax.invoke('update:status', undefined),
    refetchInterval: (q) => (busy || q.state.data?.state === 'checking' || q.state.data?.state === 'downloading' ? 700 : 3000),
  })
  if (!data) return null
  const inval = () => qc.invalidateQueries({ queryKey: ['update'] })
  const working = busy || data.state === 'checking' || data.state === 'downloading'
  const check = () => {
    setBusy(true)
    void window.flax.invoke('update:check', undefined).finally(() => { setBusy(false); void inval() })
  }
  const status =
    data.state === 'error' ? data.error
    : data.state === 'checking' || busy ? 'Checking GitHub…'
    : data.state === 'downloading' ? `Downloading update${data.progress !== undefined ? ` · ${Math.round(data.progress * 100)}%` : '…'}`
    : data.state === 'ready' ? 'Update downloaded. Restart to install it.'
    : `Up to date · checked ${ago(data.checkedAt) || 'at launch'}`
  return (
    <section className={s.card}>
      <h2>Updates</h2>
      {data.state === 'disabled' ? (
        <p className={s.hint}>Self-update is only active in the installed app (this is a development build).</p>
      ) : (
        <>
          <div className={s.row}>
            <div className={s.grow}>
              <div className={s.label}>Version <span className={s.mono}>{data.current}</span>{data.latest && data.latest !== data.current ? <span className={s.hint}> · latest {data.latest}</span> : null}</div>
              <div className={`${s.hint} ${data.state === 'error' ? s.err : ''}`}>{status}</div>
              {data.state === 'downloading' && (
                <div style={{ height: 4, borderRadius: 2, background: 'var(--s3)', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((data.progress ?? 0) * 100)}%`, background: 'var(--accent)', transition: 'width 300ms' }} />
                </div>
              )}
            </div>
            {data.state === 'ready' ? (
              <button className="btn btn-primary" onClick={() => void window.flax.invoke('update:apply', undefined)}>Restart to update</button>
            ) : (
              <button className="btn" disabled={working} onClick={check}><Icon name="refresh" size={15} /> {working ? 'Working…' : 'Check now'}</button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export function Settings() {
  const { data: auth } = useAuth()
  const { data: servers = [] } = useServers()
  const refresh = useRefresh()
  const qc = useQueryClient()
  const { data: prefs } = useQuery({ queryKey: ['settings'], queryFn: () => window.flax.invoke('settings:get', undefined) })
  const [busy, setBusy] = useState(false)
  const save = (p: Prefs) => window.flax.invoke('settings:set', p).then(() => qc.invalidateQueries())
  return (
    <ScrollPage className={s.page}>
      <div className={s.cols}>
        <section className={s.card}>
          <h2>Plex account</h2>
          {auth?.signedIn ? (
            <div className={s.row}>
              <div className={s.grow}>
                <div className={s.label}>Signed in</div>
                <div className={s.hint}>{servers.length} server{servers.length === 1 ? '' : 's'} found</div>
              </div>
              <button className="btn" disabled={busy} onClick={() => { setBusy(true); void refresh().finally(() => setBusy(false)) }}><Icon name="refresh" size={15} /> {busy ? 'Syncing…' : 'Refresh now'}</button>
              <button className="btn" onClick={() => void window.flax.invoke('auth:signOut', undefined).then(() => qc.invalidateQueries())}>Sign out</button>
            </div>
          ) : (
            <div className={s.row}>
              <div className={s.grow}>
                <div className={s.label}>Not signed in</div>
                <div className={`${s.hint} ${auth?.error ? s.err : ''}`}>{auth?.error ?? (auth?.pending ? 'Waiting for you to approve in the browser…' : 'A browser window opens; approve Fläx there, then come back.')}</div>
              </div>
              <button className="btn btn-primary" onClick={() => void window.flax.invoke('auth:start', undefined)}>Sign in with Plex</button>
            </div>
          )}
        </section>

        {auth?.signedIn && (
          <section className={s.card}>
            <h2>Servers</h2>
            <div>
              {servers.map((sv) => (
                <div key={sv.id} className={s.srv}>
                  <span className={`dot ${sv.online ? 'on' : ''}`} />
                  <span className={s.srvname}>{sv.name}</span>
                  <span className={s.hint}>{sv.online ? `${sv.latencyMs} ms · ${['local', 'remote', 'relay'][sv.connectionPref]}` : 'offline'}</span>
                  {!sv.owned && <span className={s.tag}>Shared</span>}
                  <input type="checkbox" className={s.switch} title="Include in merged views" checked={!prefs?.excludedServers.includes(sv.id)} onChange={(e) => prefs && void save({ ...prefs, excludedServers: e.target.checked ? prefs.excludedServers.filter((x) => x !== sv.id) : [...prefs.excludedServers, sv.id] })} />
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={s.card}>
          <h2>Appearance</h2>
          <div className={s.skins} role="radiogroup" aria-label="Skin">
            {SKINS.map((k) => (
              <button key={k.id} role="radio" aria-checked={(prefs?.skin ?? 'default') === k.id} className={`${s.skin} ${(prefs?.skin ?? 'default') === k.id ? s.skinOn : ''}`} onClick={() => { applySkin(k.id); if (prefs) void save({ ...prefs, skin: k.id }) }}>
                <span className={s.swatch} aria-hidden>
                  <i style={{ background: k.swatch[0] }} /><i style={{ background: k.swatch[1] }} /><i style={{ background: k.swatch[2] }} />
                </span>
                <span className={s.skinname}>{k.name}</span>
                <span className={s.skinblurb}>{k.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={s.card}>
          <h2>Home screen</h2>
          <div className={s.row}>
            <div className={s.grow}><div className={s.label}>Hide watched titles</div><div className={s.hint}>"Recently added movies" and "Recently added shows" skip what you have already watched, on any server.</div></div>
            <input type="checkbox" className={s.switch} aria-label="Hide watched titles on Home" checked={prefs?.hideWatchedOnHome ?? false} onChange={(e) => prefs && void save({ ...prefs, hideWatchedOnHome: e.target.checked })} />
          </div>
        </section>

        <section className={s.card}>
          <h2>Playback</h2>
          <div className={s.row}>
            <div className={s.grow}><div className={s.label}>Streaming quality</div><div className={s.hint}>Cap for transcoded streams. Change it any time in the player.</div></div>
            <select value={prefs?.maxBitrateKbps ?? 0} onChange={(e) => prefs && void save({ ...prefs, maxBitrateKbps: Number(e.target.value) })}>
              {QUALITY_OPTIONS.map((q) => <option key={q.kbps} value={q.kbps}>{q.label}</option>)}
            </select>
          </div>
          <div className={s.row}>
            <div className={s.grow}><div className={s.label}>Use mpv for direct play</div><div className={s.hint}>Any codec, HDR, ASS/PGS subtitles. Needs mpv installed (brew install mpv).</div></div>
            <input type="checkbox" className={s.switch} checked={prefs?.useMpv ?? false} onChange={(e) => prefs && void save({ ...prefs, useMpv: e.target.checked })} />
          </div>
          <div className={s.row}>
            <div className={s.grow}><div className={s.label}>Skip intros automatically</div><div className={s.hint}>mpv only.</div></div>
            <input type="checkbox" className={s.switch} checked={prefs?.autoSkipIntro ?? false} onChange={(e) => prefs && void save({ ...prefs, autoSkipIntro: e.target.checked })} />
          </div>
          <div className={s.row}>
            <div className={s.grow}><div className={s.label}>Default speed · audio boost · subtitle size</div><div className={s.hint}>mpv only.</div></div>
            <select value={prefs?.playbackSpeed ?? 1} onChange={(e) => prefs && void save({ ...prefs, playbackSpeed: Number(e.target.value) })}>
              {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
            <select value={prefs?.audioBoostPct ?? 0} onChange={(e) => prefs && void save({ ...prefs, audioBoostPct: Number(e.target.value) })}>
              {[0, 10, 20, 30].map((r) => <option key={r} value={r}>+{r}%</option>)}
            </select>
            <select value={prefs?.subScale ?? 1} onChange={(e) => prefs && void save({ ...prefs, subScale: Number(e.target.value) })}>
              {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          </div>
        </section>

        <Updates />
      </div>
    </ScrollPage>
  )
}
