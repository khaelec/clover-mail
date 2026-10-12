import { ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import { dictationSupported, setDictationEmitter, startDictation, stopDictation } from '@main/dictation'

export function registerDictationIpc(getWindow: () => BrowserWindow | null): void {
  setDictationEmitter((event) => getWindow()?.webContents.send(IpcChannels.dictation.event, event))
  ipcMain.handle(IpcChannels.dictation.start, () => startDictation())
  ipcMain.on(IpcChannels.dictation.stop, () => stopDictation())
  ipcMain.handle(IpcChannels.dictation.supported, () => dictationSupported())
}
