import { useEffect, type ReactNode } from 'react'
import { useToasts, type Toast } from '../state/toasts'
import { IconClose } from './icons'

const DISMISS_MS = 6000

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast
  onDismiss: (id: string) => void
}): ReactNode {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] text-ink shadow-2xl"
    >
      <span className={'min-w-0 flex-1 ' + (toast.kind === 'error' ? 'text-rose-500' : '')}>
        {toast.message}
      </span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.()
            onDismiss(toast.id)
          }}
          className="shrink-0 font-medium text-accent hover:underline"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        className="grid h-5 w-5 shrink-0 place-items-center text-muted hover:text-ink"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function Toaster(): ReactNode {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}
