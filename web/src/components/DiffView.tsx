import { Fragment, useState } from 'react'
import type React from 'react'
import { Alert, Tooltip } from '@mantine/core'
import type { DiffResult, RowImage } from '../lib/types'
import styles from './DiffView.module.css'

// ── Shared primitives ─────────────────────────────────────────────────────

/** Small info bar above a grid (row count, page nav, nav labels). */
export function RowNav({ children }: { children: React.ReactNode }) {
  return <div className={styles.rowNav}>{children}</div>
}

/** Outer wrapper that adds vertical rhythm between multiple row grids. */
export function BaWrap({ children }: { children: React.ReactNode }) {
  return <div className={styles.baWrap}>{children}</div>
}

/** Uppercase label above a row grid (e.g. "row 1", "column types"). */
export function RowLabel({ children }: { children: React.ReactNode }) {
  return <div className={styles.rowLabel}>{children}</div>
}

interface BaGridProps {
  children: React.ReactNode
  /** Override default 3-column layout (64px 1fr 1fr). */
  columns?: string
}

/** Before/after data grid. Column widths overridable via `columns` prop. */
export function BaGrid({ children, columns }: BaGridProps) {
  return (
    <div className={styles.baGrid} style={columns ? { gridTemplateColumns: columns } : undefined}>
      {children}
    </div>
  )
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
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              &lsaquo;
            </button>{' '}
            page {page + 1}/{pages}{' '}
            <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              &rsaquo;
            </button>
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
  const cells = []
  for (let i = 0; i < n; i++) {
    const b = row.before?.[i]
    const a = row.after?.[i]
    const changed = row.before && row.after && JSON.stringify(b) !== JSON.stringify(a)
    cells.push(
      <div key={`c${i}`} className={styles.col}>
        @{i + 1}
        <span>{colTypes[i] ?? ''}</span>
      </div>,
      <div key={`b${i}`}>{row.before ? fmtVal(b) : '-'}</div>,
      <div key={`a${i}`} className={changed ? styles.changed : ''}>
        {row.after ? fmtVal(a) : '-'}
      </div>,
    )
  }
  return (
    <BaWrap>
      <RowLabel>row {index + 1}</RowLabel>
      <BaGrid>
        <div className={styles.h}>col</div>
        <div className={styles.h}>before</div>
        <div className={styles.h}>after</div>
        {cells}
      </BaGrid>
    </BaWrap>
  )
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// ── KV ───────────────────────────────────────────────────────────────────

/** Key/value table — structural events (GTID, XID, TABLE_MAP…). */
export function KV({ pairs, note }: { pairs: [string, string][]; note?: string }) {
  return (
    <>
      {note && <RowNav>{note}</RowNav>}
      <BaGrid columns="120px 1fr">
        <div className={styles.h}>field</div>
        <div className={styles.h}>value</div>
        {pairs.map(([k, v]) => (
          <Fragment key={k}>
            <div className={styles.col}>{k}</div>
            <div>{v || '-'}</div>
          </Fragment>
        ))}
      </BaGrid>
    </>
  )
}

// ── DiffView ─────────────────────────────────────────────────────────────

interface DiffViewProps {
  diff: DiffResult | null
}

/**
 * DiffView — multi-adapter comparison pane.
 *
 * Shows a diff grid with per-field agree/disagree/partial/disagree-hard
 * styling, plus per-adapter error banners and timing info in the nav bar.
 * Mirrors the oracle Drawer's DiffTab exactly.
 */
export default function DiffView({ diff }: DiffViewProps) {
  if (!diff) return <div style={{ color: 'var(--muted)' }}>running diff adapters&hellip;</div>

  // Nil Go slices/maps marshal to JSON null — default before use.
  const adapters = diff.adapters ?? []
  const fields = diff.fields ?? []
  const errors = diff.errors ?? {}
  const timing = diff.timing_ms ?? {}

  return (
    <>
      <RowNav>
        {(diff.disagreement_count ?? 0) > 0 ? (
          <b className={styles.warn}>{diff.disagreement_count} disagreement(s)</b>
        ) : (
          <span>all adapters agree</span>
        )}
        {' · '}
        {adapters.map((a) => `${a}: ${timing[a] ?? '?'}ms`).join(' · ')}
      </RowNav>
      {Object.entries(errors).map(([a, e]) => (
        <Alert key={a} color="red" role="alert" mb="xs">
          {a}: {e}
        </Alert>
      ))}
      {fields.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>no comparable fields for this event type</div>
      ) : (
        <div className={styles.diffGrid} style={{ gridTemplateColumns: `20px 120px repeat(${adapters.length}, 1fr)` }}>
          {/* marker header — blank spacer above marker column */}
          <div className={styles.h} aria-hidden="true" />
          <div className={`${styles.h} ${styles.diffHead}`}>field</div>
          {adapters.map((a) => (
            <div key={a} className={`${styles.h} ${styles.diffHead}`}>
              {a}
            </div>
          ))}
          {fields.map((f) => (
            <DiffRow key={f.name} field={f} adapters={adapters} />
          ))}
        </div>
      )}
    </>
  )
}

// ── DiffRow ───────────────────────────────────────────────────────────────

/** The oracle adapter whose value is authoritative for "changed" emphasis. */
const ORACLE = 'gomysql'

function DiffRow({ field, adapters }: { field: DiffResult['fields'][0]; adapters: string[] }) {
  // partial = coverage gap; disagree-hard = header-level conflict
  const isAgree = field.partial || field.agree
  const cls = field.partial
    ? styles.partial
    : field.agree
      ? styles.agree
      : field.severity === 'header'
        ? styles.disagreeHard
        : styles.disagree

  const isSQL = field.name === 'decoded.sql'
  const oracleVal = field.values[ORACLE]

  // marker glyph: ✓ for agree/partial, ✗ for disagree
  const marker = isAgree ? '✓' : '✗'

  return (
    <>
      {/* marker cell — row-state class for color, no field-name emphasis */}
      <div className={`${cls} ${styles.mk}`} aria-hidden="true">
        {marker}
      </div>
      <Tooltip label="only some adapters decoded this field" openDelay={150} withinPortal disabled={!field.partial}>
        {/* field label is ALWAYS neutral — not tinted by agree/disagree state */}
        <div className={styles.diffField}>{field.name}</div>
      </Tooltip>
      {adapters.map((a) => {
        const raw = field.values[a] ?? '-'
        // On a disagree row, the value that diverges from the oracle gets emphasis.
        // If there is no oracle value (or the adapter IS the oracle), no emphasis.
        const isChanged = !isAgree && oracleVal !== undefined && a !== ORACLE && raw !== oracleVal
        return (
          <Tooltip key={a} label={raw} openDelay={150} withinPortal>
            <div className={`${cls} ${styles.diffVal}${isChanged ? ' ' + styles.diffValChanged : ''}`}>
              {isSQL ? beautifySQL(raw) : raw}
            </div>
          </Tooltip>
        )
      })}
    </>
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
