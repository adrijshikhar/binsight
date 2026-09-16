import { IconLayoutSidebar, IconLayoutSidebarRight } from '@tabler/icons-react'
import { FileIcon, FileWarningIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import type { BinlogFile, StreamStatus } from '../lib/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(n: number): string {
  if (n > 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n > 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KB'
  return n + ' B'
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
            <Badge size="sm" variant={variant} role="status" aria-label={`Stream: ${status.state}`}>
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
                    <Button
                      variant={f.id === activeId ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => onSelect(f.id)}
                      aria-label={tipText}
                      aria-pressed={f.id === activeId}
                    >
                      {f.anomaly_count ? <FileWarningIcon /> : <FileIcon />}
                    </Button>
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
        <span>Files</span>
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
              {!!f.anomaly_count && (
                <Badge size="sm" variant="destructive" className="shrink-0">
                  {f.anomaly_count}
                </Badge>
              )}
              {f.remote && (
                <Badge size="sm" variant="secondary" className="shrink-0">
                  remote
                </Badge>
              )}
            </div>
          )

          return (
            <Tooltip key={f.id}>
              <TooltipTrigger
                render={
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    aria-pressed={isActive}
                    onClick={() => onSelect(f.id)}
                    aria-label={f.error ? `${fileName} - error: ${f.error}` : `${fileName} - ${f.state}`}
                    className="h-auto w-full justify-between text-left sm:h-auto"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{fileName}</span>
                        <span className="flex items-center gap-2">
                          <span>{fmtSize(f.size)}</span>
                          <Badge
                            size="sm"
                            variant={
                              f.state === 'error'
                                ? 'error'
                                : f.state === 'indexing'
                                  ? 'warning'
                                  : f.state === 'growing'
                                    ? 'info'
                                    : 'secondary'
                            }
                          >
                            {f.state}
                          </Badge>
                        </span>
                      </div>
                    </div>
                    {rightSection}
                  </Button>
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
