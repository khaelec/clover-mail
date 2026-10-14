import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  kind: 'info' | 'error'
  actionLabel?: string
  onAction?: () => void
}

interface ToastsState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

let counter = 0

export const useToasts = create<ToastsState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = `${Date.now()}-${counter++}`
    // Keep a short stack so a burst of errors can't cover the UI.
    set({ toasts: [...get().toasts, { ...toast, id }].slice(-4) })
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))
