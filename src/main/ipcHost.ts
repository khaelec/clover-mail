import { ipcMain } from 'electron'
import { registerChannel } from '@core/transport/registry'

/**
 * Drop-in replacement for Electron's `ipcMain` that also registers each handler
 * in the core channel registry, so the HTTP/WS transport can serve the exact same
 * handlers to the mobile client. ipc files only change their import.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const noEvent = {} as Electron.IpcMainInvokeEvent

export const ipcHost = {
  handle(channel: string, handler: (...args: any[]) => any): void {
    ipcMain.handle(channel, handler as unknown as Parameters<typeof ipcMain.handle>[1])
    registerChannel(channel, (...args) => handler(noEvent, ...args))
  },
  on(channel: string, handler: (...args: any[]) => void): void {
    ipcMain.on(channel, handler as unknown as Parameters<typeof ipcMain.on>[1])
  }
}
