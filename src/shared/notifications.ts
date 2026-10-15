export type NotificationKind = 'mail' | 'app' | 'update'

/** A bell item, as stored in the database so the bell survives restarts. */
export interface StoredNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  at: number
  read: boolean
  accountId?: string
  messageId?: string
  threadId?: string
  appId?: string
  appName?: string
  appNotifId?: string
  count?: number
}
