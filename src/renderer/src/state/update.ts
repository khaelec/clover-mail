import { create } from 'zustand'
import type { UpdateEvent } from '@shared/ipc'
import { useNotifications } from './notifications'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'none'
  | 'dev'
  | 'managed'
  | 'error'

interface UpdateState {
  status: UpdateStatus
  version?: string
  percent?: number
  error?: string
  dismissed: boolean
  init: () => void
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => void
  dismiss: () => void
}

let subscribed = false

export const useUpdate = create<UpdateState>((set) => ({
  status: 'idle',
  dismissed: false,

  init: () => {
    if (subscribed) return
    subscribed = true
    window.clover.update.onEvent((event: UpdateEvent) => {
      switch (event.type) {
        case 'checking':
          set({ status: 'checking' })
          break
        case 'available':
          set({ status: 'available', version: event.version, dismissed: false })
          useNotifications.getState().add({
            kind: 'update',
            title: `Clover Mail ${event.version} is available`,
            body: 'Open Settings → Updates to download it.',
            nav: 'settings'
          })
          break
        case 'none':
          set({ status: 'none' })
          break
        case 'progress':
          set({ status: 'downloading', percent: event.percent ?? 0 })
          break
        case 'downloaded':
          set({ status: 'ready', version: event.version })
          break
        case 'error':
          set({ status: 'error', error: event.error })
          break
        case 'unavailable-dev':
          set({ status: 'dev' })
          break
        case 'unavailable-managed':
          set({ status: 'managed' })
          break
      }
    })
  },

  check: async () => {
    set({ status: 'checking' })
    await window.clover.update.check()
  },
  download: async () => {
    set({ status: 'downloading', percent: 0 })
    await window.clover.update.download()
  },
  install: () => window.clover.update.install(),
  dismiss: () => set({ dismissed: true })
}))
