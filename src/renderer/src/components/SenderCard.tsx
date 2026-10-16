import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatAddress } from '@shared/addresses'
import type { Contact } from '@shared/contacts'
import { openCompose } from '../state/compose'
import { useMail } from '../state/mail'
import { useToasts } from '../state/toasts'

/**
 * A sender's name that opens a contact card on click (like Outlook's): their
 * details if they're in the address book, and quick actions.
 */
/** "Carol King" -> "Carol", "King, Carol" -> "Carol", none -> "them". */
function firstName(name: string | null | undefined): string {
  if (!name) return 'them'
  const [last, first] = name.split(',').map((p) => p.trim())
  return ((first || last).split(/\s+/)[0] || 'them').replace(/^"|"$/g, '')
}

export function SenderName({
  name,
  email,
  className
}: {
  name: string | null
  email: string | null
  className?: string
}): ReactNode {
  // Where the card opens (viewport coordinates), or null when closed. Rendered
  // in a portal: the reader header clips overflow, which would cut it off.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const open = at !== null
  const setOpen = (value: boolean): void => {
    if (!value) setAt(null)
  }
  const [contact, setContact] = useState<Contact | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const label = name || email || 'Unknown sender'

  useEffect(() => {
    if (!open || !email) return
    let live = true
    void window.clover.contacts
      .list('all', email)
      .then((list) => {
        if (live) setContact(list.find((c) => c.email === email.toLowerCase()) ?? null)
      })
      .catch(() => undefined)
    const close = (e: MouseEvent): void => {
      const target = e.target as Node
      if (!cardRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      live = false
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, email])

  if (!email) return <span className={className}>{label}</span>

  const shownName = contact?.name || name
  const saved = contact?.isSaved === true
  const action =
    'block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink hover:bg-black/5 dark:hover:bg-white/10'

  async function addToContacts(): Promise<void> {
    try {
      setContact(
        await window.clover.contacts.save({
          email: email as string,
          name: shownName
        })
      )
      useToasts.getState().push({
        message: `Added ${shownName || email} to contacts`,
        kind: 'info'
      })
    } catch (error) {
      useToasts.getState().push({ message: (error as Error).message, kind: 'error' })
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={email}
        onClick={(e) => {
          e.stopPropagation()
          if (open) {
            setAt(null)
            return
          }
          const rect = e.currentTarget.getBoundingClientRect()
          setAt({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
            top: Math.min(rect.bottom + 6, window.innerHeight - 320)
          })
        }}
        className={(className ?? '') + ' hover:underline'}
      >
        {label}
      </button>
      {at &&
        createPortal(
          <div
            ref={cardRef}
            style={{ left: at.left, top: at.top }}
            className="fixed z-[90] w-72 rounded-xl border border-line bg-surface p-3 text-left font-normal shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-[14px] font-semibold text-accent-ink">
                {(shownName || email).slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink">
                  {shownName || email}
                </span>
                <span className="block select-text truncate text-[12px] text-muted">{email}</span>
                {contact?.company && (
                  <span className="block truncate text-[12px] text-muted">{contact.company}</span>
                )}
              </span>
            </div>
            {contact?.phone && <p className="mt-2 select-text text-[12px] text-ink">{contact.phone}</p>}
            <div className="mt-2.5 border-t border-line pt-1.5">
              <button
                type="button"
                className={action}
                onClick={() => {
                  setOpen(false)
                  openCompose({ to: formatAddress(shownName, email) })
                }}
              >
                Send email
              </button>
              {!saved && (
                <button type="button" className={action} onClick={() => void addToContacts()}>
                  Add to contacts
                </button>
              )}
              <button
                type="button"
                className={action}
                onClick={() => {
                  setOpen(false)
                  void useMail.getState().search(`from:${email}`)
                }}
              >
                Find messages from {firstName(shownName)}
              </button>
              <button
                type="button"
                className={action}
                onClick={() => {
                  setOpen(false)
                  void navigator.clipboard.writeText(email)
                  useToasts.getState().push({ message: 'Address copied', kind: 'info' })
                }}
              >
                Copy address
              </button>
              {saved && (
                <button
                  type="button"
                  className={action}
                  onClick={() => {
                    setOpen(false)
                    window.dispatchEvent(
                      new CustomEvent('clover:navigate', {
                        detail: { section: 'contacts' }
                      })
                    )
                  }}
                >
                  Open in People
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
