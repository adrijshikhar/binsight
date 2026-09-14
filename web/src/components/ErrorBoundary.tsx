import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary. Without it, a render-time exception in any view
 * unmounts the tree and leaves a SILENT BLANK pane - the hardest failure mode
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
      <div className="flex flex-col p-6 gap-4 max-w-[720px]">
        <Alert variant="error" role="alert">
          <AlertTitle>Something broke rendering this view</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-3 mt-2">
              <p className="text-sm">The error was logged to the browser console. This is a UI bug - the data is fine.</p>
              <pre className="p-3 bg-muted/60 rounded-md font-mono text-xs whitespace-pre-wrap overflow-x-auto">
                {error.message}
              </pre>
              <Button
                size="xs"
                variant="outline"
                onClick={() => window.location.reload()}
                className="self-start"
              >
                Reload
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    )
  }
}
