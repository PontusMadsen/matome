import { useQueryClient } from '@tanstack/react-query'
import { useDownloads } from '../api'
import { Icon } from './Icon'
import s from './DownloadsTray.module.css'

const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`)

/** Bottom-right list of downloads: progress, cancel, show in Finder. Appears only while there is something to show. */
export function DownloadsTray() {
  const qc = useQueryClient()
  // The tray is for what is happening now; the Downloaded section is the library of what is saved.
  const data = (useDownloads().data ?? []).filter((d) => d.state !== 'done' || d.fresh)
  if (data.length === 0) return null
  const refresh = () => qc.invalidateQueries({ queryKey: ['downloads'] })
  const finished = data.some((d) => d.state !== 'active')
  return (
    <aside className={s.tray} aria-label="Downloads">
      <div className={s.head}>
        <span>Downloads</span>
        {finished && <button className={s.link} onClick={() => void window.flax.invoke('download:clear', undefined).then(refresh)}>Clear finished</button>}
      </div>
      {data.map((d) => (
        <div key={d.id} className={s.row}>
          <div className={s.name} title={d.title}>{d.title}</div>
          {d.state === 'active' && (
            <>
              <div className={s.bar} role="progressbar" aria-valuenow={d.total ? Math.round((d.received / d.total) * 100) : undefined}><i style={{ width: d.total ? `${Math.min(100, (d.received / d.total) * 100)}%` : '35%' }} className={d.total ? '' : s.indet} /></div>
              <div className={s.meta}>
                <span>{mb(d.received)}{d.total ? ` of ${mb(d.total)}` : ''}</span>
                <button className={s.icon} aria-label={`Cancel download of ${d.title}`} title="Cancel" onClick={() => void window.flax.invoke('download:cancel', { id: d.id }).then(refresh)}><Icon name="close" size={14} /></button>
              </div>
            </>
          )}
          {d.state === 'done' && (
            <div className={s.meta}>
              <span>Saved · {mb(d.received)}</span>
              <button className={s.link} onClick={() => void window.flax.invoke('download:reveal', { id: d.id })}>Show in Finder</button>
            </div>
          )}
          {d.state === 'error' && <div className={`${s.meta} ${s.err}`} role="alert">{d.error ?? 'Download failed.'}</div>}
          {d.state === 'canceled' && <div className={s.meta}>Canceled</div>}
        </div>
      ))}
    </aside>
  )
}
