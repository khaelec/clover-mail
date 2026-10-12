import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import {
  folders,
  messageBodies,
  messages,
  ruleActions,
  ruleConditions,
  rules
} from '../db/schema'
import { getAccountById, getAccountPassword } from './accounts'
import { buildImapClient } from './imap'
import { removeFromIndex } from './search'
import { allFoldersSorted } from './queries'
import type { Rule, RuleActionInput, RuleConditionInput, RuleInput } from '@shared/mail'

type RuleRow = typeof rules.$inferSelect

function toRule(
  row: RuleRow,
  conditions: RuleConditionInput[],
  actions: RuleActionInput[]
): Rule {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    isEnabled: row.isEnabled,
    matchAll: row.matchAll,
    stopProcessing: row.stopProcessing,
    sortOrder: row.sortOrder,
    conditions,
    actions
  }
}

export function listRules(accountId: string): Rule[] {
  const db = getDb()
  const ruleRows = db
    .select()
    .from(rules)
    .where(eq(rules.accountId, accountId))
    .orderBy(asc(rules.sortOrder))
    .all()

  return ruleRows.map((row) => {
    const conditions = db
      .select()
      .from(ruleConditions)
      .where(eq(ruleConditions.ruleId, row.id))
      .all()
      .map((c) => ({
        field: c.field as RuleConditionInput['field'],
        op: c.op as RuleConditionInput['op'],
        value: c.value
      }))
    const actions = db
      .select()
      .from(ruleActions)
      .where(eq(ruleActions.ruleId, row.id))
      .all()
      .map((a) => ({
        action: a.action as RuleActionInput['action'],
        value: a.value ?? undefined
      }))
    return toRule(row, conditions, actions)
  })
}

function insertChildren(ruleId: string, input: RuleInput): void {
  const db = getDb()
  for (const condition of input.conditions) {
    db.insert(ruleConditions)
      .values({
        id: randomUUID(),
        ruleId,
        field: condition.field,
        op: condition.op,
        value: condition.value
      })
      .run()
  }
  for (const action of input.actions) {
    db.insert(ruleActions)
      .values({ id: randomUUID(), ruleId, action: action.action, value: action.value ?? null })
      .run()
  }
}

export function createRule(accountId: string, input: RuleInput): Rule {
  const db = getDb()
  const id = randomUUID()
  db.insert(rules)
    .values({
      id,
      accountId,
      name: input.name,
      isEnabled: input.isEnabled,
      matchAll: input.matchAll,
      stopProcessing: input.stopProcessing,
      sortOrder: 0,
      createdAt: Date.now()
    })
    .run()
  insertChildren(id, input)
  return listRules(accountId).find((r) => r.id === id) as Rule
}

export function updateRule(ruleId: string, input: RuleInput): Rule {
  const db = getDb()
  const existing = db.select().from(rules).where(eq(rules.id, ruleId)).get()
  if (!existing) throw new Error('Rule not found')

  db.update(rules)
    .set({
      name: input.name,
      isEnabled: input.isEnabled,
      matchAll: input.matchAll,
      stopProcessing: input.stopProcessing
    })
    .where(eq(rules.id, ruleId))
    .run()
  db.delete(ruleConditions).where(eq(ruleConditions.ruleId, ruleId)).run()
  db.delete(ruleActions).where(eq(ruleActions.ruleId, ruleId)).run()
  insertChildren(ruleId, input)
  return listRules(existing.accountId).find((r) => r.id === ruleId) as Rule
}

export function deleteRule(ruleId: string): void {
  getDb().delete(rules).where(eq(rules.id, ruleId)).run()
}

function fieldValue(
  row: typeof messages.$inferSelect,
  field: RuleConditionInput['field'],
  bodyText: string | null
): string {
  switch (field) {
    case 'from':
      return `${row.fromName ?? ''} ${row.fromEmail ?? ''}`.toLowerCase()
    case 'to':
      return `${row.toJson ?? ''} ${row.ccJson ?? ''}`.toLowerCase()
    case 'subject':
      return (row.subject ?? '').toLowerCase()
    case 'body':
      return (bodyText ?? '').toLowerCase()
    default:
      return ''
  }
}

