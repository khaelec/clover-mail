import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { accounts, incomingSettings, outgoingSettings } from '../db/schema'
import { deleteSecret, getSecret, setSecret } from '../settings/secrets'
import type { AccountInput, AccountSummary, CreateAccountInput, EndpointInput } from '@shared/mail'

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b']

function makeSummary(
  account: typeof accounts.$inferSelect,
  incoming: typeof incomingSettings.$inferSelect,
  outgoing: typeof outgoingSettings.$inferSelect
): AccountSummary {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    color: account.color,
    isEnabled: account.isEnabled,
    incoming: {
      host: incoming.host,
      port: incoming.port,
      security: incoming.security as EndpointInput['security'],
      username: incoming.username
    },
    outgoing: {
      host: outgoing.host,
      port: outgoing.port,
      security: outgoing.security as EndpointInput['security'],
      username: outgoing.username
    }
  }
}

function settingsFor(accountId: string) {
  const incoming = getDb()
    .select()
    .from(incomingSettings)
    .where(eq(incomingSettings.accountId, accountId))
    .get()
  const outgoing = getDb()
    .select()
    .from(outgoingSettings)
    .where(eq(outgoingSettings.accountId, accountId))
    .get()
  return { incoming, outgoing }
}

export function secretRefFor(accountId: string): string {
  return `account:${accountId}:password`
}

export function listAccounts(): AccountSummary[] {
  const rows = getDb().select().from(accounts).orderBy(asc(accounts.createdAt)).all()
  const out: AccountSummary[] = []
  for (const row of rows) {
    const { incoming, outgoing } = settingsFor(row.id)
    if (incoming && outgoing) out.push(makeSummary(row, incoming, outgoing))
  }
  return out
}

export function getAccountById(id: string): AccountSummary | null {
  const row = getDb().select().from(accounts).where(eq(accounts.id, id)).get()
  if (!row) return null
  const { incoming, outgoing } = settingsFor(id)
  if (!incoming || !outgoing) return null
  return makeSummary(row, incoming, outgoing)
}

export function getAccountPassword(id: string): string | undefined {
  return getSecret(secretRefFor(id))
}

export function createAccount(input: CreateAccountInput): AccountSummary {
  const id = randomUUID()
  const ref = secretRefFor(id)
  const now = Date.now()

  getDb()
    .insert(accounts)
    .values({
      id,
      email: input.email,
      displayName: input.displayName ?? input.email,
      color: COLORS[listAccounts().length % COLORS.length],
      isEnabled: true,
      createdAt: now
    })
    .run()

  getDb()
    .insert(incomingSettings)
    .values({
      id: randomUUID(),
      accountId: id,
      protocol: 'imap',
      host: input.incoming.host,
      port: input.incoming.port,
      security: input.incoming.security,
      username: input.incoming.username,
      secretRef: ref
    })
    .run()

  getDb()
    .insert(outgoingSettings)
    .values({
      id: randomUUID(),
      accountId: id,
      host: input.outgoing.host,
      port: input.outgoing.port,
      security: input.outgoing.security,
      username: input.outgoing.username,
      secretRef: ref
    })
    .run()

  setSecret(ref, input.password)

  return getAccountById(id) as AccountSummary
}

export function updateAccount(id: string, input: AccountInput): AccountSummary {
  getDb()
    .update(accounts)
    .set({ email: input.email, displayName: input.displayName ?? input.email })
    .where(eq(accounts.id, id))
    .run()

  getDb()
    .update(incomingSettings)
    .set({
      host: input.incoming.host,
      port: input.incoming.port,
      security: input.incoming.security,
      username: input.incoming.username
    })
    .where(eq(incomingSettings.accountId, id))
    .run()

  getDb()
    .update(outgoingSettings)
    .set({
      host: input.outgoing.host,
      port: input.outgoing.port,
      security: input.outgoing.security,
      username: input.outgoing.username
    })
    .where(eq(outgoingSettings.accountId, id))
    .run()

  return getAccountById(id) as AccountSummary
}

export function setAccountPassword(id: string, password: string): void {
  setSecret(secretRefFor(id), password)
}

export function deleteAccount(id: string): void {
  deleteSecret(secretRefFor(id))
  getDb().delete(accounts).where(eq(accounts.id, id)).run()
}
