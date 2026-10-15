import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ConnectScreen } from './components/ConnectScreen'
import { initTheme } from './theme/theme'
import { installWebClover } from './lib/webClover'
import { getBase, isNative } from './lib/mobile'
import './styles/index.css'

void initTheme()

const root = createRoot(document.getElementById('root') as HTMLElement)

if (isNative() && !getBase()) {
  // First run in the mobile shell: ask which desktop to connect to.
  root.render(
    <StrictMode>
      <ConnectScreen />
    </StrictMode>
  )
} else {
  // In Electron the preload provides window.clover; in a browser / the mobile
  // shell build it over the transport server instead.
  installWebClover()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
