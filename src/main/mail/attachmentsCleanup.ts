import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { getDb } from '@core/db'
import { attachments } from '@core/db/schema'
import { logLine } from '../log'

// How long orphaned files stay recoverable in the quarantine folder.
const QUARANTINE_TTL_MS = 30 * 24 * 60 * 60 * 1000

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

export interface CleanupResult {
  scanned: number
  quarantined: number
  purged: number
  skipped: boolean
}

/**
 * Move attachment files under `<userData>/attachments` that no database row
 * references into `<userData>/attachments-orphaned` (never delete them outright —
 * for POP3/local/imported mail they are the only copy), then delete quarantined
 * files older than 30 days.
 *
 * Safety:
 * - Only ever touches those two folders under user data (AGENTS rule 1); each
 *   file is resolved and confirmed to be inside the folder before it's moved.
 * - Mass-deletion guard: if more than ~half the files (and more than 20) look
 *   orphaned, or the attachments table is empty while files exist (a sign of a
 *   damaged/restored database), nothing is moved and a warning is logged.
 * - Set CLOVER_ATTACH_CLEAN_DRYRUN=1 to log without moving or deleting anything.
 */
export function cleanOrphanAttachments(userDataDir: string): CleanupResult {
  const root = join(userDataDir, 'attachments')
  const quarantine = join(userDataDir, 'attachments-orphaned')
  const rootNorm = norm(root)
  const quarantineNorm = norm(quarantine)
  const db = getDb()
  const dryRun = isDryRun()

  const referenced = new Set<string>()
  for (const row of db.select({ path: attachments.contentPath }).from(attachments).all()) {
    if (row.path) referenced.add(norm(join(root, row.path)))
  }

  // Purge quarantine entries past their retention window (scoped to that folder).
  let purged = 0
  for (const file of listFiles(quarantine)) {
    if (!insideDir(norm(file), quarantineNorm)) continue
    let mtime = 0
    try {
      mtime = statSync(file).mtimeMs
    } catch {
      continue
    }
    if (Date.now() - mtime <= QUARANTINE_TTL_MS) continue
    if (dryRun) {
      logLine('attachments', `dry run: would purge ${relative(quarantine, file)}`)
      continue
    }
    try {
      rmSync(file)
      purged += 1
    } catch {
      // locked or already gone
    }
  }

  const files = listFiles(root)
  const orphans = files.filter((file) => {
    const fileNorm = norm(file)
    return insideDir(fileNorm, rootNorm) && !referenced.has(fileNorm)
  })

  if (orphans.length > 0) {
    // Mass-deletion guard: a broken/empty database must not sweep the folder.
    const dbLooksEmpty = referenced.size === 0 && files.length > 0
    const massDeletion = orphans.length > 20 && orphans.length > files.length / 2
    if (dbLooksEmpty || massDeletion) {
      logLine(
        'attachments',
        `cleanup skipped: ${orphans.length}/${files.length} files look orphaned` +
          (dbLooksEmpty ? ' and the attachments table is empty' : '') +
          ' — leaving everything in place'
      )
      return { scanned: files.length, quarantined: 0, purged, skipped: true }
    }

    let quarantined = 0
    for (const file of orphans) {
      const rel = relative(root, file)
      if (dryRun) {
        logLine('attachments', `dry run: would quarantine ${rel}`)
        continue
      }
      try {
        const dest = join(quarantine, rel)
        mkdirSync(dirname(dest), { recursive: true })
        renameSync(file, dest)
        quarantined += 1
        logLine('attachments', `quarantined ${rel}`)
      } catch {
        // file locked or already gone
      }
    }
    logLine(
      'attachments',
      `cleanup: scanned ${files.length}, quarantined ${quarantined}, purged ${purged}${dryRun ? ' (dry run)' : ''}`
    )
    return { scanned: files.length, quarantined, purged, skipped: false }
  }

  logLine('attachments', `cleanup: scanned ${files.length}, quarantined 0, purged ${purged}`)
  return { scanned: files.length, quarantined: 0, purged, skipped: false }
}
