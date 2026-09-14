import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'
import './styles/ui.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ColorSchemeProvider, applyInitialScheme } from './lib/colorScheme'
import { ToastProvider } from './components/ui/toast'

// Apply initial scheme before mounting to avoid wrong-theme flash
applyInitialScheme()

// Global logging for errors React's render cycle can't catch (async handlers,
// promise rejections). The browser console is the UI's log channel.
window.addEventListener('error', (e) => console.error('[binsight] uncaught error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[binsight] unhandled rejection:', e.reason))

function RootApp() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ToastProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeProvider>
      <RootApp />
    </ColorSchemeProvider>
  </StrictMode>,
)
