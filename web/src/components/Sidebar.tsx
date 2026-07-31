import { useEffect, useState } from 'react'
import { NavLink, Stack, Text, Badge, Box, Tooltip, ActionIcon, Group } from '@mantine/core'
import {
  IconDatabase,
  IconSettings,
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconTriangleInverted,
} from '@tabler/icons-react'
import { severityColor } from './icons'
import { api } from '../lib/api'
import type { BinlogFile, StreamStatus, TypeCount } from '../lib/types'
import styles from './Sidebar.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(n: number): string {
  if (n > 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n > 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KB'
  return n + ' B'
}

const ROW_TYPES = new Set([
  'WRITE_ROWS_V2',
  'WRITE_ROWS_V1',
  'UPDATE_ROWS_V2',
  'UPDATE_ROWS_V1',
  'DELETE_ROWS_V2',
  'DELETE_ROWS_V1',
])

// ---------------------------------------------------------------------------
// StateDot
// ---------------------------------------------------------------------------

/** Coloured dot indicating the file's indexing state. Pulse animation on
 *  "indexing" is handled by Sidebar.module.css so it never bleeds into global
 *  CSS. Reduced-motion preference disables the animation. */
function StateDot({ state }: { state: string }) {
  // Build the class string by composing the base + state class from the module.
  const cls = [styles.st, styles[state as keyof typeof styles]].filter(Boolean).join(' ')
  return <span className={cls} aria-label={state} />
}

// ---------------------------------------------------------------------------
// TypeBreakdown
// ---------------------------------------------------------------------------

