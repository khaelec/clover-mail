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
      await api.deleteAccount(created.id)
      const after = await api.listAccounts()
      return JSON.stringify({
        before: before.length,
        created: created.email,
        hasColor: !!created.color,
        incomingHost: created.incoming.host,
        accountsAfterCreate: accts.length,
        folders: folders.length,
        searchHits: search.length,
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
