#!/usr/bin/env node
/*
 * Generates THIRD-PARTY-NOTICES.txt from the installed production dependencies.
 * Run with: npm run licenses
 */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const output = path.join(root, 'THIRD-PARTY-NOTICES.txt')

const LICENSE_FILES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'COPYING',
  'COPYING.md',
  'LICENSE-MIT',
  'license'
]

function spdxOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ')
  }
  return 'UNKNOWN'
}

function readLicenseText(dir) {
  for (const name of LICENSE_FILES) {
    const file = path.join(dir, name)
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fs.readFileSync(file, 'utf8').trim()
    }
  }
  return null
}

let listed
try {
  listed = execSync('npm ls --omit=dev --all --parseable', {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  })
} catch (error) {
  // npm exits non-zero for extraneous/invalid trees but still prints the list.
  listed = error.stdout ? String(error.stdout) : ''
}

const dirs = listed.split(/\r?\n/).filter(Boolean)
const packages = new Map()

for (const dir of dirs) {
  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) continue
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (pkg.name === 'clover-mail') continue
    const license = spdxOf(pkg)
    const key = `${pkg.name}@${pkg.version}`
    if (packages.has(key)) continue
    packages.set(key, { name: pkg.name, version: pkg.version, license, text: readLicenseText(dir) })
  } catch {
    // ignore malformed
  }
}

const sorted = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))
const lines = []
lines.push('THIRD-PARTY NOTICES')
lines.push('===================')
lines.push('')
lines.push('Clover Mail is distributed with the third-party software listed below.')
lines.push('Each component is provided under the license shown. Full license text is')
lines.push('reproduced where the package ships one; otherwise the SPDX identifier applies.')
lines.push('')
lines.push(`Generated for ${sorted.length} packages.`)
lines.push('')

for (const pkg of sorted) {
  lines.push('-'.repeat(78))
  lines.push(`${pkg.name}@${pkg.version}`)
  lines.push(`License: ${pkg.license}`)
  if (pkg.text) {
    lines.push('')
    lines.push(pkg.text.length > 20000 ? `${pkg.text.slice(0, 20000)}\n[…truncated]` : pkg.text)
  }
  lines.push('')
}

lines.push('-'.repeat(78))
lines.push('Electron is distributed under the MIT license and bundles Chromium (BSD-3-Clause')
lines.push('and others) and Node.js (MIT). The bundled FFmpeg is the license-free build.')
lines.push('See https://github.com/electron/electron for details.')

fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8')
console.log(`Wrote ${path.relative(root, output)} (${sorted.length} packages)`)