function testOp(value: string, op: RuleConditionInput['op'], target: string): boolean {
  const t = target.toLowerCase()
  switch (op) {
    case 'contains':
      return value.includes(t)
    case 'equals':
      return value === t
    case 'startsWith':
      return value.startsWith(t)
    case 'endsWith':
      return value.endsWith(t)
    default:
      return false
  }
}

function ruleMatches(
  row: typeof messages.$inferSelect,
  rule: Rule,
  bodyText: string | null
): boolean {
  if (rule.conditions.length === 0) return false
  const results = rule.conditions.map((condition) => {
    if (condition.field === 'hasAttachment') {
      return (row.hasAttachments ? 'yes' : 'no') === condition.value.toLowerCase()
    }
    return testOp(fieldValue(row, condition.field, bodyText), condition.op, condition.value)
  })
  return rule.matchAll ? results.every(Boolean) : results.some(Boolean)
}

function evaluateRules(
  row: typeof messages.$inferSelect,
  ruleList: Rule[],
  bodyText: string | null
): RuleActionInput[] {
  const out: RuleActionInput[] = []
  for (const rule of ruleList) {
    if (ruleMatches(row, rule, bodyText)) {
      out.push(...rule.actions)
      if (rule.stopProcessing) break
    }
  }
  return out
}

export interface ApplyRulesResult {
  matched: number
  moved: number
  targetFolderIds: string[]
}

/** Evaluate every rule against recently stored messages and apply their actions. */
export async function applyRules(accountId: string): Promise<ApplyRulesResult> {
  const ruleList = listRules(accountId).filter((r) => r.isEnabled)
  const empty: ApplyRulesResult = { matched: 0, moved: 0, targetFolderIds: [] }
  if (ruleList.length === 0) return empty

  const account = getAccountById(accountId)
  const password = account ? getAccountPassword(accountId) : undefined
  if (!account || !password) return empty

  const db = getDb()
  const folderRows = allFoldersSorted(accountId)
  const targetFolderIds = new Set<string>()
  let matched = 0
  let moved = 0

  const client = buildImapClient(account.incoming, password)
  await client.connect()
  try {
    for (const folder of folderRows) {
      const rows = db
        .select()
        .from(messages)
        .where(eq(messages.folderId, folder.id))
        .limit(300)
        .all()
      if (rows.length === 0) continue

      let opened = false
      for (const row of rows) {
        const body = db
          .select()
          .from(messageBodies)
          .where(eq(messageBodies.messageId, row.id))
          .get()
        const actions = evaluateRules(row, ruleList, body?.textPlain ?? null)
        if (actions.length === 0) continue
        matched += 1
        if (!opened) {
          await client.mailboxOpen(folder.remotePath)
          opened = true
        }

        for (const action of actions) {
          if (action.action === 'markRead') {
            await client.messageFlagsAdd(String(row.uid), ['\\Seen'], { uid: true })
            db.update(messages).set({ isRead: true }).where(eq(messages.id, row.id)).run()
          } else if (action.action === 'markFlagged') {
            await client.messageFlagsAdd(String(row.uid), ['\\Flagged'], { uid: true })
            db.update(messages).set({ isFlagged: true }).where(eq(messages.id, row.id)).run()
          } else if (action.action === 'markSpam') {
            db.update(messages)
              .set({ isSpam: true, spamScore: 100, spamReasons: JSON.stringify(['Matched rule']) })
              .where(eq(messages.id, row.id))
              .run()
          } else if (action.action === 'move' && action.value) {
            const target = folderRows.find((f) => f.id === action.value)
            if (target && target.id !== folder.id) {
              await client.messageMove(String(row.uid), target.remotePath, { uid: true })
              db.delete(messages).where(eq(messages.id, row.id)).run()
              removeFromIndex(row.id)
              targetFolderIds.add(target.id)
              moved += 1
              break
            }
          } else if (action.action === 'trash') {
            const trash = folderRows.find((f) => f.specialUse === 'trash')
            if (trash && trash.id !== folder.id) {
              await client.messageMove(String(row.uid), trash.remotePath, { uid: true })
              db.delete(messages).where(eq(messages.id, row.id)).run()
              removeFromIndex(row.id)
              targetFolderIds.add(trash.id)
              moved += 1
              break
            }
          }
        }
      }
      if (opened) await client.mailboxClose().catch(() => undefined)
    }
  } finally {
    await client.logout().catch(() => undefined)
  }

  return { matched, moved, targetFolderIds: [...targetFolderIds] }
}
