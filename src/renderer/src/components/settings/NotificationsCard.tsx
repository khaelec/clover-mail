import { useEffect, useState, type ReactNode } from 'react'
import { SETTINGS_KEYS, type NotificationSound } from '@shared/theme'
import type { AccountSummary } from '@shared/mail'
import { playChime } from '../../lib/chime'
import { Card } from './ui'

const SOUNDS: { id: NotificationSound; label: string; hint: string }[] = [
  { id: 'chime', label: 'Clover chime', hint: 'A soft two-note chime' },
  { id: 'system', label: 'Windows sound', hint: 'Your system notification sound' },
  { id: 'off', label: 'No sound', hint: 'Show the alert silently' }
]

/** New-mail alerts: the sound, and which accounts alert at all. */
export function NotificationsCard({ accounts }: { accounts: AccountSummary[] }): ReactNode {
  const [sound, setSound] = useState<NotificationSound>('chime')
  const [muted, setMuted] = useState<string[]>([])

  useEffect(() => {
    void window.clover.settings.getAll().then((all) => {
      const s = all[SETTINGS_KEYS.notificationSound]
      if (s === 'chime' || s === 'system' || s === 'off') setSound(s)
      const m = all[SETTINGS_KEYS.notificationMutedAccounts]
      setMuted(Array.isArray(m) ? (m as string[]) : [])
    })
  }, [])

  function pickSound(next: NotificationSound): void {
    setSound(next)
    void window.clover.settings.set(SETTINGS_KEYS.notificationSound, next)
    if (next === 'chime') playChime()
  }

  function toggleAccount(id: string): void {
    const next = muted.includes(id) ? muted.filter((m) => m !== id) : [...muted, id]
    setMuted(next)
    void window.clover.settings.set(SETTINGS_KEYS.notificationMutedAccounts, next)
  }

  const real = accounts.filter((a) => a.incoming.protocol !== 'local')
  return (
    <Card title="New mail alerts">
      <div className="space-y-1.5">
        <span className="block text-[13px] text-ink">Sound</span>
        <div role="radiogroup" aria-label="New mail sound" className="flex flex-wrap gap-2">
          {SOUNDS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={sound === s.id}
              title={s.hint}
              onClick={() => pickSound(s.id)}
              className={
                'rounded-lg border px-3 py-1.5 text-[12px] ' +
                (sound === s.id ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink')
              }
            >
              {s.label}
            </button>
          ))}
          {sound === 'chime' && (
            <button type="button" onClick={playChime} className="px-1 text-[12px] text-accent hover:underline">
              Play
            </button>
          )}
        </div>
      </div>
      {real.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <span className="block text-[13px] text-ink">Alert me about new mail in</span>
          {real.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={!muted.includes(a.id)} onChange={() => toggleAccount(a.id)} />
              {a.email}
            </label>
          ))}
          <p className="text-[11px] text-muted">
            Unticked accounts still show new mail in the bell, without a popup or sound.
          </p>
        </div>
      )}
    </Card>
  )
}
