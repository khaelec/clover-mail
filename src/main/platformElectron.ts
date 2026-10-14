import { dialog, shell, safeStorage } from 'electron'
import { setPlatform, type Platform } from './platform'

/** Register the Electron-backed platform services used by the desktop app. */
export function registerElectronPlatform(): void {
  const impl: Platform = {
    showSaveDialog: (defaultPath) =>
      dialog.showSaveDialog({ defaultPath }).then((r) => ({
        canceled: r.canceled,
        filePath: r.filePath
      })),
    showOpenDialog: ({ title, filters }) =>
      dialog
        .showOpenDialog({ title, properties: ['openFile'], filters })
        .then((r) => ({ canceled: r.canceled, filePaths: r.filePaths })),
    openPath: (path) => shell.openPath(path),
    encryptSecret: (plaintext) =>
      safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(plaintext).toString('base64')
        : null,
    decryptSecret: (encoded) => {
      try {
        return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
      } catch {
        return null
      }
    }
  }
  setPlatform(impl)
}
