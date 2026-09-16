import { useState } from 'react'
import type React from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '@/components/ui/table'
import { Tooltip, TooltipTrigger, TooltipPopup } from '@/components/ui/tooltip'
import type { DiffResult, RowImage } from '../lib/types'

// ── Shared primitives ─────────────────────────────────────────────────────

/** Small info bar above a grid (row count, page nav, nav labels). */
export function RowNav({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>
}

// ── RowImages ─────────────────────────────────────────────────────────────

const ROWS_PAGE = 50

/** Paged list of before/after row images for DML events. */
export function RowImages({ rows, colTypes }: { rows: RowImage[]; colTypes: string[] }) {
  const [page, setPage] = useState(0)
  const visible = rows.slice(page * ROWS_PAGE, (page + 1) * ROWS_PAGE)
  const pages = Math.ceil(rows.length / ROWS_PAGE)
  return (
    <>
      <RowNav>
        {rows.length} row image(s)
        {pages > 1 && (
          <>
            {' · '}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Previous row images"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              &lsaquo;
            </Button>{' '}
            page {page + 1}/{pages}{' '}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Next row images"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
            >
              &rsaquo;
            </Button>
          </>
        )}
      </RowNav>
      {visible.map((r, i) => {
        const abs = page * ROWS_PAGE + i
        return <RowGrid key={abs} row={r} colTypes={colTypes} index={abs} />
      })}
    </>
  )
}

function RowGrid({ row, colTypes, index }: { row: RowImage; colTypes: string[]; index: number }) {
  const n = Math.max(row.before?.length ?? 0, row.after?.length ?? 0)
  return (
    <Table className="my-4">
      <TableCaption>row {index + 1}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>col</TableHead>
          <TableHead>before</TableHead>
          <TableHead>after</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: n }, (_, i) => {
          const b = row.before?.[i]
          const a = row.after?.[i]
          const changed = row.before && row.after && JSON.stringify(b) !== JSON.stringify(a)
          const added = !row.before && Boolean(row.after)
          return (
            <TableRow key={i}>
              <TableCell>
                @{i + 1} {colTypes[i] ?? ''}
              </TableCell>
              <TableCell>{row.before ? fmtVal(b) : '-'}</TableCell>
              <TableCell data-change={added ? 'added' : changed ? 'modified' : undefined}>
                {added || changed ? (
                  <Badge variant={added ? 'success' : 'warning'}>{fmtVal(a)}</Badge>
                ) : row.after ? (
                  fmtVal(a)
                ) : (
                  '-'
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ── KV ───────────────────────────────────────────────────────────────────

/** Key/value table - structural events (GTID, XID, TABLE_MAP…). */
export function KV({ pairs, note }: { pairs: [string, string][]; note?: string }) {
  return (
    <Table>
      {note && <TableCaption>{note}</TableCaption>}
      <TableHeader>
        <TableRow>
          <TableHead>field</TableHead>
          <TableHead>value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pairs.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell>{k}</TableCell>
            <TableCell>{v || '-'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ── DiffView ─────────────────────────────────────────────────────────────

interface DiffViewProps {
  diff: DiffResult | null
}

/**
 * DiffView - multi-adapter comparison pane.
 *
 * Shows a diff grid with per-field agree/disagree/partial/disagree-hard
 * styling, plus per-adapter error banners and timing info in the nav bar.
 * Mirrors the oracle Drawer's DiffTab exactly.
 */
export default function DiffView({ diff }: DiffViewProps) {
  if (!diff) return <div>running diff adapters&hellip;</div>

  // Nil Go slices/maps marshal to JSON null - default before use.
  const adapters = diff.adapters ?? []
  const fields = diff.fields ?? []
  const errors = diff.errors ?? {}
  const timing = diff.timing_ms ?? {}
  const errCount = Object.keys(errors).length

  return (
    <>
      <RowNav>
        {errCount > 0 ? (
          <Badge variant="error">
            {errCount} adapter error{errCount > 1 ? 's' : ''}
          </Badge>
        ) : (diff.disagreement_count ?? 0) > 0 ? (
          <Badge variant="warning">{diff.disagreement_count} disagreement(s)</Badge>
        ) : (
          <Badge variant="secondary" data-status="agreement">
            ✓ all adapters agree
          </Badge>
        )}
        {' · '}
        {adapters.map((a) => `${a}: ${timing[a] ?? '?'}ms`).join(' · ')}
      </RowNav>
      {Object.entries(errors).map(([a, e]) => (
        <Alert key={a} variant="error" role="alert" className="mb-2">
          {a}: {e}
        </Alert>
      ))}
      {fields.length === 0 ? (
        <div>no comparable fields for this event type</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>status</TableHead>
              <TableHead>field</TableHead>
              {adapters.map((a) => (
                <TableHead key={a}>{a}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((f) => (
              <DiffRow key={f.name} field={f} adapters={adapters} />
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}

// ── DiffRow ───────────────────────────────────────────────────────────────

/** The oracle adapter whose value is authoritative for "changed" emphasis. */
const ORACLE = 'gomysql'

function DiffRow({ field, adapters }: { field: DiffResult['fields'][0]; adapters: string[] }) {
  const isAgree = field.partial || field.agree
  const status = field.agree ? 'agreement' : field.partial ? 'partial' : 'disagreement'
  const isSQL = field.name === 'decoded.sql'
  const oracleVal = field.values[ORACLE]
  return (
    <TableRow>
      <TableCell>
        <Badge variant={isAgree ? 'secondary' : 'error'} data-status={status} aria-label={status}>
          {isAgree ? '✓' : '✗'}
        </Badge>
      </TableCell>
      <Tooltip disabled={!field.partial}>
        <TooltipTrigger render={<TableCell>{field.name}</TableCell>} />
        <TooltipPopup side="top" align="center">
          only some adapters decoded this field
        </TooltipPopup>
      </Tooltip>
      {adapters.map((a) => {
        const raw = field.values[a] ?? '-'
        const isChanged = !isAgree && oracleVal !== undefined && a !== ORACLE && raw !== oracleVal
        const value = isSQL ? <pre>{beautifySQL(raw)}</pre> : raw
        return (
          <TableCell key={a} data-change={isChanged ? 'modified' : undefined}>
            {isChanged ? (
              isSQL ? (
                <>
                  <Badge variant="error">Changed</Badge>
                  {value}
                </>
              ) : (
                <Badge variant="error">{value}</Badge>
              )
            ) : (
              value
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )
}

// ── beautifySQL ───────────────────────────────────────────────────────────

/**
 * Puts a CREATE/ALTER column list one definition per line so the two
 * adapters' SQL can be compared line-for-line. Non-DDL passes through.
 */
function beautifySQL(sql: string): string {
  const s = sql.trim()
  if (!/^(CREATE|ALTER)\s/i.test(s) || !s.includes('(')) return s
  let depth = 0
  let out = ''
  for (const c of s) {
    if (c === '(') {
      depth++
      out += depth === 1 ? ' (\n  ' : c
    } else if (c === ')') {
      depth--
      out += depth === 0 ? '\n)' : c
    } else if (c === ',' && depth === 1) {
      out += ',\n  '
    } else {
      out += c
    }
  }
  return out
}
