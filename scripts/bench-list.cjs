// Measure MailView re-render behaviour on a seeded scratch profile.
//
//   npm run bench:build                  # compile with CLOVER_BENCH=1
//   npm run bench:seed  -- --user-data-dir=C:\path\to\scratch
//   npm run bench:list  -- --user-data-dir=C:\path\to\scratch
//
// Refuses to run against the real Clover Mail profile (see bench-guard.cjs).
const path = require('node:path')
const { app, BrowserWindow } = require('electron')
const { resolveScratchDir } = require('./bench-guard.cjs')

const scratch = resolveScratchDir(app)
app.setPath('userData', scratch)
require(path.join(__dirname, '..', 'out', 'main', 'index.js'))

async function waitFor(win, expr, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await win.webContents.executeJavaScript(expr)
    if (value) return value
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('timeout waiting for ' + label)
}

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 120 && !win; i += 1) {
    win = BrowserWindow.getAllWindows()[0] ?? null
    if (!win) await new Promise((r) => setTimeout(r, 100))
  }
  if (!win) {
    console.log('BENCH_RESULT NO_WINDOW')
    app.exit(1)
    return
  }

  try {
    await waitFor(win, 'typeof window.__mailStore === "function"', 20000, 'store')
    await waitFor(
      win,
      '(() => { const s = window.__mailStore.getState(); return s.threads.length + s.messages.length > 0 })()',
      30000,
      'list data'
    )

    const raw = await win.webContents.executeJavaScript(`(async () => {
      const store = window.__mailStore
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
      const reset = () => { window.__bench = {}; window.__benchProfiler = [] }
      const read = () => ({
        threadRow: window.__bench.threadRow || 0,
        messageRow: window.__bench.messageRow || 0,
        rows: (window.__bench.threadRow || 0) + (window.__bench.messageRow || 0),
        commits: (window.__benchProfiler || []).length
      })
      const out = {}
      let t0 = 0
      const st0 = store.getState()
      out.baselineRows = st0.threads.length || st0.messages.length
      const folderId = st0.activeFolderId

      // A) Reload with no changes (what a no-op sync:done does)
      reset(); t0 = performance.now()
      await store.getState().selectFolder(folderId); await raf(); await raf()
      out.reloadNoChange = { ...read(), ms: Math.round(performance.now() - t0) }

      // B) 30 sync status updates
      reset(); t0 = performance.now()
      for (let i = 0; i < 30; i += 1) {
        store.setState({ syncing: true, status: 'Scanning folder ' + i + '…' })
        await raf()
      }
      store.setState({ syncing: false, status: null }); await raf()
      out.statusChurn30 = { ...read(), ms: Math.round(performance.now() - t0) }

      // C) A single status update
      reset(); store.setState({ status: 'Scanning one…' }); await raf()
      out.singleStatus = read()

      // D) Select a different message
      const ids = store.getState().threads
        .map((t) => t.messages[t.messages.length - 1]?.id)
        .filter(Boolean)
      reset(); if (ids[1]) { await store.getState().selectMessage(ids[1]); await raf() }
      out.selectOne = read()
      reset(); if (ids[2]) { await store.getState().selectMessage(ids[2]); await raf() }
      out.selectTwo = read()

      // E) One changed message, then reload (what sync:done with 1 new mail does)
      reset(); t0 = performance.now()
      try {
        if (ids[5]) await window.clover.mail.setFlags(ids[5], { seen: true })
        await store.getState().selectFolder(folderId); await raf(); await raf()
      } catch (e) { out.oneChangeError = String(e) }
      out.oneChange = { ...read(), ms: Math.round(performance.now() - t0) }

      // F) A real folder switch: go to an empty folder, then back to the full one.
      // The rows are all new on the way back, so one full pass is expected.
      await store.getState().selectFolder('important'); await raf(); await raf()
      reset(); t0 = performance.now()
      await store.getState().selectFolder(folderId); await raf(); await raf()
      out.folderSwitch = {
        targetRows: store.getState().threads.length,
        ...read(),
        ms: Math.round(performance.now() - t0)
      }

      // G) Scrolling (no state change)
      reset()
      const el = document.querySelector('section > div.overflow-y-auto')
      out.scrollerFound = !!el
      if (el && window.PerformanceObserver) {
        try {
          let longTasks = 0
          const po = new PerformanceObserver((l) => { longTasks += l.getEntries().length })
          po.observe({ entryTypes: ['longtask'] })
          const steps = 40
          const step = Math.max(1, Math.floor((el.scrollHeight - el.clientHeight) / steps))
          t0 = performance.now()
          for (let i = 0; i < steps; i += 1) { el.scrollTop = i * step; await raf() }
          po.disconnect()
          out.scroll = { ms: Math.round(performance.now() - t0), longTasks, ...read() }
        } catch (e) { out.scroll = { error: String(e) } }
      }

      return JSON.stringify(out)
    })()`)

    const r = JSON.parse(raw)
    console.log('BENCH_RESULT\n' + JSON.stringify(r, null, 2))

    const checks = [
      ['1 status update renders 0 rows', r.singleStatus.rows, 0],
      ['30 status updates render 0 rows', r.statusChurn30.rows, 0],
      ['selecting a message renders <=2 rows', Math.max(r.selectOne.rows, r.selectTwo.rows), 2],
      ['no-change reload renders 0 rows', r.reloadNoChange.rows, 0],
      ['1 changed message renders <=3 rows', r.oneChange.rows, 3]
    ]
    let pass = true
    for (const [label, actual, target] of checks) {
      const ok = actual <= target
      if (!ok) pass = false
      console.log((ok ? 'PASS ' : 'FAIL ') + label + ' (got ' + actual + ', target <= ' + target + ')')
    }
    const fs_ = r.folderSwitch
    const switchOk = fs_.rows <= Math.max(1, fs_.targetRows) * 2
    if (!switchOk) pass = false
    console.log(
      (switchOk ? 'PASS ' : 'FAIL ') +
        'folder switch renders one pass (got ' + fs_.rows + ' for ' + fs_.targetRows + ' rows)'
    )
    console.log('BENCH_VERDICT ' + (pass ? 'PASS' : 'FAIL'))
  } catch (error) {
    console.log('BENCH_FAIL ' + error.message)
  }
  app.exit(0)
})
