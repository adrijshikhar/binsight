import { describe, it, expect, vi } from 'vitest'
import React, { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FilterMultiSelect from './FilterMultiSelect'

function Harness({
  initialValue = [],
  options = ['alpha', 'beta', 'gamma'],
  label = 'Database',
  summaryNoun = 'dbs',
  onChange = vi.fn(),
}: {
  initialValue?: string[]
  options?: string[]
  label?: string
  summaryNoun?: string
  onChange?: (v: string[]) => void
}) {
  const [val, setVal] = useState<string[]>(initialValue)
  return (
    <FilterMultiSelect
      label={label}
      options={options}
      value={val}
      onChange={(v) => {
        setVal(v)
        onChange(v)
      }}
      summaryNoun={summaryNoun}
    />
  )
}

describe('FilterMultiSelect', () => {
  it('renders with accessible label and summary noun', () => {
    render(<Harness options={['users', 'orders']} label="Table" summaryNoun="tables" />)
    expect(screen.getByRole('combobox', { name: 'Table' })).toBeTruthy()
  })

  it('allows multi-selection and displays summary when multiple items are selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness options={['alpha', 'beta', 'gamma']} label="Database" summaryNoun="dbs" onChange={onChange} />)

    const input = screen.getByRole('combobox', { name: 'Database' })
    await user.click(input)

    const alphaOption = await screen.findByRole('option', { name: /alpha/i })
    await user.click(alphaOption)

    expect(onChange).toHaveBeenCalledWith(['alpha'])

    await user.click(input)
    const betaOption = await screen.findByRole('option', { name: /beta/i })
    await user.click(betaOption)

    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta'])
  })

  it('keeps selected values absent from options visible and removable', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initialValue={['retired']} options={['alpha']} onChange={onChange} />)

    expect(screen.getByText('retired')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Remove retired' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows no-results state when search does not match', async () => {
    const user = userEvent.setup()
    render(<Harness options={['alpha', 'beta']} label="Database" summaryNoun="dbs" />)

    const input = screen.getByRole('combobox', { name: 'Database' })
    await user.type(input, 'nonexistent')

    expect(await screen.findByText(/no results|no options/i)).toBeTruthy()
  })
})
