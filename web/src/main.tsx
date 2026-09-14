import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './global.css'
import './styles/ui.css'
import { theme, cssVariablesResolver } from './theme'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ColorSchemeProvider, useColorScheme, applyInitialScheme } from './lib/colorScheme'
import { ToastProvider } from './components/ui/toast'

// Apply initial scheme before mounting to avoid wrong-theme flash
applyInitialScheme()

// Global logging for errors React's render cycle can't catch (async handlers,
// promise rejections). The browser console is the UI's log channel.
window.addEventListener('error', (e) => console.error('[binsight] uncaught error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[binsight] unhandled rejection:', e.reason))

function RootApp() {
  const { resolved } = useColorScheme()
  return (
    <MantineProvider theme={theme} forceColorScheme={resolved} cssVariablesResolver={cssVariablesResolver}>
      <ToastProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ToastProvider>
    </MantineProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeProvider>
      <RootApp />
    </ColorSchemeProvider>
  </StrictMode>,
)
