import { app, dialog, type BrowserWindow, type SaveDialogOptions, type OpenDialogOptions } from 'electron'
import AdmZip from 'adm-zip'
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { closeDatabase, getRawDb } from '@main/db'

export interface BackupResult {
  saved?: boolean
  restored?: boolean
  relaunching?: boolean
  path?: string
  bytes?: number
  error?: string
}

function userData(): string {
  return app.getPath('userData')
}

export async function exportBackup(
  window: BrowserWindow | null,
  includeAttachments: boolean
): Promise<BackupResult> {
  const stamp = new Date().toISOString().slice(0, 10)
  const options: SaveDialogOptions = {
    title: 'Export Clover Mail backup',
    defaultPath: `clover-mail-backup-${stamp}.zip`,
    filters: [{ name: 'Clover Mail backup', extensions: ['zip'] }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { saved: false }

  const dbPath = join(userData(), 'clover-mail.db')
  if (!existsSync(dbPath)) return { saved: false, error: 'No database found to back up.' }

  try {
    getRawDb().pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // best effort: continue with whatever is on disk
  }

  const zip = new AdmZip()
  zip.addLocalFile(dbPath)
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify(
        {
          app: 'clover-mail',
          version: app.getVersion(),
          kind: 'full',
          attachments: includeAttachments,
          createdAt: Date.now()
        },
        null,
        2
      ),
      'utf8'
    )
  )

  const attachDir = join(userData(), 'attachments')
  if (includeAttachments && existsSync(attachDir)) {
    zip.addLocalFolder(attachDir, 'attachments')
  }

  zip.writeZip(result.filePath)
  return { saved: true, path: result.filePath, bytes: statSync(result.filePath).size }
}

export async function importBackup(window: BrowserWindow | null): Promise<BackupResult> {
  const options: OpenDialogOptions = {
    title: 'Import Clover Mail backup',
    properties: ['openFile'],
    filters: [{ name: 'Clover Mail backup', extensions: ['zip'] }]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { restored: false }

  try {
    const zip = new AdmZip(result.filePaths[0])
    const dbEntry = zip.getEntry('clover-mail.db')
    if (!dbEntry) return { restored: false, error: 'This file is not a Clover Mail backup.' }

    const target = join(userData(), 'clover-mail.db')
    closeDatabase()

    if (existsSync(target)) {
      const stamp = Date.now()
      copyFileSync(target, `${target}.bak-${stamp}`)
      for (const suffix of ['-wal', '-shm']) {
        if (existsSync(`${target}${suffix}`)) copyFileSync(`${target}${suffix}`, `${target}.bak-${stamp}${suffix}`)
      }
    }

    mkdirSync(userData(), { recursive: true })
    zip.extractAllTo(userData(), true)
  } catch (error) {
    return { restored: false, error: (error as Error).message }
  }

  // Relaunch so the restored database is loaded cleanly.
  setTimeout(() => {
    app.relaunch()
    app.exit(0)
  }, 600)
  return { restored: true, relaunching: true }
}
