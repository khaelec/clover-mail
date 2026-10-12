import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { folders, messages } from '../db/schema'
import { moveMessage, setFlags } from './messages'
import type { BulkActionInput, BulkActionResult } from '@shared/mail'

function specialFolderId(accountId: string, use: string): string | undefined {
  return getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.accountId, accountId), eq(folders.specialUse, use)))
    .get()?.id
}

export async function bulkAction(input: BulkActionInput): Promise<BulkActionResult> {
  const result: BulkActionResult = { moved: 0, updated: 0, failed: 0 }
  const db = getDb()

  for (const id of input.messageIds) {
    try {
      const row = db.select().from(messages).where(eq(messages.id, id)).get()
      if (!row) {
        result.failed += 1
        continue
      }

      if (input.action === 'archive') {
        // Gmail-style archive: move out of Inbox to Archive / All Mail.
        const target =
          specialFolderId(row.accountId, 'archive') ?? specialFolderId(row.accountId, 'all')
        if (!target) {
          result.failed += 1
          continue
        }
        await moveMessage(id, target)
        result.moved += 1
      } else if (input.action === 'trash') {
        const target = specialFolderId(row.accountId, 'trash')
        if (!target) {
          result.failed += 1
          continue
        }
        await moveMessage(id, target)
        result.moved += 1
      } else if (input.action === 'markRead') {
        await setFlags(id, { seen: true })
        result.updated += 1
      } else if (input.action === 'markUnread') {
        await setFlags(id, { seen: false })
        result.updated += 1
      } else if (input.action === 'markImportant') {
        await setFlags(id, { important: true })
        result.updated += 1
      } else if (input.action === 'markNotImportant') {
        await setFlags(id, { important: false })
        result.updated += 1
      } else if (input.action === 'move' && input.targetFolderId) {
        await moveMessage(id, input.targetFolderId)
        result.moved += 1
      }
    } catch {
      result.failed += 1
    }
  }

  return result
}
