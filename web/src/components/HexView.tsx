import { useEffect, useState } from 'react'
import { Alert, Tooltip } from '@mantine/core'
import { api } from '../lib/api'
import { Check, Cross } from './icons'
import type { HexResult } from '../lib/types'
import styles from './HexView.module.css'

const HEX_WINDOW = 4096 // must match hexsvc.WindowBytes

/** Maps annotation field names to their CSS module class. */
const ANN_CLASS: Record<string, string> = {
  timestamp: styles.hlTs,
  type_code: styles.hlTy,
  server_id: styles.hlSid,
  event_size: styles.hlSz,
  next_pos: styles.hlNpos,
  flags: styles.hlFlags,
  crc32: styles.hlCrc,
}

interface Props {
  fileId: number
  pos: number
}

/**
 * HexView — paged hex dump for a single binlog event.
 *
 * Loads bytes in 4 KiB windows (server-side HexResult) and renders them as
 * offset + 16 × hex + ascii rows. Field annotations are shown as colored
 * spans with a tooltip on hover. A prev/next pager navigates large events.
 */
export default function HexView({ fileId, pos }: Props) {
  const [hex, setHex] = useState<HexResult | null>(null)
  const [winStart, setWinStart] = useState(0)
  const [err, setErr] = useState('')

  // Reset to the first window when the selected event changes.
  useEffect(() => {
    setWinStart(0)
  }, [fileId, pos])

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
      <Alert color="red" role="alert">
        {err}
      </Alert>
    )
  if (!hex) return <div className={styles.rowNav}>loading&hellip;</div>

  const bytes = atob(hex.bytes)
  const base = hex.win_start
  const annFor = (abs: number) => hex.annotations.find((a) => abs >= a.start && abs < a.end)
  const lines = []
  for (let off = 0; off < bytes.length; off += 16) {
    const slice = Array.from({ length: Math.min(16, bytes.length - off) }, (_, j) => off + j)
    lines.push(
      <div key={off}>
        <span className={styles.off}>{(base + off).toString(16).padStart(8, '0')}</span>
        {slice.map((i) => {
          const a = annFor(base + i)
          const cls = a ? (ANN_CLASS[a.field] ?? '') : ''
          return (
            <Tooltip key={i} label={a ? `${a.field}: ${a.value}` : ''} openDelay={150} withinPortal disabled={!a}>
              <span className={cls} aria-label={a ? `${a.field}: ${a.value}` : undefined}>
                {bytes.charCodeAt(i).toString(16).padStart(2, '0')}{' '}
              </span>
            </Tooltip>
          )
        })}
        <span className={styles.ascii}>
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
      <div className={styles.rowNav}>
        {hex.crc_checked && (
          <span
            className={hex.crc_valid ? styles.ok : styles.warn}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            CRC32
            {hex.crc_valid ? <Check size={14} /> : <Cross size={14} />}
            {hex.crc_valid ? 'valid' : 'MISMATCH'}
          </span>
        )}
        {' · '}bytes {base.toLocaleString()}–{winEnd.toLocaleString()} of {hex.total.toLocaleString()}
        {(hasPrev || hasMore) && (
          <span className={styles.hexPager}>
            <button disabled={!hasPrev} onClick={() => setWinStart(Math.max(0, base - HEX_WINDOW))}>
              ‹ prev
            </button>
            <button disabled={!hasMore} onClick={() => setWinStart(base + HEX_WINDOW)}>
              next ›
            </button>
          </span>
        )}
      </div>
      <div className={styles.hex}>{lines}</div>
    </>
  )
}
