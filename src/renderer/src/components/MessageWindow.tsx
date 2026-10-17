import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { Reader } from './Reader'
import { Toaster } from './Toaster'

type Action = 'reply' | 'replyAll' | 'forward'

/**
 * A message opened in its own window (double-click in the list). Reading,
 * flagging and filing work here; Reply/Forward hand over to the main window,
 * where the compose window lives.
 */
export function MessageWindow({ messageId }: { messageId: string }): ReactNode {
  const detail = useMail((s) => s.detail)
  const [loaded, setLoaded] = useState(false)
  const hadDetail = useRef(false)

  useEffect(() => {
    void useMail
      .getState()
      .selectMessage(messageId)
      .then(() => {
        setLoaded(true)
        if (!useMail.getState().detail) document.title = 'Message not found'
      })
  }, [messageId])

  // Title the window after the message; close it once the message is filed or
  // deleted from here.
  useEffect(() => {
    if (detail) {
      hadDetail.current = true
      document.title = detail.subject || '(no subject)'
    } else if (hadDetail.current && useMail.getState().selectedMessageId === null) {
      // Filing/deleting clears the selection; a reload only blanks the detail.
      window.close()
    }
  }, [detail])

  // Tell the main window when this message's state changes (read, starred, …)
  // so its list updates without waiting for the next sync.
  const lastKey = useRef('')
  useEffect(() => {
    if (!detail) return
    const key = `${detail.isRead}|${detail.isFlagged}|${detail.isImportant}`
    if (lastKey.current && lastKey.current !== key) window.clover.mailChanged()
    lastKey.current = key
  }, [detail])

  function act(action: Action): void {
    const d = useMail.getState().detail
    if (!d) return
    window.clover.messageAction({
      accountId: d.accountId,
      messageId: d.id,
      threadId: d.threadId ?? undefined,
      action
    })
  }

  if (loaded && !detail) {
    return (
      <div className="grid h-full place-items-center bg-canvas p-8 text-center text-[13px] text-muted">
        This message is no longer available.
      </div>
    )
  }

  return (
    <div className="flex h-full bg-canvas text-ink">
      <Reader onReply={() => act('reply')} onReplyAll={() => act('replyAll')} onForward={() => act('forward')} />
      <Toaster />
    </div>
  )
}
