import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDatabase, getDb, initDatabase } from '../src/core/db'
import { accounts } from '../src/core/db/schema'
import { createRule, deleteRule, listRules, updateRule } from '../src/main/mail/rules'

const dir = mkdtempSync(join(tmpdir(), 'clover-rules-'))
initDatabase(dir)
getDb()
  .insert(accounts)
  .values({
    id: 'acc1',
    email: 'me@test.local',
    displayName: 'Me',
    color: '#000',
    isEnabled: true,
    createdAt: Date.now()
  })
  .run()

const created = createRule('acc1', {
  name: 'Invoices to Finance',
  isEnabled: true,
  matchAll: true,
  stopProcessing: false,
  conditions: [{ field: 'subject', op: 'contains', value: 'invoice' }],
  actions: [{ action: 'move', value: 'finance-folder' }]
})

let rules = listRules('acc1')
const afterCreate = { count: rules.length, name: rules[0]?.name, conditions: rules[0]?.conditions.length, actions: rules[0]?.actions.length }

updateRule(created.id, {
  name: 'Invoices to Finance (v2)',
  isEnabled: false,
  matchAll: false,
  stopProcessing: true,
  conditions: [
    { field: 'subject', op: 'contains', value: 'invoice' },
    { field: 'from', op: 'endsWith', value: '@vendor.com' }
  ],
  actions: [
    { action: 'markRead' },
    { action: 'move', value: 'finance-folder' }
  ]
})
rules = listRules('acc1')
const afterUpdate = { name: rules[0]?.name, matchAll: rules[0]?.matchAll, enabled: rules[0]?.isEnabled, conditions: rules[0]?.conditions.length, actions: rules[0]?.actions.length }

deleteRule(created.id)
const afterDelete = listRules('acc1').length

console.log(JSON.stringify({ afterCreate, afterUpdate, afterDelete }))
closeDatabase()

const ok =
  afterCreate.count === 1 &&
  afterCreate.conditions === 1 &&
  afterCreate.actions === 1 &&
  afterUpdate.name === 'Invoices to Finance (v2)' &&
  afterUpdate.matchAll === false &&
  afterUpdate.conditions === 2 &&
  afterUpdate.actions === 2 &&
  afterDelete === 0
console.log(ok ? 'RULES_SMOKE_OK' : 'RULES_SMOKE_FAIL')
process.exit(ok ? 0 : 1)
