import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArchitectureView from './ArchitectureView'

function wrap(ui: React.ReactElement) {
  return render(ui)
}

describe('ArchitectureView', () => {
  it('renders the architecture title', () => {
    wrap(<ArchitectureView onClose={() => {}} />)
    expect(screen.getByText(/- Pluggable Decoder Architecture/)).toBeTruthy()
  })

  it('renders the subtitle', () => {
    wrap(<ArchitectureView onClose={() => {}} />)
    expect(screen.getByText(/Go core · no privileged library · adapters behind one interface/)).toBeTruthy()
  })

  it('fires onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    wrap(<ArchitectureView onClose={onClose} />)
    const btn = screen.getByRole('button', { name: /close architecture view/i })
    await userEvent.click(btn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders all layer headings', () => {
    wrap(<ArchitectureView onClose={() => {}} />)
    expect(screen.getByText('Event Sources')).toBeTruthy()
    expect(screen.getByText('The Only Contract Core Knows')).toBeTruthy()
    expect(screen.getByText('Adapters (2 shipped · 1 planned)')).toBeTruthy()
    expect(screen.getByText('Core (Go binary)')).toBeTruthy()
    expect(screen.getByText('Web UI (React + TS · go:embed · localhost)')).toBeTruthy()
  })

  it('renders adapter names', () => {
    wrap(<ArchitectureView onClose={() => {}} />)
    expect(screen.getByText('go-mysql')).toBeTruthy()
    expect(screen.getByText('mysqlbinlog')).toBeTruthy()
    expect(screen.getByText('connector-java')).toBeTruthy()
  })

  it('renders the legend swatches', () => {
    wrap(<ArchitectureView onClose={() => {}} />)
    expect(screen.getByText('builtin adapter (in-process)')).toBeTruthy()
    expect(screen.getByText('exec adapter (subprocess, JSON-lines)')).toBeTruthy()
    // "planned" appears as a Badge in the adapter card too - use getAllByText
    expect(screen.getAllByText('planned').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('interface / schema contract')).toBeTruthy()
  })
})
