import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, Button, Code, Stack, Text } from '@mantine/core'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary. Without it, a render-time exception in any view
 * unmounts the tree and leaves a SILENT BLANK pane — the hardest failure mode
 * to debug. This catches it, logs the error + component stack to the console
 * (the UI's log channel), and shows a visible fallback with a reload action so
 * the failure is never invisible.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The browser console is the UI's log channel; surface the full context.
    console.error('[binsight] render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <Stack p="xl" gap="md" style={{ maxWidth: 720 }}>
        <Alert color="red" title="Something broke rendering this view" role="alert">
          <Stack gap="sm">
            <Text size="sm">The error was logged to the browser console. This is a UI bug — the data is fine.</Text>
            <Code block style={{ whiteSpace: 'pre-wrap' }}>
              {error.message}
            </Code>
            <Button
              size="xs"
              variant="default"
              onClick={() => window.location.reload()}
              style={{ alignSelf: 'flex-start' }}
            >
              Reload
            </Button>
          </Stack>
        </Alert>
      </Stack>
    )
  }
}
