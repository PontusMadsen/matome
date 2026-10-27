// Minimal mpv JSON IPC client. Protocol: https://mpv.io/manual/master/#json-ipc
import { connect, type Socket } from 'node:net'
import { EventEmitter } from 'node:events'

interface Reply { request_id?: number; error?: string; data?: unknown; event?: string; name?: string }

export class MpvClient extends EventEmitter {
  private sock: Socket | null = null
  private buf = ''
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  connect(path: string, retries = 40, delayMs = 100): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (left: number) => {
        const s = connect(path)
        s.once('connect', () => {
          this.sock = s
          s.on('data', (d) => this.onData(d.toString('utf8')))
          s.on('close', () => {
            for (const p of this.pending.values()) p.reject(new Error('mpv closed'))
            this.pending.clear()
            this.emit('close')
          })
          resolve()
        })
        s.once('error', () => {
          s.destroy()
          if (left <= 0) reject(new Error('could not connect to mpv IPC socket'))
          else setTimeout(() => attempt(left - 1), delayMs)
        })
      }
      attempt(retries)
    })
  }

  private onData(chunk: string): void {
    this.buf += chunk
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (!line) continue
      let msg: Reply
      try { msg = JSON.parse(line) as Reply } catch { continue }
      if (msg.request_id !== undefined) {
        const p = this.pending.get(msg.request_id)
        this.pending.delete(msg.request_id)
        if (p && msg.error && msg.error !== 'success') p.reject(new Error(msg.error))
        else p?.resolve(msg.data)
      } else if (msg.event === 'property-change') this.emit('property', msg.name, msg.data)
      else if (msg.event) this.emit(msg.event, msg)
    }
  }

  command(...args: unknown[]): Promise<unknown> {
    const sock = this.sock
    if (!sock) return Promise.reject(new Error('not connected'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      sock.write(JSON.stringify({ command: args, request_id: id }) + '\n')
    })
  }

  observe(prop: string, id = this.nextId++): Promise<unknown> {
    return this.command('observe_property', id, prop)
  }
  set(prop: string, value: unknown): Promise<unknown> {
    return this.command('set_property', prop, value)
  }
  close(): void {
    this.sock?.destroy()
  }
}
