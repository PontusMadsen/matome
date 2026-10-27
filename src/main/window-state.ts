import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface State extends Rectangle { maximized: boolean }
const DEFAULT: State = { x: 0, y: 0, width: 1280, height: 800, maximized: false }
const file = () => join(app.getPath('userData'), 'window.json')

/** Last window bounds, discarded if they no longer fit any connected display. */
export function loadWindowState(): Partial<State> & Pick<State, 'width' | 'height'> {
  try {
    if (!existsSync(file())) return { width: DEFAULT.width, height: DEFAULT.height }
    const s = { ...DEFAULT, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<State>) }
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return s.x < a.x + a.width - 40 && s.x + s.width > a.x + 40 && s.y < a.y + a.height - 40 && s.y + s.height > a.y + 40
    })
    return visible ? s : { width: s.width, height: s.height }
  } catch {
    return { width: DEFAULT.width, height: DEFAULT.height }
  }
}

export function trackWindowState(win: BrowserWindow): void {
  let t: ReturnType<typeof setTimeout> | undefined
  const save = () => {
    clearTimeout(t)
    t = setTimeout(() => {
      if (win.isDestroyed()) return
      const maximized = win.isMaximized()
      const b = maximized ? { ...DEFAULT, ...loadRaw() } : win.getBounds()
      writeFileSync(file(), JSON.stringify({ ...b, maximized }))
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('close', () => { clearTimeout(t); if (!win.isDestroyed() && !win.isMaximized()) writeFileSync(file(), JSON.stringify({ ...win.getBounds(), maximized: false })) })
}

const loadRaw = (): Partial<State> => {
  try { return JSON.parse(readFileSync(file(), 'utf8')) as Partial<State> } catch { return {} }
}
