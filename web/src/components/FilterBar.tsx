import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { IconSearch } from '@tabler/icons-react'
import KindBadge from './KindBadge'
import FilterMultiSelect from './FilterMultiSelect'
import { FilterChip } from '@/components/ui/filter-chip'
import { Input } from '@/components/ui/input'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import { RadioGroupPrimitive, RadioPrimitive } from '@/components/ui/radio-group'
import {
  segmentedControlRootClassName,
  segmentedControlItemVariants,
} from '@/lib/segmented-control'
import styles from './FilterBar.module.css'

export interface Filters {
  types: string[]
  dbs: string[]
  tables: string[]
  q: string
  from_pos: number
  to_pos: number
}

export const emptyFilters: Filters = { types: [], dbs: [], tables: [], q: '', from_pos: 0, to_pos: 0 }

const EVENT_TYPES = [
  'QUERY',
  'TABLE_MAP',
  'WRITE_ROWS_V1',
  'WRITE_ROWS_V2',
  'UPDATE_ROWS_V1',
  'UPDATE_ROWS_V2',
  'DELETE_ROWS_V1',
  'DELETE_ROWS_V2',
  'XID',
  'GTID',
  'ANONYMOUS_GTID',
  'ROTATE',
  'FORMAT_DESCRIPTION',
  'PREVIOUS_GTIDS',
  'STOP',
]

export interface FilterBarProps {
  filters: Filters
  grouped: boolean
  txnIds: number[]
  dbOptions: string[]
  tableOptions: string[]
  onChange: (f: Filters) => void
  onRemoveTxn: (id: number) => void
  onToggleGrouped: () => void
  onJump: (pos: number) => void
  searchRef?: React.RefObject<HTMLInputElement | null>
  live?: boolean
  onToggleLive?: (live: boolean) => void
}

