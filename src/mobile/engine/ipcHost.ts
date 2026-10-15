import { registerChannel } from '@core/transport/registry'

/**
 * Electron-free `ipcHost`. On desktop the real one (src/main/ipcHost.ts) forwards
 * to Electron's ipcMain AND the channel registry; on the phone there is no
 * ipcMain, so handlers only go into the registry — the message channel serves
 * them via `dispatch(channel, args)`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const noEvent = {}

export const ipcHost = {
  handle(channel: string, handler: (...args: any[]) => any): void {
    registerChannel(channel, (...args) => handler(noEvent, ...args))
  },
  on(_channel: string, _handler: (...args: any[]) => void): void {
    // No event channels on the phone engine (main→renderer events go via the
    // message channel instead).
  }
}
