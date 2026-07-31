package store

import (
	"errors"
	"fmt"
)

// ErrFileNotFound is returned by Metrics when the file id does not exist, so
// callers (e.g. the HTTP handler) can map it to 404 rather than 500.
var ErrFileNotFound = errors.New("file not found")

// Stats is a min/avg/max/total summary over an integer column. Avg is the
// truncated integer mean (SQLite CAST(avg(...) AS INTEGER)).
type Stats struct {
	Min   int64 `json:"min"`
	Avg   int64 `json:"avg"`
	Max   int64 `json:"max"`
	Total int64 `json:"total"`
}

// Bucket is one bin of the event-time series. DML+Query+Other == Count, and
// the values of ByType also sum to Count. DML/Query/Other are the coarse 3-band
// split; ByType is the full per-event-type breakdown for that bucket.
type Bucket struct {
	T      int64            `json:"t"` // bucket start ts (unix sec)
	Count  int64            `json:"count"`
	Bytes  int64            `json:"bytes"`
	DML    int64            `json:"dml"`     // row-image events
	Query  int64            `json:"query"`   // QUERY (DDL + BEGIN)
	Other  int64            `json:"other"`   // table_map, xid, gtid, rotate, ...
	ByType map[string]int64 `json:"by_type"` // every event type → count in this bucket
}

// TypeBytes is a per-event-type tally with byte total.
type TypeBytes struct {
	TypeName string `json:"type_name"`
	Events   int64  `json:"events"`
	Bytes    int64  `json:"bytes"`
}

// EventRef points at a single event (largest-events list).
type EventRef struct {
	Pos      int64  `json:"pos"`
	Size     int64  `json:"size"`
	TS       int64  `json:"ts"`
	TypeName string `json:"type_name"`
	TxnID    int64  `json:"txn_id"` // 0 when the event is not inside a transaction
}

// TxnRef points at a transaction (largest-txns list).
type TxnRef struct {
	ID     int64  `json:"id"`
	Events int64  `json:"events"`
	Rows   int64  `json:"rows"`
	GTID   string `json:"gtid"`
}

// TxnMetrics summarises committed transactions for a file.
type TxnMetrics struct {
	Count       int64 `json:"count"`
	Events      Stats `json:"events"`
	DurationSec Stats `json:"duration_sec"`
	Rows        Stats `json:"rows"`
}

// DecodeHealth counts events by decode confidence plus decode-error rows.
type DecodeHealth struct {
	Full    int64 `json:"full"`
	Partial int64 `json:"partial"`
	None    int64 `json:"none"`
	Errors  int64 `json:"errors"`
}

// FileMetrics is the full Overview dashboard payload for one file. Every metric
// is derived from the existing index — no binlog decode.
type FileMetrics struct {
	Events        int64        `json:"events"`
	EventSize     Stats        `json:"event_size"`
	FirstTS       int64        `json:"first_ts"`
	LastTS        int64        `json:"last_ts"`
	SpanSec       int64        `json:"span_sec"`
	EventsPerSec  float64      `json:"events_per_sec"`
	BytesPerSec   float64      `json:"bytes_per_sec"`
	Txns          TxnMetrics   `json:"txns"`
	Decode        DecodeHealth `json:"decode"`
	ByType        []TypeBytes  `json:"by_type"`
	LargestEvents []EventRef   `json:"largest_events"`
	LargestTxns   []TxnRef     `json:"largest_txns"`
	Series        []Bucket     `json:"series"`
}

const metricsBuckets = 60