export default function FilterBar(props: FilterBarProps) {
  const { filters, txnIds } = props
  const [jump, setJump] = useState('')
  const [jumpInvalid, setJumpInvalid] = useState(false)
  const internalRef = useRef<HTMLInputElement>(null)
  const qRef = props.searchRef ?? internalRef

  // Keyboard shortcut: '/' focuses the search input when not typing inside an input/textarea
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/') {
        const target = e.target as HTMLElement | null
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return
        }
        e.preventDefault()
        qRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [qRef])

  const handleJump = () => {
    if (jump.trim() === '') return
    const p = parseInt(jump, 10)
    if (Number.isNaN(p) || p < 0) {
      setJumpInvalid(true)
      return
    }
    setJumpInvalid(false)
    props.onJump(p)
  }

  const hasActiveFilters =
    filters.types.length > 0 || filters.dbs.length > 0 || filters.tables.length > 0 || txnIds.length > 0

  return (
    <div className="flex flex-col">
      {/* Tier 1: View mode, universal search, live toggle, jump to position */}
      <div className={`flex items-center gap-2 px-4 py-1.5 flex-nowrap ${styles.topBar}`}>
        <RadioGroupPrimitive
          aria-label="View mode"
          className={segmentedControlRootClassName}
          value={props.grouped ? 'grouped' : 'flat'}
          onValueChange={(val) => {
            const wantsGrouped = val === 'grouped'
            if (wantsGrouped !== props.grouped) props.onToggleGrouped()
          }}
        >
          <RadioPrimitive.Root
            className={segmentedControlItemVariants({ className: 'grow', size: 'sm', state: 'checked' })}
            value="flat"
            aria-label="Flat"
          >
            Flat
          </RadioPrimitive.Root>
          <RadioPrimitive.Root
            className={segmentedControlItemVariants({ className: 'grow', size: 'sm', state: 'checked' })}
            value="grouped"
            aria-label="Grouped"
          >
            Grouped
          </RadioPrimitive.Root>
        </RadioGroupPrimitive>

        <div className="relative flex-1 min-w-[160px] flex items-center">
          <IconSearch size={14} className="absolute left-2.5 text-muted-foreground pointer-events-none z-10" />
          <Input
            ref={qRef as React.Ref<HTMLInputElement>}
            aria-label="Search event summary"
            placeholder="Search summary..."
            value={filters.q}
            onChange={(e) => props.onChange({ ...filters, q: e.target.value })}
            size="sm"
            className="w-full pl-8"
          />
        </div>

        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          {props.onToggleLive && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <Switch
                      checked={props.live ?? false}
                      onCheckedChange={(checked) => props.onToggleLive?.(checked)}
                      aria-label="Follow new events as they are indexed"
                    />
                    <span className="flex items-center gap-1 text-xs text-muted-foreground select-none">
                      <span className={props.live ? styles.liveDotActive : styles.liveInactiveDot} />
                      <span>Live</span>
                    </span>
                  </div>
                }
              />
              <TooltipPopup>
                Tail new events incrementally as they arrive
              </TooltipPopup>
            </Tooltip>
          )}

          <div className="flex items-center gap-1 flex-nowrap">
            <Input
              aria-label="Jump to byte position"
              aria-invalid={jumpInvalid}
              aria-describedby={jumpInvalid ? 'jump-err' : undefined}
              placeholder="Jump to position..."
              value={jump}
              onChange={(e) => {
                setJump(e.target.value)
                if (jumpInvalid) setJumpInvalid(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJump()
              }}
              size="sm"
              className={`w-[140px] font-mono text-xs ${jumpInvalid ? 'border-destructive ring-destructive/20' : ''}`}
            />
            <Button
              type="button"
              onClick={handleJump}
              disabled={jump.trim() === ''}
              aria-label="Go to position"
              variant="outline"
              size="sm"
            >
              Go
            </Button>
          </div>
        </div>
      </div>

      {jumpInvalid && (
        <div
          id="jump-err"
          role="alert"
          aria-live="polite"
          className={`px-4 py-0.5 text-xs text-destructive ${styles.jumpErr}`}
        >
          enter a valid byte offset
        </div>
      )}

      {/* Tier 2: Filters row with Type, Database, Table multi-selects and active filter chips */}
      <div className={`flex items-center gap-2 px-4 py-1.5 flex-wrap ${styles.filterRow}`}>
        <FilterMultiSelect
          label="Type"
          summaryNoun="types"
          options={EVENT_TYPES}
          value={filters.types}
          onChange={(types) => props.onChange({ ...filters, types })}
          renderOption={(item) => <KindBadge typeName={item} size="xs" />}
        />

        <FilterMultiSelect
          label="Database"
          summaryNoun="dbs"
          options={props.dbOptions}
          value={filters.dbs}
          onChange={(dbs) => props.onChange({ ...filters, dbs })}
        />

        <FilterMultiSelect
          label="Table"
          summaryNoun="tables"
          options={props.tableOptions}
          value={filters.tables}
          onChange={(tables) => props.onChange({ ...filters, tables })}
        />


        {/* Active filter pills */}
        {(filters.types.length > 0 || filters.dbs.length > 0 || filters.tables.length > 0 || txnIds.length > 0) && (
          <span className="text-xs text-muted-foreground font-mono">
            active:
          </span>
        )}
        {filters.types.map((t) => (
          <FilterChip
            key={`type-${t}`}
            removeLabel={`Remove ${t} filter`}
            onRemove={() => {
              props.onChange({ ...filters, types: filters.types.filter((x) => x !== t) })
              setTimeout(() => {
                const next = document.querySelector('[data-slot="filter-chip"] button') as HTMLElement | null
                if (next) next.focus()
                else qRef.current?.focus()
              }, 0)
            }}
          >
            <KindBadge typeName={t} size="xs" />
          </FilterChip>
        ))}
        {filters.dbs.map((db) => (
          <FilterChip
            key={`db-${db}`}
            removeLabel={`Remove database ${db} filter`}
            onRemove={() => {
              props.onChange({ ...filters, dbs: filters.dbs.filter((x) => x !== db) })
              setTimeout(() => {
                const next = document.querySelector('[data-slot="filter-chip"] button') as HTMLElement | null
                if (next) next.focus()
                else qRef.current?.focus()
              }, 0)
            }}
          >
            db: {db}
          </FilterChip>
        ))}
        {filters.tables.map((tbl) => (
          <FilterChip
            key={`tbl-${tbl}`}
            removeLabel={`Remove table ${tbl} filter`}
            onRemove={() => {
              props.onChange({ ...filters, tables: filters.tables.filter((x) => x !== tbl) })
              setTimeout(() => {
                const next = document.querySelector('[data-slot="filter-chip"] button') as HTMLElement | null
                if (next) next.focus()
                else qRef.current?.focus()
              }, 0)
            }}
          >
            table: {tbl}
          </FilterChip>
        ))}

        {/* Active transaction badges */}
        {txnIds.map((id) => (
          <FilterChip
            key={`tx-${id}`}
            removeLabel={`Remove txn ${id} filter`}
            tone="brand"
            onRemove={() => {
              props.onRemoveTxn(id)
              setTimeout(() => {
                const next = document.querySelector('[data-slot="filter-chip"] button') as HTMLElement | null
                if (next) next.focus()
                else qRef.current?.focus()
              }, 0)
            }}
          >
            txn #{id}
          </FilterChip>
        ))}


        {/* Clear all filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              props.onChange({ ...filters, types: [], dbs: [], tables: [] })
              txnIds.forEach((id) => props.onRemoveTxn(id))
            }}
            className={styles.clearAllBtn}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
