const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8')

const ipcDir = path.join(root, 'src/main/ipc')
const mainSrc = fs
  .readdirSync(ipcDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => fs.readFileSync(path.join(ipcDir, f), 'utf8'))
  .join('\n') + fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8')

const ren = new Map() // channel -> Set(method)
const collect = (src, re, map) => {
  let m
  while ((m = re.exec(src)) !== null) {
    const method = m[1]
    const channel = m[2]
    if (!map.has(channel)) map.set(channel, new Set())
    map.get(channel).add(method)
  }
}

const rendererCalls = new Map()
collect(preload, /ipcRenderer\.(invoke|send|on)\(\s*IpcChannels\.([\w.]+)/g, rendererCalls)

const mainCalls = new Map()
collect(mainSrc, /ipcMain\.(handle|handleOnce|on)\(\s*IpcChannels\.([\w.]+)/g, mainCalls)
collect(mainSrc, /ipcMain\.(handle|on)\(\s*['"]([\w:-]+)['"]/g, mainCalls)

const pairOk = { invoke: 'handle', send: 'on' }
const problems = []
const all = new Set([...rendererCalls.keys(), ...mainCalls.keys()])
for (const channel of [...all].sort()) {
  const r = rendererCalls.get(channel)
  const m = mainCalls.get(channel)
  if (!r) {
    problems.push(`MAIN-ONLY (no preload caller): ${channel} -> ${m ? [...m].join(',') : ''}`)
    continue
  }
  if (!m) {
    problems.push(`PRELOAD-ONLY (no main handler): ${channel} -> ${[...r].join(',')}`)
    continue
  }
  for (const method of r) {
    const expected = pairOk[method]
    if (expected && !m.has(expected)) {
      problems.push(`MISMATCH: ${channel} renderer.${method} needs ipcMain.${expected} but main has [${[...m].join(',')}]`)
    }
  }
}

const realProblems = problems.filter((p) => {
  if (p.includes('MISMATCH')) return true
  if (p.startsWith('PRELOAD-ONLY')) return !/-> on$/.test(p) // 'on' listeners are main->renderer events
  return p.startsWith('MAIN-ONLY')
})

console.log('renderer channels:', rendererCalls.size, 'main channels:', mainCalls.size)
console.log('\n=== problems ===')
console.log(problems.length ? problems.join('\n') : '(none)')
if (realProblems.length > 0) {
  console.error(`\n${realProblems.length} wiring problem(s) found`)
  process.exitCode = 1
}
