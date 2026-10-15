import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initTheme } from './theme/theme'
import { installWebClover } from './lib/webClover'
import './styles/index.css'

// In Electron the preload provides window.clover; in a browser (the mobile
// client) build it over the transport server instead.
installWebClover()
void initTheme()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
