import { useRef, useState } from 'react'
import type React from 'react'
import { Group, MultiSelect, TextInput, Button, SegmentedControl, Pill, Stack, Box } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'

export interface Filters {
  types: string[]
  dbs: string[]
  tables: string[]
  q: string
  from_pos: number
  to_pos: number
}

export const emptyFilters: Filters = { types: [], dbs: [], tables: [], q: '', from_pos: 0, to_pos: 0 }

// Shared MultiSelect styling: bound the pills area to ~2 rows and scroll inside
// instead of letting the field balloon and drag the toolbar layout. The pills
// wrap; once they exceed the cap the field scrolls. Keeps the dense toolbar a
// stable height no matter how many filters are active.
const MULTISELECT_STYLES = {
  input: { maxHeight: 60, overflowY: 'auto' as const, alignContent: 'flex-start' as const },
} as const

const EVENT_TYPES = [
  'QUERY',
  'TABLE_MAP',
  'WRITE_ROWS_V2',
  'UPDATE_ROWS_V2',
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
}

export default function FilterBar(props: FilterBarProps) {
  const { filters, txnIds } = props
  const [jump, setJump] = useState('')
  const [jumpInvalid, setJumpInvalid] = useState(false)
  const internalRef = useRef<HTMLInputElement>(null)
  const qRef = props.searchRef ?? internalRef

  // `/` key focuses the search input
  useHotkeys([['/', () => qRef.current?.focus()]])

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

  return (
    <Stack gap={0}>
      <Group gap="xs" px="sm" py={6} align="flex-start" wrap="wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <MultiSelect
          aria-label="type"
          placeholder="type"
          data={EVENT_TYPES}
          value={filters.types}
          onChange={(types) => props.onChange({ ...filters, types })}
          clearable
          searchable
          w={200}
          styles={MULTISELECT_STYLES}
        />
        <MultiSelect
          aria-label="db"
          placeholder="db"
          data={props.dbOptions}
          value={filters.dbs}
          onChange={(dbs) => props.onChange({ ...filters, dbs })}
          clearable
          searchable
          w={180}
          styles={MULTISELECT_STYLES}
        />
        <MultiSelect
          aria-label="table"
          placeholder="table"
          data={props.tableOptions}
          value={filters.tables}
          onChange={(tables) => props.onChange({ ...filters, tables })}
          clearable
          searchable
          w={180}
          styles={MULTISELECT_STYLES}
        />
        <TextInput
          ref={qRef as React.RefObject<HTMLInputElement>}
          aria-label="Search event summary"
          placeholder="search summary…"
          value={filters.q}
          onChange={(e) => props.onChange({ ...filters, q: e.target.value })}
          leftSection={<IconSearch size={14} />}
          maw={200}
        />

        <SegmentedControl
          value={props.grouped ? 'grouped' : 'flat'}
          onChange={(val) => {
            const wantsGrouped = val === 'grouped'
            if (wantsGrouped !== props.grouped) props.onToggleGrouped()
          }}
          data={[
            { label: 'flat', value: 'flat' },
            { label: 'grouped', value: 'grouped' },
          ]}
          size="xs"
        />

        <Group gap={4} ml="auto" align="flex-start">
          <TextInput
            aria-label="Jump to byte position"
            aria-invalid={jumpInvalid}
            aria-describedby={jumpInvalid ? 'jump-err' : undefined}
            placeholder="jump to position…"
            value={jump}
            error={jumpInvalid}
            onChange={(e) => {
              setJump(e.target.value)
              if (jumpInvalid) setJumpInvalid(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJump()
            }}
            w={160}
          />
          <Button
            onClick={handleJump}
            disabled={jump.trim() === ''}
            aria-label="Go to position"
            variant="default"
            size="xs"
          >
            Go
          </Button>
          {jumpInvalid && (
            <Box
              id="jump-err"
              role="alert"
              aria-live="polite"
              style={{ fontSize: 'var(--fs-sm)', color: 'var(--mantine-color-red-6)', alignSelf: 'center' }}
            >
              enter a valid byte offset
            </Box>
          )}
        </Group>
      </Group>

      {txnIds.length > 0 && (
        <Group gap={6} px="sm" py={6} wrap="wrap">
          {txnIds.map((id) => (
            <Pill
              key={`tx-${id}`}
              withRemoveButton
              onRemove={() => props.onRemoveTxn(id)}
              removeButtonProps={{ 'aria-label': `Remove txn ${id} filter` }}
              styles={{
                root: {
                  background: 'var(--surface-active)',
                  color: 'var(--accent)',
                  fontFamily: 'var(--mono)',
                  fontSize: 'var(--fs-sm)',
                },
              }}
            >
              txn #{id}
            </Pill>
          ))}
        </Group>
      )}
    </Stack>
  )
}
