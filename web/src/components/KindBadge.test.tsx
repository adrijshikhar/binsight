import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import KindBadge, { kindToDataAttr, kindToBadgeVariant } from './KindBadge'

describe('KindBadge', () => {
  it('renders event type name', () => {
    render(<KindBadge typeName="WRITE_ROWS_V1" />)
    expect(screen.getByText('WRITE_ROWS_V1')).toBeTruthy()
  })

  it('is a passive element and not a button or focusable', () => {
    render(<KindBadge typeName="UNKNOWN_EVENT_77" />)
    expect(screen.getByText('UNKNOWN_EVENT_77')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    const badge = screen.getByText('UNKNOWN_EVENT_77')
    expect(badge.getAttribute('tabIndex')).toBeNull()
  })

  it('maps data-kind correctly for event types', () => {
    expect(kindToDataAttr('WRITE_ROWS_V1')).toBe('WRITE')
    expect(kindToDataAttr('WRITE_ROWS_V2')).toBe('WRITE')
    expect(kindToDataAttr('UPDATE_ROWS_V1')).toBe('UPDATE')
    expect(kindToDataAttr('UPDATE_ROWS_V2')).toBe('UPDATE')
    expect(kindToDataAttr('DELETE_ROWS_V1')).toBe('DELETE')
    expect(kindToDataAttr('DELETE_ROWS_V2')).toBe('DELETE')
    expect(kindToDataAttr('QUERY')).toBe('QUERY')
    expect(kindToDataAttr('CREATE')).toBe('CREATE')
    expect(kindToDataAttr('ALTER')).toBe('ALTER')
    expect(kindToDataAttr('DROP')).toBe('DROP')
    expect(kindToDataAttr('TRUNCATE')).toBe('TRUNCATE')
    expect(kindToDataAttr('TABLE_MAP')).toBe('TABLE_MAP')
    expect(kindToDataAttr('XID')).toBe('XID')
    expect(kindToDataAttr('UNKNOWN')).toBe('default')
  })

  it('maps semantic variants following strict green quarantine and data roles', () => {
    // WRITE is insert (green)
    expect(kindToBadgeVariant('WRITE_ROWS_V1')).toBe('success')
    expect(kindToBadgeVariant('WRITE_ROWS_V2')).toBe('success')

    // UPDATE is update (amber/orange), NOT primary blue
    expect(kindToBadgeVariant('UPDATE_ROWS_V1')).toBe('warning')
    expect(kindToBadgeVariant('UPDATE_ROWS_V2')).toBe('warning')
    expect(kindToBadgeVariant('UPDATE_ROWS_V1')).not.toBe('default')
    expect(kindToBadgeVariant('UPDATE_ROWS_V1')).not.toBe('primary')

    // DELETE is delete (rose/red)
    expect(kindToBadgeVariant('DELETE_ROWS_V1')).toBe('error')
    expect(kindToBadgeVariant('DELETE_ROWS_V2')).toBe('error')

    // QUERY, CREATE, ALTER are query (purple) - CREATE is NOT insert (no green for DDL)
    expect(kindToBadgeVariant('QUERY')).toBe('info')
    expect(kindToBadgeVariant('CREATE')).toBe('info')
    expect(kindToBadgeVariant('CREATE')).not.toBe('success')
    expect(kindToBadgeVariant('ALTER')).toBe('info')
    expect(kindToBadgeVariant('ALTER')).not.toBe('primary')

    // DROP is delete (rose/red)
    expect(kindToBadgeVariant('DROP')).toBe('error')

    // TRUNCATE is update/warning (amber)
    expect(kindToBadgeVariant('TRUNCATE')).toBe('warning')

    // Neutral kinds are neutral/outline
    expect(kindToBadgeVariant('TABLE_MAP')).toBe('outline')
    expect(kindToBadgeVariant('XID')).toBe('outline')
    expect(kindToBadgeVariant('GTID')).toBe('outline')
    expect(kindToBadgeVariant('UNKNOWN_EVENT_77')).toBe('outline')
  })

  it('renders with correct data-kind and data-slot', () => {
    const { container } = render(<KindBadge typeName="DELETE_ROWS_V2" />)
    const el = container.querySelector('[data-kind="DELETE"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('data-slot')).toBe('badge')
  })
})
