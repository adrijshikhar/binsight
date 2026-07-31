package store

const migration = `
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL DEFAULT 0,
  magic_ok INTEGER NOT NULL DEFAULT 0,
  format_version INTEGER NOT NULL DEFAULT 0,
  server_version TEXT NOT NULL DEFAULT '',
  checksum_algo TEXT NOT NULL DEFAULT '',
  indexed_by_adapter TEXT NOT NULL DEFAULT '',
  adapter_version TEXT NOT NULL DEFAULT '',
  last_indexed_offset INTEGER NOT NULL DEFAULT 0,
  indexed_at TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'indexing',
  error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  size INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type_code INTEGER NOT NULL,
  type_name TEXT NOT NULL,
  server_id INTEGER NOT NULL,
  flags INTEGER NOT NULL DEFAULT 0,
  txn_id INTEGER,
  table_id INTEGER,
  db_name TEXT,
  table_name TEXT,
  rows_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  decode_confidence TEXT NOT NULL DEFAULT 'full'
);
CREATE INDEX IF NOT EXISTS idx_events_file_pos ON events(file_id, pos);
CREATE INDEX IF NOT EXISTS idx_events_file_type ON events(file_id, type_code);
CREATE INDEX IF NOT EXISTS idx_events_file_table ON events(file_id, db_name, table_name);
CREATE INDEX IF NOT EXISTS idx_events_file_ts ON events(file_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_txn ON events(txn_id);
CREATE TABLE IF NOT EXISTS txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  gtid TEXT NOT NULL DEFAULT 'ANONYMOUS',
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL DEFAULT 0,
  start_ts INTEGER NOT NULL DEFAULT 0,
  commit_ts INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'incomplete'
);
CREATE INDEX IF NOT EXISTS idx_txns_file ON txns(file_id, start_pos);
CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  db_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  table_map_count INTEGER NOT NULL DEFAULT 0,
  column_types_json TEXT NOT NULL DEFAULT '[]',
  inserts INTEGER NOT NULL DEFAULT 0,
  updates INTEGER NOT NULL DEFAULT 0,
  deletes INTEGER NOT NULL DEFAULT 0,
  rows_total INTEGER NOT NULL DEFAULT 0,
  bytes_total INTEGER NOT NULL DEFAULT 0,
  UNIQUE(file_id, db_name, table_name)
);
CREATE TABLE IF NOT EXISTS decode_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  adapter TEXT NOT NULL,
  message TEXT NOT NULL,
  raw_excerpt BLOB
);
CREATE INDEX IF NOT EXISTS idx_decode_errors_file_pos ON decode_errors(file_id, pos);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS anomalies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id     INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  detector    TEXT NOT NULL,
  severity    TEXT NOT NULL,
  txn_id      INTEGER,
  event_pos   INTEGER,
  db_name     TEXT,
  table_name  TEXT,
  metric      INTEGER NOT NULL DEFAULT 0,
  threshold   INTEGER NOT NULL DEFAULT 0,
  message     TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_anom_file_sev ON anomalies(file_id, severity);
CREATE INDEX IF NOT EXISTS idx_anom_txn      ON anomalies(txn_id);
CREATE INDEX IF NOT EXISTS idx_anom_file_pos ON anomalies(file_id, event_pos);
CREATE TABLE IF NOT EXISTS table_schemas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id      INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  db_name      TEXT NOT NULL,
  table_name   TEXT NOT NULL,
  column_count INTEGER NOT NULL,
  confidence   TEXT NOT NULL,
  UNIQUE(file_id, db_name, table_name)
);
CREATE TABLE IF NOT EXISTS columns (
  table_schema_id INTEGER NOT NULL,
  ordinal         INTEGER NOT NULL,
  name            TEXT NOT NULL,
  data_type       TEXT NOT NULL,
  is_pk           INTEGER NOT NULL,
  nullable        INTEGER NOT NULL,
  PRIMARY KEY (table_schema_id, ordinal)
);
CREATE TABLE IF NOT EXISTS fkeys (
  file_id      INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  child_db     TEXT NOT NULL, child_table TEXT NOT NULL, child_cols TEXT NOT NULL,
  parent_db    TEXT NOT NULL, parent_table TEXT NOT NULL, parent_cols TEXT NOT NULL,
  on_delete    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_columns_schema ON columns(table_schema_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_fkeys_parent   ON fkeys(file_id, parent_db, parent_table);
CREATE INDEX IF NOT EXISTS idx_fkeys_child    ON fkeys(file_id, child_db, child_table);
`
