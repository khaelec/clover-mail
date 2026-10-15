import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './theme/theme'
import { isNative } from './lib/mobile'
import './styles/index.css'

void initTheme()

const root = createRoot(document.getElementById('root') as HTMLElement)

async function boot(): Promise<void> {
  // On the phone there is no preload: build window.clover over the on-device
  // engine (nodejs-mobile message channel). In Electron the preload provides it.
  if (isNative()) {
    const { installChannelClover } = await import('./lib/channelClover')
    await installChannelClover()
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
