import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { MessageWindow } from './components/MessageWindow'
import { ComposeWindow } from './components/ComposeWindow'
import { initTheme } from './theme/theme'
import './styles/index.css'

void initTheme()

// A message popped out into its own window loads this page with #message=<id>;
// a message being written, with #compose=<token>.
const popout = /^#message=(.+)$/.exec(window.location.hash)
const composeOut = /^#compose=(.+)$/.exec(window.location.hash)

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {popout ? (
      <MessageWindow messageId={decodeURIComponent(popout[1])} />
    ) : composeOut ? (
      <ComposeWindow token={composeOut[1]} />
    ) : (
      <App />
    )}
  </StrictMode>
)
