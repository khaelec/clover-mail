const path = require('node:path')
const { app, BrowserWindow } = require('electron')

// Boot the real built main process: registers all IPC handlers and creates the window.
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

const errors = []

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 60 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('MAIL_INTEGRATION NO_WINDOW')
    app.exit(1)
    return
  }

  win.webContents.on('console-message', (...args) => {
    const level = typeof args[1] === 'object' ? args[1].level : args[1]
    const message = typeof args[1] === 'object' ? args[1].message : args[2]
    if (level === 'error' || level === 3) errors.push('console: ' + message)
  })

  await new Promise((r) => setTimeout(r, 1200))

  try {
    const result = await win.webContents.executeJavaScript(`(async () => {
      const api = window.clover.mail
      const before = await api.listAccounts()
      const created = await api.createAccount({
        email: 'test@clover.local',
        displayName: 'Test Account',
        password: 'secret',
        incoming: { host: 'imap.example.com', port: 993, security: 'ssl', username: 'test@clover.local' },
        outgoing: { host: 'smtp.example.com', port: 465, security: 'ssl', username: 'test@clover.local' }
      })
      const accts = await api.listAccounts()
      const folders = await api.listFolders(created.id)
      const search = await api.search('nonexistent-term-xyz')
      const junk = await api.listJunk(created.id)
      const spam = await api.spamCount(created.id)
      const rule = await api.createRule(created.id, {
        name: 'Test rule',
        isEnabled: true,
        matchAll: true,
        stopProcessing: false,
        conditions: [{ field: 'subject', op: 'contains', value: 'x' }],
        actions: [{ action: 'markRead' }]
      })
      const rules = await api.listRules(created.id)
      await api.deleteRule(rule.id)

      let appCreated = null
      try {
        appCreated = await window.clover.apps.create({ url: 'https://example.com' })
      } catch (e) {
        appCreated = null
      }
      const appsAfter = await window.clover.apps.list()
      if (appCreated) await window.clover.apps.remove(appCreated.id)
      const appsFinal = await window.clover.apps.list()

      const calList = await window.clover.calendar.listCalendars()
      const now = Date.now()
      const ev = await window.clover.calendar.createEvent({
        calendarId: calList[0].id,
        summary: 'Integration test',
        startUtc: now,
        endUtc: now + 3600000
      })
      const occ = await window.clover.calendar.listOccurrences(now - 86400000, now + 86400000)
      await window.clover.calendar.deleteEvent(ev.id)

      await api.deleteAccount(created.id)
      for (const stale of await api.listAccounts()) await api.deleteAccount(stale.id)
      const after = await api.listAccounts()
      return JSON.stringify({
        before: before.length,
        created: created.email,
        hasColor: !!created.color,
        incomingHost: created.incoming.host,
        accountsAfterCreate: accts.length,
        folders: folders.length,
        searchHits: search.length,
        junk: junk.length,
        spamCount: spam,
        rulesCreated: rules.length,
        ruleConditions: rules[0] ? rules[0].conditions.length : 0,
        appCreated: appCreated ? appCreated.name : null,
        appsAfterCreate: appsAfter.length,
        appsFinal: appsFinal.length,
        calendars: calList.length,
        calendarOccurrences: occ.length,
        accountsAfterDelete: after.length
      })
    })()`)
    console.log('MAIL_INTEGRATION ' + result)
  } catch (error) {
    console.log('MAIL_INTEGRATION_FAIL ' + error.message)
  }

  console.log('ERRORS ' + JSON.stringify(errors))
  app.exit(errors.length ? 1 : 0)
})
