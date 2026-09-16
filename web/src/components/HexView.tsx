import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import { api } from '../lib/api'
import { Check, Cross } from './icons'
import type { HexResult } from '../lib/types'

const HEX_WINDOW = 4096 // must match hexsvc.WindowBytes

interface Props {
  fileId: number
  pos: number
}

/**
 * HexView - paged hex dump for a single binlog event.
 *
 * Loads bytes in 4 KiB windows (server-side HexResult) and renders them as
 * offset + 16 × hex + ascii rows. Tooltips expose field annotations.
 * A prev/next pager navigates large events.
 */
export default function HexView({ fileId, pos }: Props) {
  const [hex, setHex] = useState<HexResult | null>(null)
  const [winStart, setWinStart] = useState(0)
  const [err, setErr] = useState('')

  // Reset to the first window when the selected event changes.
  useEffect(() => {
    setWinStart(0)
  }, [fileId, pos])

  const fetchHex = () => {
    setHex(null)
    setErr('')
    api
      .hex(fileId, pos, winStart, HEX_WINDOW)
      .then((h) => setHex(h))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => {
    let cancelled = false
    setHex(null)
    setErr('')
    api
      .hex(fileId, pos, winStart, HEX_WINDOW)
      .then((h) => {
        if (!cancelled) setHex(h)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [fileId, pos, winStart])

  if (err)
    return (
      <Alert variant="error" role="alert" className="flex items-center justify-between">
        <span>{err}</span>
        <Button size="xs" variant="outline" onClick={fetchHex}>
          retry
        </Button>
      </Alert>
    )
  if (!hex) return <div className="mb-3 flex flex-wrap items-center gap-2">loading&hellip;</div>

  const bytes = atob(hex.bytes)
  const base = hex.win_start
  const annFor = (abs: number) => hex.annotations.find((a) => abs >= a.start && abs < a.end)
  const lines = []
  for (let off = 0; off < bytes.length; off += 16) {
    const slice = Array.from({ length: Math.min(16, bytes.length - off) }, (_, j) => off + j)
    lines.push(
      <div key={off}>
        <span className="mr-3">{(base + off).toString(16).padStart(8, '0')}</span>
        {slice.map((i) => {
          const a = annFor(base + i)
          const byteStr = bytes.charCodeAt(i).toString(16).padStart(2, '0') + ' '
          return (
            <Tooltip key={i} disabled={!a}>
              <TooltipTrigger render={<span aria-label={a ? `${a.field}: ${a.value}` : undefined}>{byteStr}</span>} />
              {a && (
                <TooltipPopup side="top" align="center">
                  {`${a.field}: ${a.value}`}
                </TooltipPopup>
              )}
            </Tooltip>
          )
        })}
        <span className="ml-3">
          {slice
            .map((i) => {
              const c = bytes.charCodeAt(i)
              return c >= 32 && c < 127 ? bytes[i] : '.'
            })
            .join('')}
        </span>
      </div>,
    )
  }

  const winEnd = base + bytes.length
  const hasPrev = base > 0
  const hasMore = winEnd < hex.total

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {hex.crc_checked && (
          <Badge variant={hex.crc_valid ? 'secondary' : 'warning'}>
            CRC32
            {hex.crc_valid ? <Check size={14} /> : <Cross size={14} />}
            {hex.crc_valid ? 'valid' : 'MISMATCH'}
          </Badge>
        )}
        {' · '}bytes {base.toLocaleString()}-{winEnd.toLocaleString()} of {hex.total.toLocaleString()}
        {(hasPrev || hasMore) && (
          <span className="ml-3 inline-flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              disabled={!hasPrev}
              onClick={() => setWinStart(Math.max(0, base - HEX_WINDOW))}
            >
              ‹ prev
            </Button>
            <Button variant="ghost" size="xs" disabled={!hasMore} onClick={() => setWinStart(base + HEX_WINDOW)}>
              next ›
            </Button>
          </span>
        )}
      </div>
      <div className="overflow-x-auto font-mono [&>div]:whitespace-nowrap">{lines}</div>
    </>
  )
}
