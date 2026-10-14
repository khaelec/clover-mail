import { Notification, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import type { MailEvent } from '@shared/mail'

export type Emit = (event: MailEvent) => void

/** Forwards mail events to the renderer and shows a native notification for new mail. */
export function createMailEmit(getWindow: () => BrowserWindow | null): Emit {
  return (event) => {
    getWindow()?.webContents.send(IpcChannels.mail.events, event)
    if (event.type === 'mail:new') {
      try {
        const notification = new Notification({
          title: event.title ? `New mail from ${event.title}` : 'New mail',
          body: event.body ?? ''
        })
        notification.on('click', () => {
          const win = getWindow()
          win?.show()
          win?.focus()
        })
        notification.show()
      } catch {
        // notifications may be unavailable
      }
    }
  }
}
