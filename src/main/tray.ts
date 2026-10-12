import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'
import { TRAY_ICON_PNG_BASE64 } from './trayIcon'

let tray: Tray | null = null

function trayImage(): Electron.NativeImage {
  const image = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64'))
  return image.isEmpty() ? nativeImage.createEmpty() : image
}

export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void): void {
  if (tray) return
  tray = new Tray(trayImage())
  tray.setToolTip('Clover Mail')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Clover Mail',
        click: () => {
          const win = getWindow()
          win?.show()
          win?.focus()
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: onQuit }
    ])
  )
  tray.on('click', () => {
    const win = getWindow()
    if (!win) return
    if (win.isVisible() && !win.isMinimized()) win.hide()
    else {
      win.show()
      win.focus()
    }
  })
}

export function setTrayUnread(count: number): void {
  tray?.setToolTip(count > 0 ? `Clover Mail — ${count} unread` : 'Clover Mail')
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export { app }
