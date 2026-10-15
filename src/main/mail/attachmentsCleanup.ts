import { readdirSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { getDb } from '../db'
import { attachments } from '../db/schema'
import { logLine } from '../log'

function isDryRun(): boolean {
  return process.env.CLOVER_ATTACH_CLEAN_DRYRUN === '1'
}

function norm(path: string): string {
  const resolved = resolve(path)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function insideDir(child: string, parent: string): boolean {
  if (child === parent) return true
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else if (entry.isFile()) out.push(full)
  }
  return out
}

/**
 * Delete attachment files under `<userData>/attachments` that no database row
 * references (e.g. left behind when a message was deleted or moved). Scoped to
 * that folder only (AGENTS rule 1): a file is removed only when it resolves
 * inside the folder and isn't a known contentPath. Set
 * CLOVER_ATTACH_CLEAN_DRYRUN=1 to log without deleting.
 */
export function cleanOrphanAttachments(userDataDir: string): { scanned: number; removed: number } {
  const root = join(userDataDir, 'attachments')
  const rootNorm = norm(root)
  const db = getDb()

  const referenced = new Set<string>()
  for (const row of db.select({ path: attachments.contentPath }).from(attachments).all()) {
    if (row.path) referenced.add(norm(join(root, row.path)))
  }

  const dryRun = isDryRun()
  let scanned = 0
  let removed = 0
  for (const file of listFiles(root)) {
    scanned += 1
    const fileNorm = norm(file)
    if (!insideDir(fileNorm, rootNorm)) continue
    if (referenced.has(fileNorm)) continue
    if (dryRun) {
      logLine('attachments', `dry run: would remove ${relative(root, file)}`)
      continue
    }
    try {
      rmSync(file)
      removed += 1
      logLine('attachments', `removed ${relative(root, file)}`)
    } catch {
      // file locked or already gone
    }
  }

  logLine(
    'attachments',
    `cleanup: scanned ${scanned}, removed ${removed}${dryRun ? ' (dry run)' : ''}`
  )
  return { scanned, removed }
}
