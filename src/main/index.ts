import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { Service } from './service'
import { clientIdentity } from './session'
import { openDb } from './db'
import { Updater } from './updater'
import { loadWindowState, trackWindowState } from './window-state'

function createWindow(): void {
  const st = loadWindowState()
  const win = new BrowserWindow({
    ...st,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0E1116',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  trackWindowState(win)
  if ((st as { maximized?: boolean }).maximized) win.maximize()
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

protocol.registerSchemesAsPrivileged([
  // `standard` is required so relative URLs inside HLS playlists resolve against flax-stream://<server>/...
  { scheme: 'flax-img', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'flax-stream', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
])

void app.whenReady().then(() => {
  const svc = new Service(openDb(join(app.getPath('userData'), 'cache.db')), clientIdentity(), join(app.getPath('userData'), 'settings.json'), join(app.getPath('userData'), 'img-cache'))
  const updater = new Updater()
  registerIpc(ipcMain, svc, updater)
  updater.start()
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
