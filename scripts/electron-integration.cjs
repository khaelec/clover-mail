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

      await window.clover.ai.setSettings({ provider: 'ollama', ollamaModel: 'test-model' })
      const aiAfter = await window.clover.ai.getSettings()
      const aiStat = await window.clover.ai.status()
      const mcpSettings = await window.clover.ai.getMcpSettings()
      const mcpStart = await window.clover.ai.mcpStart()

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
        aiProvider: aiAfter.provider,
        aiModel: aiAfter.ollamaModel,
        aiClaudeConfigured: aiStat.claudeConfigured,
        mcpEnabledDefault: mcpSettings.enabled,
        mcpStarted: mcpStart.running,
        mcpPort: mcpStart.port,
        accountsAfterDelete: after.length
      })
    })()`)
    console.log('MAIL_INTEGRATION ' + result)
  } catch (error) {
    console.log('MAIL_INTEGRATION_FAIL ' + error.message)
  }

  try {
    const initRes = await fetch('http://127.0.0.1:8765/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'clover-test', version: '0.1.0' }
        }
      })
    })
    const sessionId = initRes.headers.get('mcp-session-id')
    await initRes.text()
    const listRes = await fetch('http://127.0.0.1:8765/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {})
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    })
    const listText = await listRes.text()
    console.log(
      'MCP_HTTP ' +
        JSON.stringify({
          initStatus: initRes.status,
          hasSession: Boolean(sessionId),
          toolsListed: listText.includes('search_messages') && listText.includes('read_message')
        })
    )
  } catch (error) {
    console.log('MCP_HTTP_FAIL ' + error.message)
  }

  try {
    await win.webContents.executeJavaScript('window.clover.ai.mcpStop()')
  } catch {
    // ignore
  }

  console.log('ERRORS ' + JSON.stringify(errors))
  app.exit(errors.length ? 1 : 0)
})
