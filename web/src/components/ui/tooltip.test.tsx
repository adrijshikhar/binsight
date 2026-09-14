import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from './tooltip'

describe('Tooltip', () => {
  it('renders trigger element and presents popup content on interaction', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<button type="button">Hover trigger</button>} />
          <TooltipPopup>Helpful tip text</TooltipPopup>
        </Tooltip>
      </TooltipProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Hover trigger' })
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('data-slot')).toBe('tooltip-trigger')

    // Hover reveals tooltip
    await user.hover(trigger)
    await waitFor(() => {
      expect(screen.getByText('Helpful tip text')).toBeDefined()
    })

    // Unhover hides tooltip
    await user.unhover(trigger)
    await waitFor(() => {
      expect(screen.queryByText('Helpful tip text')).toBeNull()
    })
  })

  it('forwards focus to trigger and handles Escape key dismissal', async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<button type="button">Focus trigger</button>} />
          <TooltipPopup>Focus tip</TooltipPopup>
        </Tooltip>
      </TooltipProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Focus trigger' })
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await user.hover(trigger)
    await waitFor(() => {
      expect(screen.getByText('Focus tip')).toBeDefined()
    })

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByText('Focus tip')).toBeNull()
    })
  })
})
