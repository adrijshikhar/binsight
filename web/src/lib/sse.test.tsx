import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SSEContext, useIndexEvent, type IndexEvent } from './sse'

function Probe() {
  const ev = useIndexEvent()
  return <div data-testid="probe">{ev ? `${ev.type}:${ev.file_id}:${ev.seq}` : 'null'}</div>
}

describe('SSEContext + useIndexEvent', () => {
  it('reads the provided event inside a provider', () => {
    const ev: IndexEvent = { type: 'index_done', file_id: 7, seq: 3 }
    render(
      <SSEContext.Provider value={ev}>
        <Probe />
      </SSEContext.Provider>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('index_done:7:3')
  })

  it('returns null outside any provider', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe').textContent).toBe('null')
  })
})
