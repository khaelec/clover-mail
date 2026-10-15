import type { CapacitorConfig } from '@capacitor/cli'

// Phase 0 spike (throwaway, branch feat/android only). A minimal Capacitor app
// whose WebView runs a diagnostics page and whose Node runtime (nodejs-mobile,
// via @capawesome/capacitor-nodejs) runs spike/node. See PLAN-mobile.md Phase 0.
const config: CapacitorConfig = {
  appId: 'com.clovermail.spike',
  appName: 'Clover Spike',
  webDir: 'spike/dist',
  plugins: {
    Nodejs: { nodeDir: 'nodejs', startMode: 'auto' }
  }
}

export default config
