import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ConnectScreen } from './components/ConnectScreen'
import { initTheme } from './theme/theme'
import { installWebClover } from './lib/webClover'
import { getBase, isNative } from './lib/mobile'
import { initNativeNotifications } from './lib/nativeNotify'
import './styles/index.css'

void initTheme()

const root = createRoot(document.getElementById('root') as HTMLElement)

async function boot(): Promise<void> {
  // A tap on a phone notification opens the message / section it refers to.
  await initNativeNotifications((extra) => {
    if (extra.messageId) {
      window.dispatchEvent(
        new CustomEvent('clover:open-message', {
          detail: { accountId: extra.accountId, messageId: extra.messageId }
        })
      )
    } else if (extra.nav) {
      window.dispatchEvent(new CustomEvent('clover:navigate', { detail: { section: extra.nav } }))
    }
  })

  if (isNative() && !getBase()) {
    // First run in the mobile shell: ask which desktop to connect to.
    root.render(
      <StrictMode>
        <ConnectScreen />
      </StrictMode>
    )
    return
  }

  // In Electron the preload provides window.clover; in a browser / the mobile
  // shell build it over the transport server instead.
  await installWebClover()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void boot()