// Metrics computes the per-file Overview dashboard from the index (no decode).
// It returns an error if the file does not exist.
func (s *Store) Metrics(fileID int64) (*FileMetrics, error) {
	var exists int64
	if err := s.DB.QueryRow(`SELECT count(*) FROM files WHERE id=?`, fileID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists == 0 {
		return nil, fmt.Errorf("file %d: %w", fileID, ErrFileNotFound)
	}

	m := &FileMetrics{
		ByType:        []TypeBytes{},
		LargestEvents: make([]EventRef, 0, 5),
		LargestTxns:   make([]TxnRef, 0, 5),
		Series:        make([]Bucket, 0, metricsBuckets),
	}

	// Event count + size stats + time span in one row.
	err := s.DB.QueryRow(`SELECT
		count(*),
		COALESCE(min(size),0), COALESCE(CAST(avg(size) AS INTEGER),0), COALESCE(max(size),0), COALESCE(sum(size),0),
		COALESCE(min(ts),0), COALESCE(max(ts),0)
		FROM events WHERE file_id=?`, fileID).
		Scan(&m.Events, &m.EventSize.Min, &m.EventSize.Avg, &m.EventSize.Max, &m.EventSize.Total,
			&m.FirstTS, &m.LastTS)
	if err != nil {
		return nil, err
	}
	// Span/rates are event-derived; txn + decode-error metrics are independent of
	// events (a file may have txn rows or decode errors with zero indexed events),
	// so every sub-query runs unconditionally and handles the empty case as zeros.
	// For an empty file both FirstTS and LastTS are COALESCE-0, giving SpanSec=0;
	// the < 0 clamp is belt-and-suspenders (SQLite guarantees min <= max otherwise).
	m.SpanSec = m.LastTS - m.FirstTS
	if m.SpanSec < 0 {
		m.SpanSec = 0
	}
	denom := m.SpanSec
	if denom < 1 {
		denom = 1
	}
	m.EventsPerSec = float64(m.Events) / float64(denom)
	m.BytesPerSec = float64(m.EventSize.Total) / float64(denom)

	if err := s.metricsByType(fileID, m); err != nil {
		return nil, fmt.Errorf("metricsByType: %w", err)
	}
	if err := s.metricsLargestEvents(fileID, m); err != nil {
		return nil, fmt.Errorf("metricsLargestEvents: %w", err)
	}
	if err := s.metricsDecode(fileID, m); err != nil {
		return nil, fmt.Errorf("metricsDecode: %w", err)
	}
	if err := s.metricsTxns(fileID, m); err != nil {
		return nil, fmt.Errorf("metricsTxns: %w", err)
	}
	if err := s.metricsSeries(fileID, m); err != nil {
		return nil, fmt.Errorf("metricsSeries: %w", err)
	}
	return m, nil
}

func (s *Store) metricsByType(fileID int64, m *FileMetrics) error {
	rows, err := s.DB.Query(`SELECT type_name, count(*), COALESCE(sum(size),0)
		FROM events WHERE file_id=? GROUP BY type_name ORDER BY sum(size) DESC, type_name`, fileID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var t TypeBytes
		if err := rows.Scan(&t.TypeName, &t.Events, &t.Bytes); err != nil {
			return err
		}
		m.ByType = append(m.ByType, t)
	}
	return rows.Err()
}

func (s *Store) metricsLargestEvents(fileID int64, m *FileMetrics) error {
	rows, err := s.DB.Query(`SELECT pos, size, ts, type_name, COALESCE(txn_id,0)
		FROM events WHERE file_id=? ORDER BY size DESC, pos LIMIT 5`, fileID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var e EventRef
		if err := rows.Scan(&e.Pos, &e.Size, &e.TS, &e.TypeName, &e.TxnID); err != nil {
			return err
		}
		m.LargestEvents = append(m.LargestEvents, e)
	}
	return rows.Err()
}

func (s *Store) metricsDecode(fileID int64, m *FileMetrics) error {
	rows, err := s.DB.Query(`SELECT decode_confidence, count(*)
		FROM events WHERE file_id=? GROUP BY decode_confidence`, fileID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var conf string
		var n int64
		if err := rows.Scan(&conf, &n); err != nil {
			return err
		}
		switch conf {
		case "full":
			m.Decode.Full = n
		case "partial":
			m.Decode.Partial = n
		case "none":
			m.Decode.None = n
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return s.DB.QueryRow(`SELECT count(*) FROM decode_errors WHERE file_id=?`, fileID).Scan(&m.Decode.Errors)
}

func (s *Store) metricsTxns(fileID int64, m *FileMetrics) error {
	// Only committed txns have a valid commit_ts for durations.
	err := s.DB.QueryRow(`SELECT
		count(*),
		COALESCE(min(event_count),0), COALESCE(CAST(avg(event_count) AS INTEGER),0), COALESCE(max(event_count),0), COALESCE(sum(event_count),0),
		COALESCE(min(commit_ts-start_ts),0), COALESCE(CAST(avg(commit_ts-start_ts) AS INTEGER),0), COALESCE(max(commit_ts-start_ts),0), COALESCE(sum(commit_ts-start_ts),0),
		COALESCE(min(rows_inserted+rows_updated+rows_deleted),0), COALESCE(CAST(avg(rows_inserted+rows_updated+rows_deleted) AS INTEGER),0), COALESCE(max(rows_inserted+rows_updated+rows_deleted),0), COALESCE(sum(rows_inserted+rows_updated+rows_deleted),0)
		FROM txns WHERE file_id=? AND status='committed'`, fileID).
		Scan(&m.Txns.Count,
			&m.Txns.Events.Min, &m.Txns.Events.Avg, &m.Txns.Events.Max, &m.Txns.Events.Total,
			&m.Txns.DurationSec.Min, &m.Txns.DurationSec.Avg, &m.Txns.DurationSec.Max, &m.Txns.DurationSec.Total,
			&m.Txns.Rows.Min, &m.Txns.Rows.Avg, &m.Txns.Rows.Max, &m.Txns.Rows.Total)
	if err != nil {
		return err
	}
	rows, err := s.DB.Query(`SELECT id, event_count, rows_inserted+rows_updated+rows_deleted, gtid
		FROM txns WHERE file_id=? AND status='committed' ORDER BY event_count DESC, id LIMIT 5`, fileID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var t TxnRef
		if err := rows.Scan(&t.ID, &t.Events, &t.Rows, &t.GTID); err != nil {
			return err
		}
		m.LargestTxns = append(m.LargestTxns, t)
	}
	return rows.Err()
}

func (s *Store) metricsSeries(fileID int64, m *FileMetrics) error {
	// Ceiling division so the span (LastTS-FirstTS+1 seconds) never yields more
	// than metricsBuckets bins. Floor division would keep width=1 for spans in
	// [60,118]s and over-produce up to ~119 buckets. ceil(n/d) = (n+d-1)/d with
	// n=span+1, d=metricsBuckets simplifies to (span+metricsBuckets)/metricsBuckets.
	width := (m.LastTS - m.FirstTS + metricsBuckets) / metricsBuckets
	if width < 1 {
		width = 1
	}
	// Group by (bucket, type_name) so each bucket carries the full per-type
	// breakdown; the coarse DML/Query/Other bands are derived in Go.
	rows, err := s.DB.Query(`SELECT (ts-?)/? AS b, type_name, count(*), COALESCE(sum(size),0)
		FROM events WHERE file_id=? GROUP BY b, type_name ORDER BY b`, m.FirstTS, width, fileID)
	if err != nil {
		return err
	}
	defer rows.Close()

	isRow := make(map[string]bool, len(rowEventTypes))
	for _, t := range rowEventTypes {
		isRow[t] = true
	}
	var order []int64
	buckets := map[int64]*Bucket{}
	for rows.Next() {
		var b, count, bytes int64
		var typeName string
		if err := rows.Scan(&b, &typeName, &count, &bytes); err != nil {
			return err
		}
		bk := buckets[b]
		if bk == nil {
			bk = &Bucket{T: m.FirstTS + b*width, ByType: map[string]int64{}}
			buckets[b] = bk
			order = append(order, b) // ORDER BY b keeps this ascending → T monotonic
		}
		bk.Count += count
		bk.Bytes += bytes
		bk.ByType[typeName] += count
		switch {
		case isRow[typeName]:
			bk.DML += count
		case typeName == "QUERY":
			bk.Query += count
		default:
			bk.Other += count
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, b := range order {
		m.Series = append(m.Series, *buckets[b])
	}
	return nil
}
