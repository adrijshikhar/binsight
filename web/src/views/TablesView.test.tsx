import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import TablesView from './TablesView'
import * as apiModule from '../lib/api'
import type { TableStat } from '../lib/types'

function wrap(ui: React.ReactElement) {
  return render(ui)
}

const MOCK_TABLES: TableStat[] = [
  {
    id: 1,
    file_id: 1,
    db_name: 'mydb',
    table_name: 'users',
    table_map_count: 5,
    column_types_json: '["int","varchar"]',
    inserts: 10,
    updates: 3,
    deletes: 1,
    rows_total: 14,
    bytes_total: 2048,
  },
  {
    id: 2,
    file_id: 1,
    db_name: 'mydb',
    table_name: 'orders',
    table_map_count: 2,
    column_types_json: '["int","int"]',
    inserts: 5,
    updates: 0,
    deletes: 0,
    rows_total: 5,
    bytes_total: 1024,
  },
]

function makeProps(overrides = {}) {
  return {
    fileId: 1,
    onOpenTable: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(apiModule.api, 'tables').mockResolvedValue(MOCK_TABLES)
})

describe('TablesView', () => {
  it('shows loading text initially', () => {
    wrap(<TablesView {...makeProps()} />)
    expect(screen.getByText(/loading tables/i)).toBeTruthy()
  })

  it('renders table cards after load', async () => {
    wrap(<TablesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('mydb.users')).toBeTruthy()
      expect(screen.getByText('mydb.orders')).toBeTruthy()
    })
  })

  it('shows column types inside each card', async () => {
    wrap(<TablesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('int, varchar')).toBeTruthy()
    })
  })

  it('shows ins/upd/del badges with semantic data variants', async () => {
    wrap(<TablesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByText('+15 ins')).toBeTruthy()
      expect(screen.getByText('~3 upd')).toBeTruthy()
      expect(screen.getByText('-1 del')).toBeTruthy()
      expect(screen.getByText('10 ins')).toBeTruthy()
      expect(screen.getByText('3 upd')).toBeTruthy()
      expect(screen.getByText('1 del')).toBeTruthy()
    })
  })

  it('calls onOpenTable when a card is clicked', async () => {
    const onOpenTable = vi.fn()
    wrap(<TablesView {...makeProps({ onOpenTable })} />)
    await waitFor(() => screen.getByText('mydb.users'))
    screen
      .getByText('mydb.users')
      .closest('[role="button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onOpenTable).toHaveBeenCalledWith('mydb', 'users')
  })

  it('calls onOpenTable when card receives Enter or Space key', async () => {
    const onOpenTable = vi.fn()
    wrap(<TablesView {...makeProps({ onOpenTable })} />)
    await waitFor(() => screen.getByText('mydb.users'))
    const card = screen.getByText('mydb.users').closest('[role="button"]')!
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onOpenTable).toHaveBeenCalledWith('mydb', 'users')
  })

  it('renders long table names with overflow handling', async () => {
    const longTable: TableStat = {
      id: 3,
      file_id: 1,
      db_name: 'super_long_database_name_production_cluster_01',
      table_name: 'extremely_long_table_name_with_partitions_audit_log_2026_archive',
      table_map_count: 1,
      column_types_json: '["varchar"]',
      inserts: 1,
      updates: 0,
      deletes: 0,
      rows_total: 1,
      bytes_total: 512,
    }
    vi.spyOn(apiModule.api, 'tables').mockResolvedValue([longTable])
    wrap(<TablesView {...makeProps()} />)
    await waitFor(() => {
      expect(
        screen.getByText(
          'super_long_database_name_production_cluster_01.extremely_long_table_name_with_partitions_audit_log_2026_archive',
        ),
      ).toBeTruthy()
    })
  })

  it('shows empty state when no tables', async () => {
    vi.spyOn(apiModule.api, 'tables').mockResolvedValue([])
    wrap(<TablesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy()
      expect(screen.getByText(/No tables in this file/i)).toBeTruthy()
    })
  })

  it('shows error alert on API failure', async () => {
    vi.spyOn(apiModule.api, 'tables').mockRejectedValue(new Error('fetch failed'))
    wrap(<TablesView {...makeProps()} />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })
})
