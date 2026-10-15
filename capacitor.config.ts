import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The standalone Android app: a Capacitor WebView (the React renderer built to
 * dist-mobile) plus a nodejs-mobile runtime running the Clover Mail engine
 * (dist-mobile/nodejs). The WebView talks to the engine over the message
 * channel — no desktop, no network listener.
 */
const config: CapacitorConfig = {
  appId: 'com.clovermail.app',
  appName: 'Clover Mail',
  webDir: 'dist-mobile',
  plugins: {
    // Manual start so the WebView controls (and can log) when the engine boots.
    Nodejs: { nodeDir: 'nodejs', startMode: 'manual' }
  }
}

export default config
