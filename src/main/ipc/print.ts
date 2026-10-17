import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IpcChannels } from '@shared/channels'

/**
 * Print a page the renderer built (a message with its header). It loads in a
 * hidden window with scripts off and its own session, from a temp file in our
 * own temp folder that is removed afterwards.
 */
export function registerPrintIpc(): void {
  ipcMain.handle(IpcChannels.appPrintHtml, async (_e, html: string) => {
    if (typeof html !== 'string') return false
    const dir = join(app.getPath('temp'), 'clover-print')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${randomUUID()}.html`)
    writeFileSync(file, html, 'utf8')
    const win = new BrowserWindow({
      show: false,
      webPreferences: { javascript: false, sandbox: true, partition: 'clover-print' }
    })
    try {
      await win.loadFile(file)
      return await new Promise<boolean>((resolve) =>
        win.webContents.print({ printBackground: true }, (success) => resolve(success))
      )
    } finally {
      win.destroy()
      rmSync(file, { force: true })
    }
  })
}
