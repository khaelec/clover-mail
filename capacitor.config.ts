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
    Nodejs: { nodeDir: 'nodejs', startMode: 'auto' }
  }
}

export default config
