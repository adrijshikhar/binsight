import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('does not activate a disabled action', async () => {
    const click = vi.fn()
    render(<Button type="button" disabled onClick={click}>Apply</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(click).not.toHaveBeenCalled()
  })

  it('renders native button attributes and handles click', async () => {
    const click = vi.fn()
    render(<Button type="button" onClick={click}>Submit</Button>)
    const btn = screen.getByRole('button', { name: 'Submit' })
    expect(btn).toBeTruthy()
    expect(btn.getAttribute('type')).toBe('button')
    await userEvent.click(btn)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('supports keyboard activation via Enter and Space', async () => {
    const click = vi.fn()
    render(<Button type="button" onClick={click}>Press Me</Button>)
    const btn = screen.getByRole('button', { name: 'Press Me' })
    btn.focus()
    await userEvent.keyboard('{Enter}')
    expect(click).toHaveBeenCalledTimes(1)
    await userEvent.keyboard(' ')
    expect(click).toHaveBeenCalledTimes(2)
  })
})
