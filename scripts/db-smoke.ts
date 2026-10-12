import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initDatabase, closeDatabase } from '../src/main/db'
import { getAllSettings, getSetting, setSetting, deleteSetting } from '../src/main/settings'

const dir = mkdtempSync(join(tmpdir(), 'clover-db-'))
console.log('data dir:', dir)

initDatabase(dir)
setSetting('theme.mode', 'dark')
setSetting('theme.accent', 'ocean')
setSetting('nested', { a: 1, b: ['x', 'y'] })
console.log('roundtrip:', JSON.stringify(getSetting('theme.mode')), JSON.stringify(getSetting('nested')))
deleteSetting('nested')
closeDatabase()

initDatabase(dir)
console.log('persisted after reopen:', JSON.stringify(getSetting('theme.mode')))
console.log('all settings:', JSON.stringify(getAllSettings()))
closeDatabase()

console.log('DB_SMOKE_OK')
