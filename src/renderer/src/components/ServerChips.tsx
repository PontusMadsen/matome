import { useServers } from '../api'
import s from './ServerChips.module.css'

export function ServerChips() {
  const { data } = useServers()
  return (
    <div className={s.chips}>
      {(data ?? []).map((sv) => (
        <span key={sv.id} className={`${s.chip} ${sv.online ? s.on : s.off}`} title={sv.online ? `${sv.latencyMs} ms` : 'offline'}>
          {sv.name}
        </span>
      ))}
    </div>
  )
}
