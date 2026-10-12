import { randomUUID } from 'node:crypto'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { messageBodies, messages, spamSenders, spamTokens } from '../db/schema'

export const AUTO_SPAM_THRESHOLD = 60
export const REVIEW_THRESHOLD = 30

const SPAM_KEYWORDS = [
  'viagra',
  'cialis',
  'lottery',
  'you won',
  'you have won',
  'winner',
  'free money',
  'risk-free',
  'wire transfer',
  'bitcoin',
  'crypto giveaway',
  'act now',
  'limited time',
  'click here to claim',
  'unclaimed',
  'inheritance',
  'pre-approved',
  'make money fast',
  'work from home',
  'urgent business proposal'
]

export interface SpamAssessment {
  score: number
  reasons: string[]
}

function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9@._'-]{3,}/g) ?? []))
}

function senderKind(accountId: string, email: string): 'block' | 'allow' | null {
  if (!email) return null
  const row = getDb()
    .select()
    .from(spamSenders)
    .where(and(eq(spamSenders.accountId, accountId), eq(spamSenders.email, email)))
    .get()
  return (row?.kind as 'block' | 'allow' | undefined) ?? null
}

function isKnownSender(accountId: string, email: string, excludeId: string): boolean {
  if (!email) return false
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(eq(messages.accountId, accountId), eq(messages.fromEmail, email), ne(messages.id, excludeId))
    )
    .get()
  return Number(row?.count ?? 0) > 0
}

function modelProbability(tokens: string[]): { prob: number; trained: boolean } {
  const db = getDb()
  const totals = db
    .select({
      spam: sql<number>`coalesce(sum(spam_count), 0)`,
      ham: sql<number>`coalesce(sum(ham_count), 0)`
    })
    .from(spamTokens)
    .get() ?? { spam: 0, ham: 0 }

  const totalSpam = Number(totals.spam)
  const totalHam = Number(totals.ham)
  if (totalSpam + totalHam < 20) return { prob: 0.5, trained: false }

  let logSum = 0
  for (const token of tokens) {
    const row = db.select().from(spamTokens).where(eq(spamTokens.token, token)).get()
    const pSpam = ((row?.spamCount ?? 0) + 1) / (totalSpam + 2)
    const pHam = ((row?.hamCount ?? 0) + 1) / (totalHam + 2)
    logSum += Math.log(pSpam / pHam)
  }
  const prior = Math.log((totalSpam || 1) / (totalHam || 1))
  const odds = Math.exp(prior + logSum)
  return { prob: odds / (1 + odds), trained: true }
}

export function assessMessage(
  row: typeof messages.$inferSelect,
  bodyText: string | null
): SpamAssessment {
  const reasons: string[] = []
  let score = 0
  const email = (row.fromEmail ?? '').toLowerCase()

  const kind = senderKind(row.accountId, email)
  if (kind === 'allow') return { score: 0, reasons: ['Trusted sender'] }
  if (kind === 'block') {
    score += 80
    reasons.push('Sender is blocked')
  }

  if (email && !isKnownSender(row.accountId, email, row.id)) {
    score += 8
    reasons.push('First-time sender')
  }

  const subject = row.subject ?? ''
  const lower = subject.toLowerCase()
  let keywordHits = 0
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) {
      keywordHits += 1
      reasons.push(`Subject mentions “${keyword}”`)
    }
  }
  if (keywordHits > 0) score += Math.min(36, keywordHits * 12)

  if (subject.length > 8 && subject === subject.toUpperCase() && /[A-Z]/.test(subject)) {
    score += 8
    reasons.push('Subject is all caps')
  }
  if (!row.messageId) {
    score += 5
    reasons.push('Missing Message-ID')
  }

  const tokens = tokenize(`${subject} ${email} ${bodyText ?? ''}`)
  const { prob, trained } = modelProbability(tokens)
  if (trained) {
    if (prob >= 0.9) {
      score += 40
      reasons.push('Matches learned spam patterns')
    } else if (prob >= 0.7) {
      score += 18
      reasons.push('Contains spam-like wording')
    } else if (prob <= 0.1) {
      score -= 10
      reasons.push('Matches your good mail')
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, reasons: reasons.length ? reasons : ['No spam signals found'] }
}

/** Re-score a stored message (from envelope + body if cached) and persist the result. */
export function applyAssessment(messageId: string): number {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return 0
  const body = db
    .select()
    .from(messageBodies)
    .where(eq(messageBodies.messageId, messageId))
    .get()

  const { score, reasons } = assessMessage(row, body?.textPlain ?? null)
  db.update(messages)
    .set({ spamScore: score, spamReasons: JSON.stringify(reasons), isSpam: score >= AUTO_SPAM_THRESHOLD })
    .where(eq(messages.id, messageId))
    .run()
  return score
}

/** Teach the token model from a user's spam / not-spam action. */
export function train(messageId: string, asSpam: boolean): void {
  const db = getDb()
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()
  if (!row) return
  const body = db
    .select()
    .from(messageBodies)
    .where(eq(messageBodies.messageId, messageId))
    .get()
  const tokens = tokenize(`${row.subject ?? ''} ${row.fromEmail ?? ''} ${body?.textPlain ?? ''}`)
  for (const token of tokens) {
    db.insert(spamTokens)
      .values({ token, spamCount: asSpam ? 1 : 0, hamCount: asSpam ? 0 : 1 })
      .onConflictDoUpdate({
        target: spamTokens.token,
        set: asSpam
          ? { spamCount: sql`${spamTokens.spamCount} + 1` }
          : { hamCount: sql`${spamTokens.hamCount} + 1` }
      })
      .run()
  }
}

export function markSpam(messageId: string): void {
  getDb()
    .update(messages)
    .set({ isSpam: true, spamScore: 100, spamReasons: JSON.stringify(['Marked as spam by you']) })
    .where(eq(messages.id, messageId))
    .run()
  train(messageId, true)
}

export function markNotSpam(messageId: string): void {
  getDb()
    .update(messages)
    .set({ isSpam: false, spamScore: 0, spamReasons: JSON.stringify(['Marked as not spam by you']) })
    .where(eq(messages.id, messageId))
    .run()
  train(messageId, false)
}

export function setSenderKind(
  accountId: string,
  email: string,
  kind: 'block' | 'allow' | null
): void {
  const db = getDb()
  const normalized = email.toLowerCase()
  if (!kind) {
    db.delete(spamSenders)
      .where(and(eq(spamSenders.accountId, accountId), eq(spamSenders.email, normalized)))
      .run()
    return
  }
  const existing = db
    .select()
    .from(spamSenders)
    .where(and(eq(spamSenders.accountId, accountId), eq(spamSenders.email, normalized)))
    .get()
  if (existing) {
    db.update(spamSenders).set({ kind }).where(eq(spamSenders.id, existing.id)).run()
  } else {
    db.insert(spamSenders)
      .values({ id: randomUUID(), accountId, email: normalized, kind, createdAt: Date.now() })
      .run()
  }
}

export function listSpam(accountId: string): (typeof messages.$inferSelect)[] {
  return getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isSpam, true)))
    .orderBy(desc(messages.dateUtc))
    .all()
}

export function countSpam(accountId: string): number {
  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(and(eq(messages.accountId, accountId), eq(messages.isSpam, true)))
    .get()
  return Number(row?.count ?? 0)
}