/** Per-type event count panel shown under the active file's NavLink. */
function TypeBreakdown({ file }: { file: BinlogFile }) {
  const [counts, setCounts] = useState<TypeCount[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    api
      .typeCounts(file.id)
      .then((c) => {
        if (live) {
          setCounts(c)
          setErr('')
        }
      })
      .catch((e: unknown) => {
        if (live) setErr(e instanceof Error ? e.message : String(e))
      })
    return () => {
      live = false
    }
  }, [file.id, file.state])

  if (err)
    return (
      <Text size="xs" c="dimmed" pl={24}>
        counts unavailable
      </Text>
    )
  if (counts.length === 0) {
    return (
      <Text size="xs" c="dimmed" pl={24}>
        {file.state === 'ready' ? 'no events' : 'indexing…'}
      </Text>
    )
  }
  return (
    <Stack gap={1} pl={24} pr={8} pb={6} style={{ borderLeft: '2px solid var(--border)', marginLeft: 14 }}>
      {counts.map((c) => (
        <Box key={c.type_name}>
          <Group justify="space-between" gap={8} wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {c.type_name}
            </Text>
            <Text size="xs" style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {c.count.toLocaleString()}
            </Text>
          </Group>
          {ROW_TYPES.has(c.type_name) && c.rows_total > 0 && (
            <Text size="xs" c="dimmed">
              {c.rows_total.toLocaleString()} rows
            </Text>
          )}
        </Box>
      ))}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// StreamChip
// ---------------------------------------------------------------------------

/** Badge showing current remote-streaming state. Hidden when disabled. */
function StreamChip({ status }: { status: StreamStatus }) {
  if (status.state === 'disabled') return null
  const tooltip = status.error ?? `${status.file}:${status.pos}`
  const colorMap: Record<string, string> = {
    streaming: 'green',
    reconnecting: 'orange',
    connecting: 'gray',
    error: 'red',
  }
  const color = colorMap[status.state] ?? 'gray'
  return (
    <Tooltip label={tooltip} withArrow>
      <Badge
        size="xs"
        color={color}
        variant="light"
        radius="xl"
        mx={14}
        mb={6}
        role="status"
        aria-label={`Stream: ${status.state}`}
        style={{ fontFamily: 'var(--mono)', cursor: 'default', display: 'block', textTransform: 'none' }}
      >
        {status.state}
      </Badge>
    </Tooltip>
  )
}

// ---------------------------------------------------------------------------
// SidebarProps
// ---------------------------------------------------------------------------

export interface SidebarProps {
  files: BinlogFile[]
  activeId: number
  collapsed: boolean
  onToggle: () => void
  onSelect: (id: number) => void
  onSettings: () => void
  onArchitecture: () => void
  streamStatus?: StreamStatus
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar({
  files,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onSettings,
  onArchitecture,
  streamStatus,
}: SidebarProps) {
  // -------------------------------------------------------------------------
  // Collapsed icon rail
  // -------------------------------------------------------------------------
  if (collapsed) {
    return (
      <Stack gap={2} align="center" py={12} h="100%">
        <Tooltip label="Expand sidebar" position="right" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onToggle}
            aria-label="Expand sidebar"
            aria-expanded={false}
          >
            <IconLayoutSidebarRight size={16} />
          </ActionIcon>
        </Tooltip>

        {streamStatus && <StreamChip status={streamStatus} />}

        <Stack gap={2} align="center" flex={1} style={{ width: '100%' }}>
          {files.map((f) => {
            const fileName = f.path.split('/').pop() ?? f.path
            const tipText = `${fileName} — ${f.state}${f.anomaly_count ? ` · ${f.anomaly_count} anomalies` : ''}${f.remote ? ' · remote' : ''}`
            return (
              <Tooltip key={f.id} label={tipText} position="right" withArrow>
                <Box
                  style={{
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    cursor: 'pointer',
                    position: 'relative',
                    background: f.id === activeId ? 'var(--surface-active)' : 'transparent',
                    boxShadow: f.id === activeId ? 'inset 2px 0 0 var(--accent)' : 'none',
                  }}
                  onClick={() => onSelect(f.id)}
                  aria-label={tipText}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(f.id)
                    }
                  }}
                >
                  <StateDot state={f.state} />
                  {!!f.anomaly_count && (
                    <IconTriangleInverted
                      size={8}
                      style={{ position: 'absolute', top: 2, right: 2, color: 'var(--orange)' }}
                      aria-hidden="true"
                    />
                  )}
                </Box>
              </Tooltip>
            )
          })}
        </Stack>

        <Tooltip label="Architecture" position="right" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onArchitecture}
            aria-label="Open architecture overview"
          >
            <IconDatabase size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Settings" position="right" withArrow>
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={onSettings} aria-label="Open settings">
            <IconSettings size={16} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    )
  }

  // -------------------------------------------------------------------------
  // Expanded sidebar
  // -------------------------------------------------------------------------
  return (
    <Stack gap={0} h="100%">
      {/* Header row: "Files" label + collapse toggle */}
      <Group justify="space-between" px={14} pb={8} pt={12} style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '1.2px', fontWeight: 600 }}>
          Files
        </Text>
        <Tooltip label="Collapse sidebar" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            aria-expanded={true}
          >
            <IconLayoutSidebar size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {streamStatus && <StreamChip status={streamStatus} />}

      {/* File list */}
      <Stack gap={0} flex={1} style={{ overflowY: 'auto', minHeight: 0 }}>
        {files.map((f) => {
          const fileName = f.path.split('/').pop() ?? f.path
          const tipText = f.error ? `${fileName} — error: ${f.error}` : f.path
          const isActive = f.id === activeId

          const rightSection = (
            <Group gap={4} wrap="nowrap">
              {f.state !== 'ready' && (
                <Text
                  size="xs"
                  c={f.state === 'error' ? 'red' : 'dimmed'}
                  style={{ textTransform: 'uppercase', flexShrink: 0 }}
                >
                  {f.state}
                </Text>
              )}
              {!!f.anomaly_count && (
                <Badge
                  size="xs"
                  color={severityColor(f.anomaly_max_severity ?? 'low')}
                  variant="light"
                  radius="xl"
                  style={{ flexShrink: 0 }}
                >
                  {f.anomaly_count}
                </Badge>
              )}
              {f.remote && (
                <Badge size="xs" color="accent" variant="light" radius="xl" style={{ flexShrink: 0 }}>
                  remote
                </Badge>
              )}
            </Group>
          )

          return (
            <Box key={f.id}>
              <Tooltip label={tipText} withArrow position="right" openDelay={600}>
                <NavLink
                  label={
                    <Text
                      size="sm"
                      ff="monospace"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {fileName}
                    </Text>
                  }
                  description={
                    <Text size="xs" c="dimmed" ff="monospace">
                      {fmtSize(f.size)}
                    </Text>
                  }
                  leftSection={<StateDot state={f.state} />}
                  rightSection={rightSection}
                  active={isActive}
                  onClick={() => onSelect(f.id)}
                  aria-label={f.error ? `${fileName} — error: ${f.error}` : `${fileName} — ${f.state}`}
                  styles={{
                    root: {
                      paddingLeft: 14,
                      paddingRight: 8,
                      borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    },
                  }}
                />
              </Tooltip>
              {isActive && f.magic_ok && <TypeBreakdown file={f} />}
            </Box>
          )
        })}
      </Stack>

      {/* Bottom nav links */}
      <Box style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <NavLink
          label="Architecture"
          leftSection={<IconDatabase size={14} />}
          onClick={onArchitecture}
          aria-label="Open architecture overview"
          styles={{ root: { padding: '10px 14px' } }}
        />
        <NavLink
          label="Settings"
          leftSection={<IconSettings size={14} />}
          onClick={onSettings}
          aria-label="Open settings"
          styles={{ root: { padding: '10px 14px' } }}
        />
      </Box>
    </Stack>
  )
}
