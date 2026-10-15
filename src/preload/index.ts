import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { buildCloverApi } from '@shared/cloverClient'

// The API surface lives in @shared/cloverClient so the mobile web client can
// build the exact same window.clover over its HTTP/SSE transport.
const api = buildCloverApi({
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, cb) => {
    const listener = (_event: unknown, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  getFilePath: (file) =>
    webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0])
})

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('clover', api)
} else {
  // @ts-expect-error fallback when context isolation is disabled
  window.clover = api
}
