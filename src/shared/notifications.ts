export type NotificationKind = 'mail' | 'app' | 'update' | 'system'

/** Fields a notification is created from (everything the bell assigns itself). */
export interface NotificationInput {
  kind: NotificationKind
  title: string
  body?: string
  accountId?: string
  messageId?: string
  threadId?: string
  appId?: string
  appName?: string
  appNotifId?: string
  count?: number
  /** Where clicking the item should take the user (e.g. 'calendar'). */
  nav?: string
}

/** A bell item, as stored in the database so the bell survives restarts. */
export interface StoredNotification extends NotificationInput {
  id: string
  body: string
  at: number
  read: boolean
}
