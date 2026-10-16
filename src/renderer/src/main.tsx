import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './theme/theme'
import { isNative } from './lib/mobile'
import './styles/index.css'

void initTheme()

const root = createRoot(document.getElementById('root') as HTMLElement)

// On the phone, show the engine status on screen. Kept to a single truncated
// line with a dismiss button so a long error can't cover the UI (the Update
// button, etc.). logcat is silent from nodejs-mobile and the WebView console.
function showStatus(text: string): void {
  let el = document.getElementById('clover-status')
  if (!el) {
    el = document.createElement('div')
    el.id = 'clover-status'
    el.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;gap:6px;background:#000;color:#3f6;font:12px monospace;padding:5px 6px'
    const span = document.createElement('span')
    span.style.cssText = 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    const close = document.createElement('button')
    close.textContent = '×'
    close.setAttribute('aria-label', 'Dismiss')
    close.style.cssText =
      'flex:0 0 auto;background:transparent;border:0;color:#3f6;font-size:16px;line-height:1;padding:0 4px'
    close.onclick = () => el?.remove()
    el.append(span, close)
    document.body.appendChild(el)
  }
  const line = el.querySelector('span')
  if (line) line.textContent = text.split('\n')[0]
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
