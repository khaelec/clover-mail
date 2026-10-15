import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { dialog } from 'electron'
import { ipcHost as ipcMain } from '@main/ipcHost'
import { IpcChannels } from '@shared/channels'
import { detectWallpaperEngine } from '@main/wallpaper/engine'
import { allowMediaPath } from '@main/mediaAllow'

const VIDEO = ['mp4', 'webm', 'mkv', 'mov', 'm4v']
const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']
const HTML = ['html', 'htm']

function filtersFor(kind: string): Electron.FileFilter[] {
  if (kind === 'video') return [{ name: 'Video', extensions: VIDEO }]
  if (kind === 'image' || kind === 'gif') return [{ name: 'Image', extensions: IMAGE }]
  if (kind === 'html' || kind === 'wallpaper-engine') return [{ name: 'Web page', extensions: HTML }]
  return [{ name: 'Media', extensions: [...VIDEO, ...IMAGE, ...HTML] }]
}

export function registerWallpaperIpc(): void {
  ipcMain.handle(IpcChannels.wallpaper.pickFile, async (_e, kind: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filtersFor(kind)
    })
    if (result.canceled || result.filePaths.length === 0) return null
    allowMediaPath(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.wallpaper.pickFolder, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    allowMediaPath(result.filePaths[0])
    return result.filePaths[0]
  })

  ipcMain.handle(IpcChannels.wallpaper.listFolder, (_e, folder: string) => {
    try {
      return readdirSync(folder)
        .filter((name) => IMAGE.includes(extname(name).slice(1).toLowerCase()))
        .map((name) => join(folder, name))
    } catch {
      return []
    }
  })

  ipcMain.handle(IpcChannels.wallpaper.detectEngine, () => detectWallpaperEngine())
}
