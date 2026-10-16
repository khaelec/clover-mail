import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { FileOpener } from '@capacitor-community/file-opener'

/**
 * In-app update for the standalone Android build: poll the tiny manifest the CI
 * publishes next to the APK, and if it names a newer version, download the APK
 * and hand it to Android's installer. Keeps the user's data (same signing key).
 */
const MANIFEST =
  'https://github.com/khaelec/clover-mail/releases/download/android-dev/latest-android.json'

export interface UpdateInfo {
  version: string
  url: string
}

function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => Number(n) || 0)
  const b = current.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const res = await fetch(MANIFEST, { cache: 'no-store' })
    if (!res.ok) return null
    const info = (await res.json()) as { versionName?: string; url?: string }
    if (!info.versionName || !info.url) return null
    // Compare against the baked version, not app:info, so updating works even
    // if the engine isn't responding.
    return isNewer(info.versionName, __APP_VERSION__)
      ? { version: info.versionName, url: info.url }
      : null
  } catch {
    return null
  }
}

export async function installUpdate(url: string): Promise<void> {
  const file = await Filesystem.downloadFile({
    url,
    path: 'clover-update.apk',
    directory: Directory.Cache
  })
  if (!file.path) throw new Error('The download did not produce a file.')
  await FileOpener.open({
    filePath: file.path,
    contentType: 'application/vnd.android.package-archive'
  })
}
