import { Nodejs } from '@capawesome/capacitor-nodejs'

const t0 = performance.now()
const $ = (id) => document.getElementById(id)
let nodeReadyMs = null
let ready = false

function setStatus(text) {
  $('status').textContent = text
}

function log(line) {
  const el = $('log')
  el.textContent = `${el.textContent}${line}\n`
}

Nodejs.addListener('ready', () => {
  ready = true
  nodeReadyMs = Math.round(performance.now() - t0)
  setStatus(`Node runtime ready (${nodeReadyMs} ms)`)
  $('run').disabled = false
})

Nodejs.addListener('message', (event) => {
  if (event.eventName === 'result') {
    const elapsed = Math.round(performance.now() - t0)
    const device = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGB: navigator.deviceMemory ?? null
    }
    const payload = { uiBuild: 'phase0-imap-detail', uiToReportMs: elapsed, nodeReadyMs, device, ...event.args[0] }
    $('report').value = JSON.stringify(payload, null, 2)
    setStatus('Done — copy the report.')
  } else if (event.eventName === 'booted') {
    log(`Node booted: ${event.args[0]}`)
  }
})

$('run').addEventListener('click', async () => {
  if (!ready) return
  const cfg = {
    host: $('host').value.trim(),
    port: Number($('port').value) || 993,
    smtpHost: $('smtpHost').value.trim(),
    smtpPort: Number($('smtpPort').value) || 465,
    user: $('user').value.trim(),
    pass: $('pass').value,
    send: $('send').checked,
    to: $('user').value.trim()
  }
  setStatus('Running diagnostics…')
  $('run').disabled = true
  try {
    await Nodejs.send({ eventName: 'run', args: [cfg] })
  } catch (err) {
    setStatus(`Send failed: ${err.message}`)
    $('run').disabled = false
  }
})

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('report').value)
    setStatus('Copied to clipboard.')
  } catch {
    $('report').select()
    setStatus('Select the report and copy manually.')
  }
})

async function init() {
  try {
    const { ready: isReady } = await Nodejs.isReady()
    if (isReady) {
      ready = true
      nodeReadyMs = Math.round(performance.now() - t0)
      setStatus(`Node runtime ready (${nodeReadyMs} ms)`)
      $('run').disabled = false
    } else {
      setStatus('Waiting for the Node runtime…')
    }
  } catch (err) {
    setStatus(`Plugin error: ${err.message}`)
  }
}

void init()
