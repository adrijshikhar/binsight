import { useEffect, useState } from 'react'
import {
  IconLayoutSidebar,
  IconLayoutSidebarRight,
  IconTriangleInverted,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
} from '@/components/ui/tooltip'
import type { BinlogFile, StreamStatus } from '../lib/types'
import { cn } from '@/lib/utils'
import styles from './Sidebar.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(n: number): string {
  if (n > 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n > 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KB'
  return n + ' B'
}

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
// StreamChip
// ---------------------------------------------------------------------------

/** Badge showing current remote-streaming state. Hidden when disabled. */
function StreamChip({ status }: { status: StreamStatus }) {
  if (status.state === 'disabled') return null
  const tooltip = `Stream: ${status.state} (${status.file || 'no file'}:${status.pos})${status.skipped_events ? ` · ${status.skipped_events} skipped` : ''}`
  const variantMap: Record<string, 'secondary' | 'warning' | 'destructive' | 'outline'> = {
    streaming: 'secondary',
    reconnecting: 'warning',
    connecting: 'outline',
    error: 'destructive',
  }
  const variant = variantMap[status.state] ?? 'outline'
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex mx-3.5 mb-1.5">
            <Badge
              size="xs"
              variant={variant}
              role="status"
              aria-label={`Stream: ${status.state}`}
              className={styles.streamChip}
            >
              {status.state}
            </Badge>
          </span>
        }
      />
      <TooltipPopup>{tooltip}</TooltipPopup>
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
  onSettings?: () => void
  onArchitecture?: () => void
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
      <div className="flex flex-col items-center py-3 h-full gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onToggle}
                aria-label="Expand sidebar"
                aria-expanded={false}
              >
                <IconLayoutSidebarRight size={16} />
              </Button>
            }
          />
          <TooltipPopup side="right">Expand sidebar</TooltipPopup>
        </Tooltip>

        {streamStatus && <StreamChip status={streamStatus} />}

        <div className="flex flex-col items-center flex-1 w-full gap-0.5">
          {files.map((f) => {
            const fileName = f.path.split('/').pop() ?? f.path
            const tipText = `${fileName} - ${f.state}${f.anomaly_count ? ` · ${f.anomaly_count} anomalies` : ''}${f.remote ? ' · remote' : ''}`
            return (
              <Tooltip key={f.id}>
                <TooltipTrigger
                  render={
                    <div
                      className={`${styles.collapsedItem} ${f.id === activeId ? styles.collapsedItemActive : ''}`}
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
                          className={styles.collapsedAnomalyIcon}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  }
                />
                <TooltipPopup side="right">{tipText}</TooltipPopup>
              </Tooltip>
            )
          })}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Expanded sidebar
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header row: "Files" label + collapse toggle */}
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3 shrink-0">
        <span className={cn('text-xs text-muted-foreground', styles.headerLabel)}>
          Files
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onToggle}
                aria-label="Collapse sidebar"
                aria-expanded={true}
              >
                <IconLayoutSidebar size={16} />
              </Button>
            }
          />
          <TooltipPopup>Collapse sidebar</TooltipPopup>
        </Tooltip>
      </div>

      {streamStatus && <StreamChip status={streamStatus} />}

      {/* File list */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        {files.map((f) => {
          const fileName = f.path.split('/').pop() ?? f.path
          const tipText = f.error ? `${fileName} - error: ${f.error}` : f.path
          const isActive = f.id === activeId

          const rightSection = (
            <div className="flex items-center gap-1 shrink-0">
              {f.state !== 'ready' && (
                <span
                  className={cn(
                    'text-xs uppercase shrink-0',
                    f.state === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {f.state}
                </span>
              )}
              {!!f.anomaly_count && (
                <Badge
                  size="xs"
                  variant="destructive"
                  className={cn('shrink-0', styles.anomalyBadge)}
                >
                  {f.anomaly_count}
                </Badge>
              )}
              {f.remote && (
                <Badge size="xs" variant="secondary" className="shrink-0">
                  remote
                </Badge>
              )}
            </div>
          )

          return (
            <Tooltip key={f.id}>
              <TooltipTrigger
                render={
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(f.id)
                      }
                    }}
                    aria-label={f.error ? `${fileName} - error: ${f.error}` : `${fileName} - ${f.state}`}
                    className={cn(
                      styles.navLinkRoot,
                      isActive && styles.navLinkRootActive,
                      'w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left transition-colors cursor-pointer border-l-2',
                      isActive ? 'border-primary bg-accent/40' : 'border-transparent hover:bg-accent/20'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StateDot state={f.state} />
                      <div className="flex flex-col min-w-0">
                        <span className={cn('text-sm font-mono truncate', styles.navLinkLabel)}>
                          {fileName}
                        </span>
                        <span className={cn('text-xs font-mono text-muted-foreground', styles.navLinkDesc)}>
                          {fmtSize(f.size)}
                        </span>
                      </div>
                    </div>
                    {rightSection}
                  </div>
                }
              />
              <TooltipPopup side="right">{tipText}</TooltipPopup>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
