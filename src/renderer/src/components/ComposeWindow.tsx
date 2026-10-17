import { useEffect, useState, type ReactNode } from 'react'
import type { ComposeWindowPayload } from '@shared/ipc'
import { useMail } from '../state/mail'
import { Compose } from './Compose'
import { Toaster } from './Toaster'

/**
 * A message being written in its own window (the pop-out button in the
 * composer). It picks up the message from the main window once, then sends,
 * saves and closes on its own.
 */
export function ComposeWindow({ token }: { token: string }): ReactNode {
  const [payload, setPayload] = useState<ComposeWindowPayload | null | undefined>(undefined)

  useEffect(() => {
    void (async () => {
      const taken = await window.clover.takeComposeWindow(token)
      if (taken) {
        // Sending and saving drafts read the account and its folders.
        const [accounts, folders] = await Promise.all([
          window.clover.mail.listAccounts(),
          window.clover.mail.listFolders(taken.accountId)
        ])
        useMail.setState({ accounts, folders, activeAccountId: taken.accountId })
      } else {
        document.title = 'New message'
      }
      setPayload(taken)
    })()
  }, [token])

  if (payload === undefined) return <div className="h-full bg-surface" />
  if (payload === null) {
    return (
      <div className="grid h-full place-items-center bg-canvas p-8 text-center text-[13px] text-muted">
        This message was already opened in another window.
      </div>
    )
  }

  return (
    <div className="flex h-full bg-canvas text-ink">
      <Compose
        popout
        accountId={payload.accountId}
        accountEmail={payload.accountEmail}
        initialFromEmail={payload.fromEmail}
        initialTo={payload.to}
        initialCc={payload.cc}
        initialBcc={payload.bcc}
        initialHtml={payload.html}
        initialDirty={payload.dirty}
        initialSubject={payload.subject}
        initialDraftUid={payload.draftUid}
        initialAttachments={payload.attachments}
        inReplyTo={payload.inReplyTo}
        references={payload.references}
        onClose={() => window.close()}
      />
      <Toaster />
    </div>
  )
}
