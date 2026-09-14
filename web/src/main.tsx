import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, ColorSchemeScript } from '@mantine/core'
import '@mantine/core/styles.css'
import './global.css'
import './styles/ui.css'
import { theme, cssVariablesResolver } from './theme'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

// Global logging for errors React's render cycle can't catch (async handlers,
// promise rejections). The browser console is the UI's log channel.
window.addEventListener('error', (e) => console.error('[binsight] uncaught error:', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[binsight] unhandled rejection:', e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorSchemeScript defaultColorScheme="dark" />
    <MantineProvider theme={theme} defaultColorScheme="dark" cssVariablesResolver={cssVariablesResolver}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </MantineProvider>
  </StrictMode>,
)
