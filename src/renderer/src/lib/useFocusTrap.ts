import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab inside a modal, moves focus into it on open, and closes on Escape.
 * Used by the Rules, Event, Link and attachment-preview dialogs. `active` lets an
 * always-mounted dialog (the link prompt) enable the trap only while open.
 */
export function useFocusTrap(
  container: { current: HTMLElement | null },
  onClose?: () => void,
  active = true
): void {
  // Keep the latest close handler without re-running the effect (and re-focusing)
  // on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!active) return
    const root = container.current
    if (!root) return

    const focusable = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )

    focusable()[0]?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [container, active])
}
