import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterChip } from './filter-chip'

describe('FilterChip', () => {
  it('renders content and removes without nesting buttons', async () => {
    const user = userEvent.setup()
    const remove = vi.fn()
    const { container } = render(
      <FilterChip removeLabel="Remove txn 42 filter" onRemove={remove}>
        txn #42
      </FilterChip>,
    )

    expect(screen.getByText('txn #42')).toBeTruthy()
    const removeBtn = screen.getByRole('button', { name: 'Remove txn 42 filter' })
    expect(removeBtn).toBeTruthy()
    expect(container.querySelector('button button')).toBeNull()

    await user.click(removeBtn)
    expect(remove).toHaveBeenCalledOnce()
  })

  it('supports keyboard activation via Enter and Space on remove button', async () => {
    const user = userEvent.setup()
    const remove = vi.fn()
    render(
      <FilterChip removeLabel="Remove database mydb filter" onRemove={remove}>
        db: mydb
      </FilterChip>,
    )

    const removeBtn = screen.getByRole('button', { name: 'Remove database mydb filter' })
    removeBtn.focus()
    expect(document.activeElement).toBe(removeBtn)

    await user.keyboard('{Enter}')
    expect(remove).toHaveBeenCalledTimes(1)

    await user.keyboard(' ')
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
