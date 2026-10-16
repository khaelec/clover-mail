import { isNative } from './mobile'

/** Hide e-mail addresses before a log leaves the device. */
function redact(text: string): string {
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
}

/**
 * Build a pre-filled GitHub issue from the recent logs (redacted). Tapping it
 * lands the log on GitHub, where it can be read without a device or adb.
 */
export async function buildIssueUrl(extra?: string): Promise<string> {
  let logs = ''
  try {
    logs = await window.clover.readLogs(80)
  } catch {
    // no logs available
  }
  const body = [
    '### What happened',
    extra ?? '',
    '',
    '### Environment',
    navigator.userAgent,
    '',
    logs ? `### Recent log\n\`\`\`\n${redact(logs).slice(0, 5000)}\n\`\`\`` : ''
  ].join('\n')
  return `https://github.com/khaelec/clover-mail/issues/new?title=${encodeURIComponent(
    'Bug report'
  )}&body=${encodeURIComponent(body)}`
}

/** Open the report URL (system browser on Android). */
export function openReport(url: string): void {
  if (isNative()) window.open(url, '_system')
  else window.open(url)
}
