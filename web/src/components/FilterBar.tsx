import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { MultiSelect, Pill } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import KindBadge from './KindBadge'
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
              size="xs"
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
        <MultiSelect
          aria-label="Type"
          placeholder={filters.types.length === 0 ? 'Type' : undefined}
          data={EVENT_TYPES}
          value={filters.types}
          onChange={(types) => props.onChange({ ...filters, types })}
          clearable
          searchable
          w={{ base: 140, sm: 180 }}
          size="xs"
          classNames={{ input: styles.multiInput }}
          renderOption={(item) => (
            <KindBadge typeName={String(item.option.value)} size="xs" />
          )}
          renderPill={({ option }) => {
            if (filters.types.length > 1) {
              const isFirst = filters.types[0] === String(option.value)
              if (isFirst) {
                return (
                  <Pill key="_count" className={styles.summaryPill}>
                    {filters.types.length} types
                  </Pill>
                )
              }
              return null
            }
            return (
              <Pill key={String(option.value)} className={styles.kindPill}>
                <KindBadge typeName={String(option.value)} size="xs" />
              </Pill>
            )
          }}
        />

        <MultiSelect
          aria-label="Database"
          placeholder={filters.dbs.length === 0 ? 'Database' : undefined}
          data={props.dbOptions}
          value={filters.dbs}
          onChange={(dbs) => props.onChange({ ...filters, dbs })}
          clearable
          searchable
          w={{ base: 130, sm: 160 }}
          size="xs"
          classNames={{ input: styles.multiInput }}
          renderPill={({ option }) => {
            if (filters.dbs.length > 1) {
              const isFirst = filters.dbs[0] === String(option.value)
              if (isFirst) {
                return (
                  <Pill key="_db_count" className={styles.summaryPill}>
                    {filters.dbs.length} dbs
                  </Pill>
                )
              }
              return null
            }
            return (
              <Pill key={String(option.value)} className={styles.summaryPill}>
                {String(option.value)}
              </Pill>
            )
          }}
        />

        <MultiSelect
          aria-label="Table"
          placeholder={filters.tables.length === 0 ? 'Table' : undefined}
          data={props.tableOptions}
          value={filters.tables}
          onChange={(tables) => props.onChange({ ...filters, tables })}
          clearable
          searchable
          w={{ base: 130, sm: 160 }}
          size="xs"
          classNames={{ input: styles.multiInput }}
          renderPill={({ option }) => {
            if (filters.tables.length > 1) {
              const isFirst = filters.tables[0] === String(option.value)
              if (isFirst) {
                return (
                  <Pill key="_tbl_count" className={styles.summaryPill}>
                    {filters.tables.length} tables
                  </Pill>
                )
              }
              return null
            }
            return (
              <Pill key={String(option.value)} className={styles.summaryPill}>
                {String(option.value)}
              </Pill>
            )
          }}
        />

        {/* Active filter pills */}
        {(filters.types.length > 0 || filters.dbs.length > 0 || filters.tables.length > 0) && (
          <span className="text-xs text-muted-foreground font-mono">
            active:
          </span>
        )}
        {filters.types.map((t) => (
          <Pill
            key={`type-${t}`}
            withRemoveButton
            onRemove={() => props.onChange({ ...filters, types: filters.types.filter((x) => x !== t) })}
            removeButtonProps={{ 'aria-label': `Remove ${t} filter` }}
            className={styles.kindPill}
          >
            <KindBadge typeName={t} size="xs" />
          </Pill>
        ))}
        {filters.dbs.map((db) => (
          <Pill
            key={`db-${db}`}
            withRemoveButton
            onRemove={() => props.onChange({ ...filters, dbs: filters.dbs.filter((x) => x !== db) })}
            removeButtonProps={{ 'aria-label': `Remove database ${db} filter` }}
            className={styles.summaryPill}
          >
            db: {db}
          </Pill>
        ))}
        {filters.tables.map((tbl) => (
          <Pill
            key={`tbl-${tbl}`}
            withRemoveButton
            onRemove={() => props.onChange({ ...filters, tables: filters.tables.filter((x) => x !== tbl) })}
            removeButtonProps={{ 'aria-label': `Remove table ${tbl} filter` }}
            className={styles.summaryPill}
          >
            table: {tbl}
          </Pill>
        ))}

        {/* Active transaction badges */}
        {txnIds.map((id) => (
          <Pill
            key={`tx-${id}`}
            withRemoveButton
            onRemove={() => props.onRemoveTxn(id)}
            removeButtonProps={{ 'aria-label': `Remove txn ${id} filter` }}
            className={styles.txnPill}
          >
            txn #{id}
          </Pill>
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
