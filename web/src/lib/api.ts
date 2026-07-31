import type {
  AdapterInfo,
  Anomaly,
  BinlogFile,
  DiffResult,
  EventDetail,
  EventPage,
  FileMetrics,
  HexResult,
  Settings,
  Severity,
  StreamStatus,
  TableStat,
  Txn,
  TypeCount,
} from './types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? res.statusText)
  }
  return res.json()
}

export interface EventQuery {
  file: number
  type?: string // comma-separated for multi-select
  db?: string
  table?: string
  txn?: string | number // comma-separated ids for multi-select
  from_ts?: number
  to_ts?: number
  from_pos?: number
  to_pos?: number
  q?: string
  cursor?: number
  limit?: number
  tail?: number // >0: fetch the newest N events (live tail); server ignores cursor
}

export function eventQueryString(q: EventQuery): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== '' && (v !== 0 || k === 'from_pos')) p.set(k, String(v))
  }
  if (!p.has('file')) p.set('file', String(q.file))
  return p.toString()
}

export const api = {
  files: () => get<BinlogFile[]>('/api/files'),
  events: (q: EventQuery) => get<EventPage>(`/api/events?${eventQueryString(q)}`),
  detail: (file: number, pos: number) => get<EventDetail>(`/api/events/${file}/${pos}`),
  hex: (file: number, pos: number, off = 0, len = 0) =>
    get<HexResult>(`/api/events/${file}/${pos}/hex?off=${off}&len=${len}`),
  diff: (file: number, pos: number) => get<DiffResult>(`/api/events/${file}/${pos}/diff`),
  typeCounts: (file: number) => get<TypeCount[]>(`/api/files/${file}/type-counts`),
  metrics: (file: number) => get<FileMetrics>(`/api/files/${file}/metrics`),
  txns: (file: number) => get<Txn[]>(`/api/txns?file=${file}`),
  tables: (file: number) => get<TableStat[]>(`/api/tables?file=${file}`),
  anomalies: (file: number, severity?: Severity | '') =>
    get<Anomaly[]>(`/api/anomalies?file=${file}${severity ? `&severity=${severity}` : ''}`),
  detect: async (file: number): Promise<void> => {
    const res = await fetch(`/api/files/${file}/detect`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? res.statusText)
    }
  },
  settings: () => get<Settings>('/api/settings'),
  adapters: () => get<AdapterInfo[]>('/api/adapters'),
  saveSettings: async (s: Settings): Promise<Settings> => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? res.statusText)
    }
    return res.json()
  },
  rescan: async (): Promise<void> => {
    const res = await fetch('/api/rescan', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? res.statusText)
    }
  },
  reindex: async (file: number): Promise<void> => {
    const res = await fetch(`/api/files/${file}/reindex`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? res.statusText)
    }
  },
  streamStatus: () => get<StreamStatus>('/api/stream/status'),
  restartStreamFromCurrent: async (): Promise<void> => {
    const res = await fetch('/api/stream/restart-from-current', { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(body.error ?? res.statusText)
    }
  },
}
