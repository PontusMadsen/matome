import { contextBridge, ipcRenderer } from 'electron'
import type { MatomeApi } from '@shared/ipc'

const api: MatomeApi = { invoke: (channel, req) => ipcRenderer.invoke(channel, req) }
contextBridge.exposeInMainWorld('matome', api)
