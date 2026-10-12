import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

let root = ''

export function setStorageRoot(dir: string): void {
  root = dir
}

function attachmentsRoot(): string {
  return join(root, 'attachments')
}

/** Persist an attachment's bytes and return a storage-relative path. */
export function saveAttachment(
  messageId: string,
  attachmentId: string,
  filename: string | null,
  data: Buffer
): string {
  const dir = join(attachmentsRoot(), messageId)
  mkdirSync(dir, { recursive: true })
  const ext = filename ? extname(filename).slice(0, 12) : ''
  const rel = join(messageId, `${attachmentId}${ext}`)
  writeFileSync(join(attachmentsRoot(), rel), data)
  return rel
}

export function attachmentAbsolutePath(rel: string): string {
  return join(attachmentsRoot(), rel)
}

export function attachmentExists(rel: string | null): boolean {
  return Boolean(rel) && existsSync(attachmentAbsolutePath(rel as string))
}

/** Read an attachment as a data URL when small enough to inline safely. */
export function readAttachmentDataUrl(
  rel: string | null,
  mimeType: string | null,
  maxBytes = 3_000_000
): string | null {
  if (!rel) return null
  const path = attachmentAbsolutePath(rel)
  if (!existsSync(path)) return null
  const buffer = readFileSync(path)
  if (buffer.length > maxBytes) return null
  return `data:${mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`
}
