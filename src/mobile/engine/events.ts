import { IpcChannels } from '@shared/channels'
import type { Emit } from '@core/mail/sync'

/**
 * Android mail emitter. The desktop's `createMailEmit` shows an OS notification;
 * on the phone the engine just posts the event over the message channel and the
 * app decides what to do (a system notification, a bell item).
 */
type Poster = (channel: string, payload: unknown) => void

let poster: Poster = () => {}

export function setMailPoster(next: Poster): void {
  poster = next
}

export function createMailEmit(_getWindow?: () => unknown): Emit {
  return (event) => poster(IpcChannels.mail.events, event)
}
