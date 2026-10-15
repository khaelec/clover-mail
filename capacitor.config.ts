import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor shell for the Android client. The web bundle is the renderer built
 * by `vite.mobile.config.ts` (output `dist-mobile`); the app connects to the
 * desktop's transport server (Settings → Privacy → Mobile access) at runtime.
 */
const config: CapacitorConfig = {
  appId: 'com.clovermail.app',
  appName: 'Clover Mail',
  webDir: 'dist-mobile',
  // The bundle loads from http://localhost and talks to the desktop over plain
  // http on the LAN, so keep the scheme http and permit cleartext traffic.
  server: { androidScheme: 'http', cleartext: true },
  android: { allowMixedContent: true }
}

export default config
