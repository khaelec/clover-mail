/* eslint-disable @typescript-eslint/no-require-imports */
// Clover Mail — Phase 0 spike diagnostics (throwaway).
// Runs inside nodejs-mobile. Receives a 'run' event with the test account and
// replies with a 'result' report. Never echoes the address or password back.
const { app, channel } = require('bridge')
const fs = require('node:fs')
const path = require('node:path')

const CORE_MODULES = ['crypto', 'fs', 'path', 'net', 'tls', 'os', 'http', 'https', 'zlib', 'stream', 'dns', 'url', 'events']

function coreModules() {
  const out = {}
  for (const m of CORE_MODULES) {
    try {
      require(`node:${m}`)
      out[m] = true
    } catch {
      out[m] = false
    }
  }
  return out
}

function timed(fn) {
  const t = Date.now()
  const value = fn()
  return { ms: Date.now() - t, value }
}

// 1. node:sqlite (Node 22+; expected absent on nodejs-mobile's Node 18).
function testNodeSqlite() {
  try {
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE VIRTUAL TABLE t USING fts5(body)')
    db.exec("INSERT INTO t(body) VALUES ('hi')")
    const row = db.prepare("SELECT COUNT(*) AS c FROM t WHERE t MATCH 'hi'").get()
    db.close()
    return { available: true, fts5: Number(row.c) === 1 }
  } catch (e) {
    return { available: false, error: String(e && e.message ? e.message : e) }
  }
}

// 2. better-sqlite3 (native addon — needs Android prebuilds, which it doesn't ship).
function testBetterSqlite() {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.exec('CREATE VIRTUAL TABLE t USING fts5(body)')
    db.prepare('INSERT INTO t(body) VALUES (?)').run('hi')
    const row = db.prepare("SELECT COUNT(*) AS c FROM t WHERE t MATCH 'hi'").get()
    db.close()
    return { loaded: true, fts5: Number(row.c) === 1 }
  } catch (e) {
    return { loaded: false, error: String(e && e.message ? e.message : e) }
  }
}

// 3. node-sqlite3-wasm (WASM, synchronous, file-backed).
function testWasmSqlite() {
  try {
    const { Database } = require('node-sqlite3-wasm')
    const file = path.join(app.datadir(), 'spike.db')
    const db = new Database(file)
    // Fresh table every run so the match count is unambiguous.
    db.exec('DROP TABLE IF EXISTS t')
    db.exec('CREATE VIRTUAL TABLE t USING fts5(body)')
    const insert = db.prepare('INSERT INTO t(body) VALUES (?)')
    const ins = timed(() => {
      db.exec('BEGIN')
      for (let i = 0; i < 1000; i++) insert.run([`message number ${i}`])
      db.exec('COMMIT')
    })
    const search = timed(() => db.all("SELECT rowid FROM t WHERE t MATCH 'number AND 500'"))
    const count = timed(() => db.get('SELECT COUNT(*) AS n FROM t').n)
    const sqliteVersion = db.get('SELECT sqlite_version() AS v').v
    db.close()
    return {
      loaded: true,
      fts5Matches: search.value.length,
      rows: count.value,
      insert1000Ms: ins.ms,
      searchMs: search.ms,
      dbBytes: fs.statSync(file).size,
      sqlite: sqliteVersion
    }
  } catch (e) {
    return { loaded: false, error: String(e && e.message ? e.message : e) }
  }
}

// 4. IMAP: login, list folders, fetch 50 envelopes, IDLE for ~3 s.
async function testImap(cfg) {
  const out = {}
  try {
    const { ImapFlow } = require('imapflow')
    const client = new ImapFlow({
      host: cfg.host,
      port: Number(cfg.port) || 993,
      secure: true,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false
    })
    const t0 = Date.now()
    await client.connect()
    out.connectMs = Date.now() - t0
    out.connected = true

    const folders = await client.list()
    out.folderCount = folders.length

    const lock = await client.getMailboxLock('INBOX')
    try {
      out.inboxExists = client.mailbox.exists
      let count = 0
      const tf = Date.now()
      for await (const msg of client.fetch('1:*', { envelope: true }, { uid: false })) {
        count += 1
        if (count >= 50) break
      }
      out.fetch50Ms = Date.now() - tf
      out.fetched = count
    } finally {
      lock.release()
    }

    // IDLE: hold it for ~3 s; if nothing throws, IDLE works.
    const tIdle = Date.now()
    const idleLock = await client.getMailboxLock('INBOX')
    try {
      const idle = client.idle()
      out.idle = await Promise.race([
        idle.then(() => 'ended'),
        new Promise((resolve) => setTimeout(() => resolve('held'), 3000))
      ])
      out.idleMs = Date.now() - tIdle
    } finally {
      idleLock.release()
    }

    try {
      await client.logout()
    } catch {
      // ignore
    }
  } catch (e) {
    out.error = String(e && e.message ? e.message : e)
    const detail = {}
    if (e) {
      if (e.code) detail.code = e.code
      if (e.responseText) detail.responseText = String(e.responseText)
      if (e.serverResponseCode) detail.serverResponseCode = String(e.serverResponseCode)
      if (e.authenticationFailed !== undefined) detail.authenticationFailed = e.authenticationFailed
      if (e.response) detail.response = String(e.response)
    }
    if (Object.keys(detail).length > 0) out.detail = detail
  }
  return out
}

// 5. SMTP: verify, and optionally send one message.
async function testSmtp(cfg) {
  try {
    const nodemailer = require('nodemailer')
    const transport = nodemailer.createTransport({
      host: cfg.smtpHost || cfg.host,
      port: Number(cfg.smtpPort) || 465,
      secure: true,
      auth: { user: cfg.user, pass: cfg.pass }
    })
    await transport.verify()
    if (!cfg.send) return { verified: true, sent: false }
    const t0 = Date.now()
    await transport.sendMail({
      from: cfg.user,
      to: cfg.to || cfg.user,
      subject: 'Clover Mail Phase 0 spike',
      text: 'Sent from the Clover Mail Phase 0 spike diagnostics.'
    })
    return { verified: true, sent: true, sendMs: Date.now() - t0 }
  } catch (e) {
    return { verified: false, error: String(e && e.message ? e.message : e) }
  }
}

channel.on('run', async (cfg) => {
  const report = {
    build: 'phase0-imap-detail',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    modules: coreModules(),
    sqlite: {},
    imap: {},
    smtp: {}
  }
  report.sqlite.node = testNodeSqlite()
  report.sqlite.better = testBetterSqlite()
  report.sqlite.wasm = testWasmSqlite()

  if (cfg && cfg.host && cfg.user && cfg.pass) {
    report.imap = await testImap(cfg)
    report.smtp = await testSmtp(cfg)
  } else {
    report.imap = { skipped: 'enter an account on the form to test IMAP/SMTP' }
    report.smtp = { skipped: 'enter an account on the form to test IMAP/SMTP' }
  }

  report.memoryMB = Math.round(process.memoryUsage().rss / 1048576)
  channel.post('result', report)
})

channel.post('booted', process.version)
