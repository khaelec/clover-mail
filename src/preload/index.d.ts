import type { ElectronAPI } from '@electron-toolkit/preload'
import type { CloverApi } from '@shared/ipc'

declare global {
  interface Window {
    electron: ElectronAPI
    clover: CloverApi
  }
}

export {}
