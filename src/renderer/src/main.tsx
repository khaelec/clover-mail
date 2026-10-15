import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './theme/theme'
import { isNative } from './lib/mobile'
import './styles/index.css'

void initTheme()

const root = createRoot(document.getElementById('root') as HTMLElement)

// On the phone, show the engine status on screen (a screenshot in CI reads it;
// logcat is silent from both nodejs-mobile and the WebView console).
function showStatus(text: string): void {
  let el = document.getElementById('clover-status')
  if (!el) {
    el = document.createElement('div')
    el.id = 'clover-status'
    el.style.cssText =
      'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#000;color:#3f6;font:12px monospace;padding:6px;white-space:pre-wrap'
    document.body.appendChild(el)
  }
  el.textContent = text
}

async function boot(): Promise<void> {
  // On the phone there is no preload: build window.clover over the on-device
  // engine (nodejs-mobile message channel). In Electron the preload provides it.
  if (isNative()) {
    showStatus('engine: importing…')
    try {
      const { installChannelClover } = await import('./lib/channelClover')
      await installChannelClover(showStatus)
      showStatus('querying app:info…')
      const info = await Promise.race([
        window.clover.appInfo(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('app:info timed out (engine not replying)')), 15000)
        )
      ])
      showStatus(`engine OK — ${info?.name} ${info?.version}`)
    } catch (error) {
      showStatus(`engine ERROR — ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
