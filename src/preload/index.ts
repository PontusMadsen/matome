import { contextBridge, ipcRenderer } from 'electron'
import type { FlaxApi } from '@shared/ipc'

const api: FlaxApi = { invoke: (channel, req) => ipcRenderer.invoke(channel, req) }
contextBridge.exposeInMainWorld('flax', api)
