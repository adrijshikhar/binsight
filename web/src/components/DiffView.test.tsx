import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import DiffView, { RowImages } from './DiffView'
import type { DiffResult } from '../lib/types'

// jsdom doesn't implement matchMedia - Mantine's color-scheme hook needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

function wrap(ui: React.ReactElement) {
  return render(
    <div data-theme="dark">
      {ui}
    </div>,
  )
}

function makeDiff(overrides: Partial<DiffResult> = {}): DiffResult {
  return {
    pos: 100,
    adapters: ['gomysql', 'mysqlbinlog'],
    fields: [],
    errors: {},
    timing_ms: { gomysql: 1, mysqlbinlog: 2 },
    disagreement_count: 0,
    ...overrides,
  }
}

describe('DiffView', () => {
  it('renders "✓ all adapters agree" when no disagreements', () => {
    wrap(<DiffView diff={makeDiff()} />)
    const el = screen.getByText(/all adapters agree/i)
    expect(el).toBeTruthy()
    expect(el.textContent).toContain('✓ all adapters agree')
    expect(el.className).toMatch(/agreeText/)
  })

  it('shows disagreement count when disagreements exist', () => {
    const diff = makeDiff({
      disagreement_count: 1,
      fields: [
        {
          name: 'decoded.table',
          agree: false,
          partial: false,
          severity: 'decoded',
          values: { gomysql: 'foo', mysqlbinlog: 'bar' },
        },
      ],
    })
    wrap(<DiffView diff={diff} />)
    expect(screen.getByText(/1 disagreement/i)).toBeTruthy()
  })

  it('disagree row carries the disagree CSS module class', () => {
    const diff = makeDiff({
      disagreement_count: 1,
      fields: [
        {
          name: 'decoded.table',
          agree: false,
          partial: false,
          severity: 'decoded',
          values: { gomysql: 'oracle_val', mysqlbinlog: 'other_val' },
        },
      ],
    })
    const { container } = wrap(<DiffView diff={diff} />)
    // At least one cell should carry a class that includes "disagree" (CSS Modules mangles names)
    const disagreeCells = container.querySelectorAll('[class*="disagree"]')
    expect(disagreeCells.length).toBeGreaterThan(0)
  })

  it('changed value cell carries diffValChanged class on a disagree row', () => {
    const diff = makeDiff({
      disagreement_count: 1,
      fields: [
        {
          name: 'decoded.table',
          agree: false,
          partial: false,
          severity: 'decoded',
          values: { gomysql: 'oracle_val', mysqlbinlog: 'other_val' },
        },
      ],
    })
    const { container } = wrap(<DiffView diff={diff} />)
    // The non-oracle value should be in a cell with diffValChanged class
    const changedCells = container.querySelectorAll('[class*="diffValChanged"]')
    expect(changedCells.length).toBeGreaterThan(0)
    // It should display the differing value
    expect(changedCells[0].textContent).toBe('other_val')
  })

  it('agree row carries the agree CSS module class and no diffValChanged', () => {
    const diff = makeDiff({
      disagreement_count: 0,
      fields: [
        {
          name: 'decoded.table',
          agree: true,
          partial: false,
          severity: 'decoded',
          values: { gomysql: 'same', mysqlbinlog: 'same' },
        },
      ],
    })
    const { container } = wrap(<DiffView diff={diff} />)
    const agreeCells = container.querySelectorAll('[class*="agree"]')
    expect(agreeCells.length).toBeGreaterThan(0)
    const changedCells = container.querySelectorAll('[class*="diffValChanged"]')
    expect(changedCells.length).toBe(0)
  })

  it('does NOT render "all adapters agree" when adapter errors exist', () => {
    const diff = makeDiff({
      disagreement_count: 0,
      errors: { mysqlbinlog: 'mysqlbinlog exited: exit status 1' },
    })
    wrap(<DiffView diff={diff} />)
    expect(screen.queryByText(/all adapters agree/i)).toBeNull()
    expect(screen.getByText(/1 adapter error/i)).toBeTruthy()
    expect(screen.getByText(/mysqlbinlog: mysqlbinlog exited: exit status 1/i)).toBeTruthy()
  })

  it('marks agreement with data-status="agreement" and row additions with data-change="added"', () => {
    const diff = makeDiff({
      disagreement_count: 0,
      fields: [
        {
          name: 'decoded.table',
          agree: true,
          partial: false,
          severity: 'decoded',
          values: { gomysql: 'users', mysqlbinlog: 'users' },
        },
      ],
    })
    const { container: diffContainer } = wrap(<DiffView diff={diff} />)
    const agreement = diffContainer.querySelector('[data-status="agreement"]')
    expect(agreement).toBeTruthy()
    expect(agreement?.getAttribute('data-status')).toBe('agreement')

    // Test RowImages addition
    const { container: rowContainer } = render(
      <RowImages
        rows={[{ before: undefined, after: ['new_row_val'] }]}
        colTypes={['VARCHAR']}
      />,
    )
    const addition = rowContainer.querySelector('[data-change="added"]')
    expect(addition).toBeTruthy()
    expect(addition?.getAttribute('data-change')).toBe('added')
  })
})

