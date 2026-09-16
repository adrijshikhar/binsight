import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import FilterBar, { emptyFilters, type Filters } from './FilterBar'

// jsdom doesn't implement ResizeObserver.
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom doesn't implement matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})


function wrap(ui: React.ReactNode) {
  return render(<div data-theme="dark">{ui}</div>)
}

function makeProps(overrides: Partial<Parameters<typeof FilterBar>[0]> = {}) {
  return {
    filters: { ...emptyFilters },
    grouped: false,
    txnIds: [],
    dbOptions: ['mydb', 'testdb'],
    tableOptions: ['users', 'orders'],
    onChange: vi.fn(),
    onRemoveTxn: vi.fn(),
    onToggleGrouped: vi.fn(),
    onJump: vi.fn(),
    ...overrides,
  }
}

describe('FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders type, db, and table MultiSelects', () => {
    wrap(<FilterBar {...makeProps()} />)
    expect(screen.getByPlaceholderText('Type')).toBeTruthy()
    expect(screen.getByPlaceholderText('Database')).toBeTruthy()
    expect(screen.getByPlaceholderText('Table')).toBeTruthy()
  })

  it('renders search input', () => {
    wrap(<FilterBar {...makeProps()} />)
    expect(screen.getByRole('textbox', { name: /search event summary/i })).toBeTruthy()
  })

  it('renders jump to position input', () => {
    wrap(<FilterBar {...makeProps()} />)
    expect(screen.getByRole('textbox', { name: /jump to byte position/i })).toBeTruthy()
  })

  it('renders flat/grouped segmented control', () => {
    wrap(<FilterBar {...makeProps()} />)
    expect(screen.getByRole('radio', { name: /flat/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /grouped/i })).toBeTruthy()
  })

  it('onChange called when search query changes', () => {
    const onChange = vi.fn()
    wrap(<FilterBar {...makeProps({ onChange })} />)
    const searchInput = screen.getByRole('textbox', { name: /search event summary/i })
    fireEvent.change(searchInput, { target: { value: 'SELECT' } })
    expect(onChange).toHaveBeenCalledWith({ ...emptyFilters, q: 'SELECT' })
  })

  it('onChange called when db MultiSelect option is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    wrap(<FilterBar {...makeProps({ onChange })} />)
    const dbInput = screen.getByRole('combobox', { name: /database|db/i })
    await user.click(dbInput)
    const opt = await screen.findByRole('option', { name: /mydb/i })
    await user.click(opt)
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
      const callArg: Filters = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(callArg.dbs).toContain('mydb')
    })
  })


  it('jump input: invalid input shows error message', () => {
    wrap(<FilterBar {...makeProps()} />)
    const jumpInput = screen.getByRole('textbox', { name: /jump to byte position/i })
    fireEvent.change(jumpInput, { target: { value: 'not-a-number' } })
    const goBtn = screen.getByRole('button', { name: /go to position/i })
    fireEvent.click(goBtn)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('enter a valid byte offset')).toBeTruthy()
  })

  it('jump input: negative number shows error message', () => {
    wrap(<FilterBar {...makeProps()} />)
    const jumpInput = screen.getByRole('textbox', { name: /jump to byte position/i })
    fireEvent.change(jumpInput, { target: { value: '-5' } })
    const goBtn = screen.getByRole('button', { name: /go to position/i })
    fireEvent.click(goBtn)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('jump input: valid number calls onJump', () => {
    const onJump = vi.fn()
    wrap(<FilterBar {...makeProps({ onJump })} />)
    const jumpInput = screen.getByRole('textbox', { name: /jump to byte position/i })
    fireEvent.change(jumpInput, { target: { value: '1024' } })
    const goBtn = screen.getByRole('button', { name: /go to position/i })
    fireEvent.click(goBtn)
    expect(onJump).toHaveBeenCalledWith(1024)
    expect(screen.queryByRole('alert')).toBeFalsy()
  })

  it('jump input: pressing Enter with valid number calls onJump', () => {
    const onJump = vi.fn()
    wrap(<FilterBar {...makeProps({ onJump })} />)
    const jumpInput = screen.getByRole('textbox', { name: /jump to byte position/i })
    fireEvent.change(jumpInput, { target: { value: '2048' } })
    fireEvent.keyDown(jumpInput, { key: 'Enter' })
    expect(onJump).toHaveBeenCalledWith(2048)
  })

  it('Go button is disabled when jump input is empty', () => {
    wrap(<FilterBar {...makeProps()} />)
    const goBtn = screen.getByRole('button', { name: /go to position/i }) as HTMLButtonElement
    expect(goBtn.disabled).toBe(true)
  })

  it('txnIds pills rendered with remove buttons', () => {
    const onRemoveTxn = vi.fn()
    wrap(<FilterBar {...makeProps({ txnIds: [42, 99], onRemoveTxn })} />)
    expect(screen.getByText(/txn #42/)).toBeTruthy()
    expect(screen.getByText(/txn #99/)).toBeTruthy()
    expect(screen.getByLabelText('Remove txn 42 filter')).toBeTruthy()
    expect(screen.getByLabelText('Remove txn 99 filter')).toBeTruthy()
  })

  it('onRemoveTxn called when pill remove button clicked', () => {
    const onRemoveTxn = vi.fn()
    wrap(<FilterBar {...makeProps({ txnIds: [42], onRemoveTxn })} />)
    const removeBtn = screen.getByLabelText('Remove txn 42 filter')
    fireEvent.click(removeBtn)
    expect(onRemoveTxn).toHaveBeenCalledWith(42)
  })

  it('no txn pills shown when txnIds is empty', () => {
    wrap(<FilterBar {...makeProps({ txnIds: [] })} />)
    expect(screen.queryByText(/txn #/)).toBeFalsy()
  })

  it('onToggleGrouped called when segmented control changes from flat to grouped', () => {
    const onToggleGrouped = vi.fn()
    wrap(<FilterBar {...makeProps({ grouped: false, onToggleGrouped })} />)
    const groupedOption = screen.getByRole('radio', { name: /grouped/i })
    fireEvent.click(groupedOption)
    expect(onToggleGrouped).toHaveBeenCalled()
  })

  it('onToggleGrouped not called when same value selected', () => {
    const onToggleGrouped = vi.fn()
    wrap(<FilterBar {...makeProps({ grouped: false, onToggleGrouped })} />)
    const flatOption = screen.getByRole('radio', { name: /flat/i })
    fireEvent.click(flatOption)
    expect(onToggleGrouped).not.toHaveBeenCalled()
  })

  it('renders active filter pills for types, dbs, and tables with remove buttons', () => {
    const onChange = vi.fn()
    wrap(
      <FilterBar
        {...makeProps({
          filters: {
            ...emptyFilters,
            types: ['WRITE_ROWS_V2', 'UPDATE_ROWS_V2'],
            dbs: ['mydb'],
            tables: ['users'],
          },
          onChange,
        })}
      />,
    )
    expect(screen.getByText('active:')).toBeTruthy()
    expect(screen.getByText('db: mydb')).toBeTruthy()
    expect(screen.getByText('table: users')).toBeTruthy()
    expect(screen.getByLabelText('Remove WRITE_ROWS_V2 filter')).toBeTruthy()
    expect(screen.getByLabelText('Remove UPDATE_ROWS_V2 filter')).toBeTruthy()
    expect(screen.getByLabelText('Remove database mydb filter')).toBeTruthy()
    expect(screen.getByLabelText('Remove table users filter')).toBeTruthy()

    const removeTypeBtn = screen.getByLabelText('Remove WRITE_ROWS_V2 filter')
    fireEvent.click(removeTypeBtn)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ['UPDATE_ROWS_V2'],
      }),
    )
  })

  it('clear all button clears all active filters and transactions', () => {
    const onChange = vi.fn()
    const onRemoveTxn = vi.fn()
    wrap(
      <FilterBar
        {...makeProps({
          filters: {
            ...emptyFilters,
            types: ['WRITE_ROWS_V2'],
            dbs: ['mydb'],
          },
          txnIds: [42],
          onChange,
          onRemoveTxn,
        })}
      />,
    )
    const clearAllBtn = screen.getByRole('button', { name: /clear filters|clear all/i })
    fireEvent.click(clearAllBtn)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        types: [],
        dbs: [],
        tables: [],
      }),
    )
    expect(onRemoveTxn).toHaveBeenCalledWith(42)
  })

  it('pressing / focuses the search input when outside input or textarea', () => {
    wrap(<FilterBar {...makeProps()} />)
    const searchInput = screen.getByRole('textbox', { name: /search event summary/i })
    expect(document.activeElement).not.toBe(searchInput)

    fireEvent.keyDown(document.body, { key: '/' })
    expect(document.activeElement).toBe(searchInput)
  })

  it('pressing / does not hijack focus when already inside another text input', () => {
    wrap(<FilterBar {...makeProps()} />)
    const searchInput = screen.getByRole('textbox', { name: /search event summary/i })
    const jumpInput = screen.getByRole('textbox', { name: /jump to byte position/i })
    jumpInput.focus()
    expect(document.activeElement).toBe(jumpInput)

    fireEvent.keyDown(jumpInput, { key: '/' })
    expect(document.activeElement).toBe(jumpInput)
    expect(document.activeElement).not.toBe(searchInput)
  })

  it('emptyFilters has expected shape', () => {
    expect(emptyFilters).toEqual({
      types: [],
      dbs: [],
      tables: [],
      q: '',
      from_pos: 0,
      to_pos: 0,
    })
  })
})
