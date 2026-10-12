import type { AttachmentSummary, MessageSummary } from '@shared/mail'
import { attachments, messages } from '../db/schema'

export function toMessageSummary(row: typeof messages.$inferSelect): MessageSummary {
  return {
    id: row.id,
    accountId: row.accountId,
    folderId: row.folderId,
    uid: row.uid,
    subject: row.subject,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    dateUtc: row.dateUtc,
    snippet: row.snippet,
    isRead: row.isRead,
    isFlagged: row.isFlagged,
    hasAttachments: row.hasAttachments,
    spamScore: row.spamScore,
    isSpam: row.isSpam,
    isImportant: row.isImportant
  }
}

export function toAttachmentSummary(row: typeof attachments.$inferSelect): AttachmentSummary {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    isInline: row.isInline,
    available: row.contentPath !== null
  }
}
