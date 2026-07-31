import { createContext, useContext } from 'react'

// IndexEvent is the parsed payload of an SSE message from /api/stream. `seq` is
// a monotonic counter so consumers re-run effects even on repeated (type,file)
// pairs.
export interface IndexEvent {
  type: string
  file_id: number
  seq: number
}

export const SSEContext = createContext<IndexEvent | null>(null)

export function useIndexEvent(): IndexEvent | null {
  return useContext(SSEContext)
}
