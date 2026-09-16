export interface BinlogFile {
  id: number
  path: string
  size: number
  magic_ok: boolean
  format_version: number
  server_version: string
  checksum_algo: string
  indexed_by_adapter: string
  adapter_version: string
  last_indexed_offset: number
  indexed_at: string
  state: 'indexing' | 'ready' | 'error' | 'growing' | 'stale'
  error: string
  anomaly_count?: number
  anomaly_max_severity?: Severity
  remote?: boolean
}

export interface EventRow {
  id: number
  file_id: number
  pos: number
  end_pos: number
  size: number
  ts: number
  type_code: number
  type_name: string
  server_id: number
  flags: number
  txn_id?: number
  table_id?: number
  db_name?: string
  table_name?: string
  rows_count: number
  summary: string
  decode_confidence: string
}

export interface EventPage {
  events: EventRow[]
  next_cursor: number
  total: number
}

export interface Txn {
  id: number
  file_id: number
  gtid: string
  start_pos: number
  end_pos: number
  start_ts: number
  commit_ts: number
  event_count: number
  rows_inserted: number
  rows_updated: number
  rows_deleted: number
  status: 'committed' | 'rolled_back' | 'incomplete'
}

export interface TableStat {
  id: number
  file_id: number
  db_name: string
  table_name: string
  table_map_count: number
  column_types_json: string
  inserts: number
  updates: number
  deletes: number
  rows_total: number
  bytes_total: number
}

export interface RowImage {
  before?: unknown[]
  after?: unknown[]
}

export interface EventDetail {
  schema_version: number
  header: {
    pos: number
    ts: number
    type_code: number
    type_name: string
    server_id: number
    size: number
    next_pos: number
    flags: number
  }
  decoded?: {
    db?: string
    table?: string
    table_id?: number
    sql?: string
    gtid?: string
    xid?: number
    column_types?: string[]
    // column_names is present only for FULL row-metadata binlogs (MySQL 8.0+);
    // when absent the UI falls back to positional @1..@n.
    column_names?: string[]
    rows?: RowImage[]
  }
  native?: unknown
  decode_confidence: string
  error?: string
}

export interface HexAnnotation {
  field: string
  start: number
  end: number
  value: string
}
export interface HexResult {
  pos: number
  total: number
  win_start: number
  bytes: string
  annotations: HexAnnotation[]
  crc_checked: boolean
  crc_valid: boolean
}

export interface DiffField {
  name: string
  values: Record<string, string>
  agree: boolean
  // partial: only some adapters produced this field (a coverage gap, not a value
  // conflict) - e.g. an adapter that couldn't decode this layer.
  partial?: boolean
  severity: 'header' | 'decoded' | 'info'
}
export interface DiffResult {
  pos: number
  adapters: string[]
  timing_ms: Record<string, number>
  errors: Record<string, string>
  fields: DiffField[]
  disagreement_count: number
}

export interface StreamConfig {
  enabled: boolean
  host: string
  port: number
  user: string
  password: string
  flavor: 'mysql' | 'mariadb'
  server_id: number
  max_spool_bytes: number
}

export interface StreamStatus {
  state: 'disabled' | 'connecting' | 'streaming' | 'reconnecting' | 'error'
  file: string
  pos: number
  last_event_ts: number
  error?: string
  skipped_events: number
}

export interface Settings {
  port: number
  data_dir: string
  watch_dir: string
  mysqlbinlog_path: string
  page_size: number
  timezone: 'utc' | 'local'
  roles: { indexer: string; detail: string; diff: string[] }
  anomaly: { txn_bytes: number; txn_rows: number; txn_seconds: number; event_rows: number }
  stream: StreamConfig
  /**
   * Whether a replication password is stored. The password itself is never
   * returned by GET /api/settings; sending back an empty `stream.password`
   * leaves the stored one untouched. Optional because imported settings files
   * (and older exports) do not carry it.
   */
  stream_password_set?: boolean
}

export interface AdapterInfo {
  name: string
  capabilities: { FullScan: boolean; SeekDecode: boolean; RemoteStream: boolean; RowImages: boolean }
}

export interface TypeCount {
  type_name: string
  count: number
  rows_total: number
}

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Anomaly {
  id: number
  file_id: number
  detector: string
  severity: Severity
  txn_id?: number
  event_pos?: number
  db_name?: string
  table_name?: string
  metric: number
  threshold: number
  message: string
  detail_json: string
}

export interface Stats {
  min: number
  avg: number
  max: number
  total: number
}

export interface Bucket {
  t: number
  count: number
  bytes: number
  dml: number
  query: number
  other: number
  by_type: Record<string, number>
}

export interface TypeBytes {
  type_name: string
  events: number
  bytes: number
}

export interface EventRef {
  pos: number
  size: number
  ts: number
  type_name: string
  txn_id: number
}

export interface TxnRef {
  id: number
  events: number
  rows: number
  gtid: string
}

export interface TxnMetrics {
  count: number
  events: Stats
  duration_sec: Stats
  rows: Stats
}

export interface DecodeHealth {
  full: number
  partial: number
  none: number
  errors: number
}

export interface FileMetrics {
  events: number
  event_size: Stats
  first_ts: number
  last_ts: number
  span_sec: number
  events_per_sec: number
  bytes_per_sec: number
  txns: TxnMetrics
  decode: DecodeHealth
  by_type: TypeBytes[]
  largest_events: EventRef[]
  largest_txns: TxnRef[]
  series: Bucket[]
}
