import { app, Menu, nativeImage, Tray, type BrowserWindow } from 'electron'

let tray: Tray | null = null

export function createTray(getWindow: () => BrowserWindow | null, onQuit: () => void): void {
  if (tray) return
  const icon = nativeImage.createFromPath(process.execPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
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
