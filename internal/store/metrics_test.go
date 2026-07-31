package store

import (
	"math"
	"testing"
)

// seedMetricsFile creates a fresh file for metrics tests and returns its ID.
// Named differently from anomalies_test.go's seedFile to avoid a collision.
func seedMetricsFile(t *testing.T, s *Store, path string) int64 {
	t.Helper()
	f := &File{Path: path, MagicOK: true, State: FileStateReady}
	if err := s.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	return f.ID
}

// seedMetricsTxn inserts a transaction and returns its ID.
func seedMetricsTxn(t *testing.T, s *Store, txn *Txn) int64 {
	t.Helper()
	id, err := s.InsertTxn(txn)
	if err != nil {
		t.Fatalf("InsertTxn: %v", err)
	}
	return id
}

// seedMetricsEvents inserts events; it is fine for Confidence to be empty (defaults to "full").
func seedMetricsEvents(t *testing.T, s *Store, evs []*EventRow) {
	t.Helper()
	if err := s.InsertEvents(evs); err != nil {
		t.Fatalf("InsertEvents: %v", err)
	}
}

// seedMetricsDecodeError inserts a decode_errors row via the real InsertDecodeError method.
func seedMetricsDecodeError(t *testing.T, s *Store, fileID, pos int64) {
	t.Helper()
	err := s.InsertDecodeError(&DecodeError{
		FileID:  fileID,
		Pos:     pos,
		Adapter: "go-mysql",
		Message: "test decode error",
	})
	if err != nil {
		t.Fatalf("InsertDecodeError: %v", err)
	}
}

// ---- helpers for common assertions ----------------------------------------

func requireMetrics(t *testing.T, s *Store, fileID int64) *FileMetrics {
	t.Helper()
	m, err := s.Metrics(fileID)
	if err != nil {
		t.Fatalf("Metrics(%d): unexpected error: %v", fileID, err)
	}
	if m == nil {
		t.Fatalf("Metrics(%d): returned nil FileMetrics", fileID)
	}
	return m
}

// assertStats checks all four fields of a Stats value with a descriptive label.
func assertStats(t *testing.T, label string, got Stats, wantMin, wantAvg, wantMax, wantTotal int64) {
	t.Helper()
	if got.Min != wantMin {
		t.Errorf("%s.Min = %d, want %d", label, got.Min, wantMin)
	}
	if got.Avg != wantAvg {
		t.Errorf("%s.Avg = %d, want %d", label, got.Avg, wantAvg)
	}
	if got.Max != wantMax {
		t.Errorf("%s.Max = %d, want %d", label, got.Max, wantMax)
	}
	if got.Total != wantTotal {
		t.Errorf("%s.Total = %d, want %d", label, got.Total, wantTotal)
	}
}

// ---- test cases ------------------------------------------------------------

// TestMetricsEmptyFile verifies that an empty file (no events) returns all
// zeros and nil/empty slices without panicking.
func TestMetricsEmptyFile(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_empty.bin")

	m := requireMetrics(t, s, fid)

	if m.Events != 0 {
		t.Errorf("Events = %d, want 0", m.Events)
	}
	assertStats(t, "EventSize", m.EventSize, 0, 0, 0, 0)
	if m.FirstTS != 0 {
		t.Errorf("FirstTS = %d, want 0", m.FirstTS)
	}
	if m.LastTS != 0 {
		t.Errorf("LastTS = %d, want 0", m.LastTS)
	}
	if m.SpanSec != 0 {
		t.Errorf("SpanSec = %d, want 0", m.SpanSec)
	}
	if m.EventsPerSec != 0 {
		t.Errorf("EventsPerSec = %f, want 0", m.EventsPerSec)
	}
	if m.BytesPerSec != 0 {
		t.Errorf("BytesPerSec = %f, want 0", m.BytesPerSec)
	}
	if m.Txns.Count != 0 {
		t.Errorf("Txns.Count = %d, want 0", m.Txns.Count)
	}
	if m.Decode.Full != 0 || m.Decode.Partial != 0 || m.Decode.None != 0 || m.Decode.Errors != 0 {
		t.Errorf("Decode = %+v, want all zeros", m.Decode)
	}
	if len(m.ByType) != 0 {
		t.Errorf("ByType len = %d, want 0", len(m.ByType))
	}
	if len(m.LargestEvents) != 0 {
		t.Errorf("LargestEvents len = %d, want 0", len(m.LargestEvents))
	}
	if len(m.LargestTxns) != 0 {
		t.Errorf("LargestTxns len = %d, want 0", len(m.LargestTxns))
	}
	if len(m.Series) != 0 {
		t.Errorf("Series len = %d, want 0", len(m.Series))
	}
}

// TestMetricsSingleEvent verifies a file with exactly one event:
// SpanSec=0, rates use max(1,span) so they are finite and non-negative, and
// there is exactly one bucket in the series.
func TestMetricsSingleEvent(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_single.bin")

	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 200, Size: 100, TS: 5000, TypeCode: 2, TypeName: "QUERY"},
	})

	m := requireMetrics(t, s, fid)

	if m.Events != 1 {
		t.Errorf("Events = %d, want 1", m.Events)
	}
	assertStats(t, "EventSize", m.EventSize, 100, 100, 100, 100)
	if m.FirstTS != 5000 {
		t.Errorf("FirstTS = %d, want 5000", m.FirstTS)
	}
	if m.LastTS != 5000 {
		t.Errorf("LastTS = %d, want 5000", m.LastTS)
	}
	if m.SpanSec != 0 {
		t.Errorf("SpanSec = %d, want 0 (single ts)", m.SpanSec)
	}
	// Rates must be finite and equal to Events / max(1,0) = 1 and Total / max(1,0) = 100.
	if math.IsInf(m.EventsPerSec, 0) || math.IsNaN(m.EventsPerSec) {
		t.Errorf("EventsPerSec is not finite: %f", m.EventsPerSec)
	}
	if m.EventsPerSec != 1.0 {
		t.Errorf("EventsPerSec = %f, want 1.0 (span=0 → use max(1,0)=1)", m.EventsPerSec)
	}
	if math.IsInf(m.BytesPerSec, 0) || math.IsNaN(m.BytesPerSec) {
		t.Errorf("BytesPerSec is not finite: %f", m.BytesPerSec)
	}
	if m.BytesPerSec != 100.0 {
		t.Errorf("BytesPerSec = %f, want 100.0 (total=100, span=0 → use max(1,0)=1)", m.BytesPerSec)
	}
	// A single timestamp still produces exactly one non-empty bucket.
	if len(m.Series) != 1 {
		t.Errorf("Series len = %d, want 1 for a single-ts file", len(m.Series))
	}
	if len(m.Series) == 1 {
		b := m.Series[0]
		if b.Count != 1 {
			t.Errorf("Series[0].Count = %d, want 1", b.Count)
		}
		if b.DML+b.Query+b.Other != b.Count {
			t.Errorf("bucket band sum %d != Count %d", b.DML+b.Query+b.Other, b.Count)
		}
	}
}

// TestMetricsSameTS verifies that multiple events sharing the same timestamp
// produce SpanSec=0 and rates still finite.
func TestMetricsSameTS(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_samets.bin")

	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 180, Size: 80, TS: 9000, TypeCode: 2, TypeName: "QUERY"},
		{FileID: fid, Pos: 180, EndPos: 260, Size: 80, TS: 9000, TypeCode: 2, TypeName: "QUERY"},
		{FileID: fid, Pos: 260, EndPos: 380, Size: 120, TS: 9000, TypeCode: 31, TypeName: "WRITE_ROWS_V2"},
	})

	m := requireMetrics(t, s, fid)

	if m.SpanSec != 0 {
		t.Errorf("SpanSec = %d, want 0 for all-same-ts", m.SpanSec)
	}
	if math.IsInf(m.EventsPerSec, 0) || math.IsNaN(m.EventsPerSec) {
		t.Errorf("EventsPerSec not finite: %f", m.EventsPerSec)
	}
	if math.IsInf(m.BytesPerSec, 0) || math.IsNaN(m.BytesPerSec) {
		t.Errorf("BytesPerSec not finite: %f", m.BytesPerSec)
	}
	// With span=0 both denominators are max(1,0)=1.
	if m.EventsPerSec != 3.0 {
		t.Errorf("EventsPerSec = %f, want 3.0", m.EventsPerSec)
	}
	wantBytes := float64(80 + 80 + 120)
	if m.BytesPerSec != wantBytes {
		t.Errorf("BytesPerSec = %f, want %f", m.BytesPerSec, wantBytes)
	}
}

// TestMetricsMultiTypeAndSize verifies EventSize min/avg/max/total and ByType
// ordering by bytes desc.
func TestMetricsMultiTypeAndSize(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_multitype.bin")

	// Sizes: 50, 100, 200, 300 → total=650, min=50, max=300, avg=162 (floor of 162.5).
	// QUERY total bytes = 50+300 = 350; WRITE_ROWS_V2 total bytes = 100+200 = 300.
	// ByType must be ordered QUERY first (350 > 300).
	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 150, Size: 50, TS: 1000, TypeName: "QUERY"},
		{FileID: fid, Pos: 150, EndPos: 250, Size: 100, TS: 1001, TypeName: "WRITE_ROWS_V2"},
		{FileID: fid, Pos: 250, EndPos: 450, Size: 200, TS: 1002, TypeName: "WRITE_ROWS_V2"},
		{FileID: fid, Pos: 450, EndPos: 750, Size: 300, TS: 1003, TypeName: "QUERY"},
	})

	m := requireMetrics(t, s, fid)

	if m.Events != 4 {
		t.Errorf("Events = %d, want 4", m.Events)
	}

	// Avg of (50+100+200+300)/4 = 650/4 = 162 (integer, SQL avg rounds or truncates).
	wantAvg := int64(650 / 4)
	assertStats(t, "EventSize", m.EventSize, 50, wantAvg, 300, 650)

	if len(m.ByType) != 2 {
		t.Fatalf("ByType len = %d, want 2", len(m.ByType))
	}
	if m.ByType[0].TypeName != "QUERY" {
		t.Errorf("ByType[0].TypeName = %q, want QUERY (most bytes)", m.ByType[0].TypeName)
	}
	if m.ByType[0].Events != 2 {
		t.Errorf("ByType[0].Events = %d, want 2", m.ByType[0].Events)
	}
	if m.ByType[0].Bytes != 350 {
		t.Errorf("ByType[0].Bytes = %d, want 350", m.ByType[0].Bytes)
	}
	if m.ByType[1].TypeName != "WRITE_ROWS_V2" {
		t.Errorf("ByType[1].TypeName = %q, want WRITE_ROWS_V2", m.ByType[1].TypeName)
	}
	if m.ByType[1].Bytes != 300 {
		t.Errorf("ByType[1].Bytes = %d, want 300", m.ByType[1].Bytes)
	}
}

// TestMetricsBucketing verifies the time-series bucketing invariants:
//   - at most 60 buckets are returned
//   - per bucket: DML+Query+Other == Count
//   - sum(Count) over all buckets == total Events
//   - T values are monotonically non-decreasing
//   - DML band only covers the 6 row-image types, Query only QUERY, Other is the rest
func TestMetricsBucketing(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_buckets.bin")

	// Spread 12 events over ts 1000..1011 to guarantee multiple buckets.
	// Mix of DML / Query / Other types.
	var evs []*EventRow
	types := []string{
		"WRITE_ROWS_V2", "UPDATE_ROWS_V2", "DELETE_ROWS_V2",
		"WRITE_ROWS_V1", "UPDATE_ROWS_V1", "DELETE_ROWS_V1", // 6 DML
		"QUERY",                                             // 1 Query
		"GTID", "XID", "TABLE_MAP", "ROTATE", "FORMAT_DESC", // 5 Other
	}
	for i, tn := range types {
		evs = append(evs, &EventRow{
			FileID:   fid,
			Pos:      int64(100 + i*100),
			EndPos:   int64(100 + (i+1)*100),
			Size:     int64(80 + i*10),
			TS:       int64(1000 + i),
			TypeName: tn,
		})
	}
	seedMetricsEvents(t, s, evs)

	m := requireMetrics(t, s, fid)

	if len(m.Series) > 60 {
		t.Errorf("Series len = %d, want <= 60", len(m.Series))
	}
	if len(m.Series) == 0 {
		t.Fatal("Series is empty, want at least 1 bucket for non-empty file")
	}

	// Sum of Count over all buckets must equal total events.
	var totalCount int64
	for i, b := range m.Series {
		// Per-bucket band invariant.
		if b.DML+b.Query+b.Other != b.Count {
			t.Errorf("Series[%d]: DML(%d)+Query(%d)+Other(%d) = %d != Count(%d)",
				i, b.DML, b.Query, b.Other, b.DML+b.Query+b.Other, b.Count)
		}
		if b.Count < 0 {
			t.Errorf("Series[%d].Count = %d, must be >= 0", i, b.Count)
		}
		totalCount += b.Count
	}
	if totalCount != m.Events {
		t.Errorf("sum(bucket.Count) = %d, want %d (total Events)", totalCount, m.Events)
	}

	// T values must be monotonically non-decreasing.
	for i := 1; i < len(m.Series); i++ {
		if m.Series[i].T < m.Series[i-1].T {
			t.Errorf("Series T not monotonic: Series[%d].T=%d < Series[%d].T=%d",
				i, m.Series[i].T, i-1, m.Series[i-1].T)
		}
	}

	// Aggregate across all buckets: DML should cover exactly our 6 DML events,
	// Query exactly 1, Other exactly 5.
	var totalDML, totalQuery, totalOther int64
	for _, b := range m.Series {
		totalDML += b.DML
		totalQuery += b.Query
		totalOther += b.Other
	}
	if totalDML != 6 {
		t.Errorf("total DML across buckets = %d, want 6", totalDML)
	}
	if totalQuery != 1 {
		t.Errorf("total Query across buckets = %d, want 1", totalQuery)
	}
	if totalOther != 5 {
		t.Errorf("total Other across buckets = %d, want 5", totalOther)
	}
}

// TestMetricsBucketingNeverExceeds60 guards the ceiling-division binning: a
// span in [60,118]s previously floored width to 1 and over-produced buckets.
func TestMetricsBucketingNeverExceeds60(t *testing.T) {
	// One event per second across several spans straddling the old floor breakpoints.
	for _, span := range []int64{59, 60, 90, 118, 119, 240} {
		s := newTestStore(t)
		fid := seedMetricsFile(t, s, "/data/metrics_span.bin")
		var evs []*EventRow
		for i := int64(0); i <= span; i++ {
			evs = append(evs, &EventRow{
				FileID: fid, Pos: 100 + i, EndPos: 101 + i, Size: 50,
				TS: 1000 + i, TypeName: "QUERY",
			})
		}
		seedMetricsEvents(t, s, evs)

		m := requireMetrics(t, s, fid)
		if len(m.Series) > 60 {
			t.Errorf("span=%d: Series len = %d, want <= 60", span, len(m.Series))
		}
		var total int64
		for _, b := range m.Series {
			total += b.Count
		}
		if total != m.Events {
			t.Errorf("span=%d: sum(Count)=%d != Events=%d", span, total, m.Events)
		}
	}
}

// TestMetricsTxnStats verifies committed-only counting, Stats fields, and
// LargestTxns ordering.
func TestMetricsTxnStats(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_txns.bin")

	// Committed txn 1: 5 events, duration=10s, rows=3.
	txn1 := seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "uuid:1",
		StartPos: 100, StartTS: 1000, CommitTS: 1010,
		EventCount: 5, RowsInserted: 2, RowsUpdated: 1, RowsDeleted: 0,
		Status: "committed",
	})
	// Committed txn 2: 10 events, duration=20s, rows=7.
	txn2 := seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "uuid:2",
		StartPos: 500, StartTS: 2000, CommitTS: 2020,
		EventCount: 10, RowsInserted: 3, RowsUpdated: 4, RowsDeleted: 0,
		Status: "committed",
	})
	// Committed txn 3: 3 events, duration=5s, rows=2.
	txn3 := seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "uuid:3",
		StartPos: 900, StartTS: 3000, CommitTS: 3005,
		EventCount: 3, RowsInserted: 1, RowsUpdated: 1, RowsDeleted: 0,
		Status: "committed",
	})
	// Incomplete (should be excluded).
	_ = seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "uuid:4",
		StartPos: 1200, StartTS: 4000, CommitTS: 0,
		EventCount: 2, Status: "incomplete",
	})
	// Rolled back (should be excluded).
	_ = seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "uuid:5",
		StartPos: 1400, StartTS: 5000, CommitTS: 5002,
		EventCount: 8, RowsInserted: 5, Status: "rolled_back",
	})
	// Keep txn IDs used to avoid "declared but not used" for txn1/txn2/txn3.
	_ = txn1
	_ = txn2
	_ = txn3

	m := requireMetrics(t, s, fid)

	// Only 3 committed txns.
	if m.Txns.Count != 3 {
		t.Fatalf("Txns.Count = %d, want 3 (only committed)", m.Txns.Count)
	}

	// EventCount stats over [5, 10, 3] → min=3, max=10, avg=6, total=18.
	assertStats(t, "Txns.Events", m.Txns.Events, 3, 6, 10, 18)

	// DurationSec = CommitTS-StartTS: [10, 20, 5] → min=5, max=20, avg=11 (35/3=11), total=35.
	assertStats(t, "Txns.DurationSec", m.Txns.DurationSec, 5, 11, 20, 35)

	// Rows = RowsInserted+RowsUpdated+RowsDeleted: [3, 7, 2] → min=2, max=7, avg=4, total=12.
	assertStats(t, "Txns.Rows", m.Txns.Rows, 2, 4, 7, 12)

	// LargestTxns: top 5 by event_count desc; we have 3 committed, so 3 entries,
	// ordered 10, 5, 3.
	if len(m.LargestTxns) != 3 {
		t.Fatalf("LargestTxns len = %d, want 3", len(m.LargestTxns))
	}
	if m.LargestTxns[0].Events != 10 {
		t.Errorf("LargestTxns[0].Events = %d, want 10", m.LargestTxns[0].Events)
	}
	if m.LargestTxns[1].Events != 5 {
		t.Errorf("LargestTxns[1].Events = %d, want 5", m.LargestTxns[1].Events)
	}
	if m.LargestTxns[2].Events != 3 {
		t.Errorf("LargestTxns[2].Events = %d, want 3", m.LargestTxns[2].Events)
	}

	// No non-committed txn must appear in LargestTxns (event_count=8 of
	// rolled_back would otherwise rank #2).
	for i, tr := range m.LargestTxns {
		if tr.Events == 8 {
			t.Errorf("LargestTxns[%d] has rolled_back txn (Events=8), must be excluded", i)
		}
		if tr.Events == 2 {
			t.Errorf("LargestTxns[%d] has incomplete txn (Events=2), must be excluded", i)
		}
	}
}

// TestMetricsLargestTxnsCapped verifies that at most 5 entries are returned
// even when more than 5 committed txns exist.
func TestMetricsLargestTxnsCapped(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_txncap.bin")

	for i := 0; i < 7; i++ {
		_ = seedMetricsTxn(t, s, &Txn{
			FileID:     fid,
			GTID:       "anonymous",
			StartPos:   int64(100 + i*100),
			StartTS:    int64(1000 + i),
			CommitTS:   int64(1001 + i),
			EventCount: int64(i + 1),
			Status:     "committed",
		})
	}

	m := requireMetrics(t, s, fid)

	if len(m.LargestTxns) > 5 {
		t.Errorf("LargestTxns len = %d, want <= 5", len(m.LargestTxns))
	}
	if len(m.LargestTxns) != 5 {
		t.Errorf("LargestTxns len = %d, want exactly 5 when >5 committed exist", len(m.LargestTxns))
	}
	// Should be the 5 largest by EventCount, in desc order (7,6,5,4,3).
	wantCounts := []int64{7, 6, 5, 4, 3}
	for i, want := range wantCounts {
		if m.LargestTxns[i].Events != want {
			t.Errorf("LargestTxns[%d].Events = %d, want %d", i, m.LargestTxns[i].Events, want)
		}
	}
}

// TestMetricsDecodeHealth seeds events with mixed decode_confidence values and
// some decode_errors rows; asserts Full/Partial/None/Errors counts.
func TestMetricsDecodeHealth(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_decode.bin")

	seedMetricsEvents(t, s, []*EventRow{
		// Confidence "full" (also the default, but set explicitly).
		{FileID: fid, Pos: 100, EndPos: 180, Size: 80, TS: 1000, TypeName: "QUERY", Confidence: "full"},
		{FileID: fid, Pos: 180, EndPos: 260, Size: 80, TS: 1000, TypeName: "QUERY", Confidence: "full"},
		{FileID: fid, Pos: 260, EndPos: 340, Size: 80, TS: 1001, TypeName: "TABLE_MAP", Confidence: "full"},
		// Confidence "partial".
		{FileID: fid, Pos: 340, EndPos: 420, Size: 80, TS: 1001, TypeName: "WRITE_ROWS_V2", Confidence: "partial"},
		{FileID: fid, Pos: 420, EndPos: 500, Size: 80, TS: 1002, TypeName: "WRITE_ROWS_V2", Confidence: "partial"},
		// Confidence "none".
		{FileID: fid, Pos: 500, EndPos: 580, Size: 80, TS: 1002, TypeName: "XID", Confidence: "none"},
	})
	// 2 decode_errors rows.
	seedMetricsDecodeError(t, s, fid, 340)
	seedMetricsDecodeError(t, s, fid, 420)

	m := requireMetrics(t, s, fid)

	if m.Decode.Full != 3 {
		t.Errorf("Decode.Full = %d, want 3", m.Decode.Full)
	}
	if m.Decode.Partial != 2 {
		t.Errorf("Decode.Partial = %d, want 2", m.Decode.Partial)
	}
	if m.Decode.None != 1 {
		t.Errorf("Decode.None = %d, want 1", m.Decode.None)
	}
	if m.Decode.Errors != 2 {
		t.Errorf("Decode.Errors = %d, want 2 (rows in decode_errors table)", m.Decode.Errors)
	}
}

// TestMetricsDecodeHealthDefaultFull verifies that events inserted with an
// empty Confidence string are stored as "full" and counted accordingly.
func TestMetricsDecodeHealthDefaultFull(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_decodedefault.bin")

	// InsertEvents sets Confidence = "full" when field is empty.
	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 180, Size: 80, TS: 1000, TypeName: "QUERY"},
		{FileID: fid, Pos: 180, EndPos: 260, Size: 80, TS: 1000, TypeName: "XID"},
	})

	m := requireMetrics(t, s, fid)

	if m.Decode.Full != 2 {
		t.Errorf("Decode.Full = %d, want 2 (default confidence is full)", m.Decode.Full)
	}
	if m.Decode.Partial != 0 || m.Decode.None != 0 {
		t.Errorf("Decode.Partial=%d Decode.None=%d, both want 0", m.Decode.Partial, m.Decode.None)
	}
}

// TestMetricsLargestEvents seeds more than 5 events of varying size and
// asserts that exactly 5 are returned in size-desc order with correct fields.
func TestMetricsLargestEvents(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_largest.bin")

	// 8 events with sizes 10,20,30,40,50,60,70,80; top-5 are 80,70,60,50,40.
	evs := []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 110, Size: 10, TS: 1000, TypeName: "FORMAT_DESC"},
		{FileID: fid, Pos: 110, EndPos: 130, Size: 20, TS: 1001, TypeName: "ROTATE"},
		{FileID: fid, Pos: 130, EndPos: 160, Size: 30, TS: 1002, TypeName: "GTID"},
		{FileID: fid, Pos: 160, EndPos: 200, Size: 40, TS: 1003, TypeName: "QUERY"},
		{FileID: fid, Pos: 200, EndPos: 250, Size: 50, TS: 1004, TypeName: "TABLE_MAP"},
		{FileID: fid, Pos: 250, EndPos: 310, Size: 60, TS: 1005, TypeName: "WRITE_ROWS_V2"},
		{FileID: fid, Pos: 310, EndPos: 380, Size: 70, TS: 1006, TypeName: "UPDATE_ROWS_V2"},
		{FileID: fid, Pos: 380, EndPos: 460, Size: 80, TS: 1007, TypeName: "DELETE_ROWS_V2"},
	}
	seedMetricsEvents(t, s, evs)

	m := requireMetrics(t, s, fid)

	if len(m.LargestEvents) != 5 {
		t.Fatalf("LargestEvents len = %d, want exactly 5", len(m.LargestEvents))
	}

	wantSizes := []int64{80, 70, 60, 50, 40}
	wantTypes := []string{"DELETE_ROWS_V2", "UPDATE_ROWS_V2", "WRITE_ROWS_V2", "TABLE_MAP", "QUERY"}
	wantPos := []int64{380, 310, 250, 200, 160}
	wantTS := []int64{1007, 1006, 1005, 1004, 1003}

	for i := range wantSizes {
		ev := m.LargestEvents[i]
		if ev.Size != wantSizes[i] {
			t.Errorf("LargestEvents[%d].Size = %d, want %d", i, ev.Size, wantSizes[i])
		}
		if ev.TypeName != wantTypes[i] {
			t.Errorf("LargestEvents[%d].TypeName = %q, want %q", i, ev.TypeName, wantTypes[i])
		}
		if ev.Pos != wantPos[i] {
			t.Errorf("LargestEvents[%d].Pos = %d, want %d", i, ev.Pos, wantPos[i])
		}
		if ev.TS != wantTS[i] {
			t.Errorf("LargestEvents[%d].TS = %d, want %d", i, ev.TS, wantTS[i])
		}
	}
}

// TestMetricsLargestEventsCapped verifies at most 5 entries even with exactly 5.
func TestMetricsLargestEventsCapped(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_largestcap.bin")

	// Exactly 5 events; all 5 must appear.
	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 200, Size: 100, TS: 1000, TypeName: "QUERY"},
		{FileID: fid, Pos: 200, EndPos: 300, Size: 200, TS: 1001, TypeName: "QUERY"},
		{FileID: fid, Pos: 300, EndPos: 400, Size: 300, TS: 1002, TypeName: "QUERY"},
		{FileID: fid, Pos: 400, EndPos: 500, Size: 400, TS: 1003, TypeName: "QUERY"},
		{FileID: fid, Pos: 500, EndPos: 600, Size: 500, TS: 1004, TypeName: "QUERY"},
	})

	m := requireMetrics(t, s, fid)

	if len(m.LargestEvents) != 5 {
		t.Errorf("LargestEvents len = %d, want 5", len(m.LargestEvents))
	}
}

// TestMetricsSpanAndRates verifies FirstTS, LastTS, SpanSec, EventsPerSec,
// BytesPerSec for a multi-timestamp file.
func TestMetricsSpanAndRates(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_span.bin")

	// 4 events spanning ts 1000..1003 → span=3s.
	// Sizes: 100, 200, 300, 400 → total=1000.
	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fid, Pos: 100, EndPos: 200, Size: 100, TS: 1000, TypeName: "GTID"},
		{FileID: fid, Pos: 200, EndPos: 400, Size: 200, TS: 1001, TypeName: "QUERY"},
		{FileID: fid, Pos: 400, EndPos: 700, Size: 300, TS: 1002, TypeName: "WRITE_ROWS_V2"},
		{FileID: fid, Pos: 700, EndPos: 1100, Size: 400, TS: 1003, TypeName: "XID"},
	})

	m := requireMetrics(t, s, fid)

	if m.FirstTS != 1000 {
		t.Errorf("FirstTS = %d, want 1000", m.FirstTS)
	}
	if m.LastTS != 1003 {
		t.Errorf("LastTS = %d, want 1003", m.LastTS)
	}
	if m.SpanSec != 3 {
		t.Errorf("SpanSec = %d, want 3", m.SpanSec)
	}
	// EventsPerSec = 4 / 3 ≈ 1.333...
	wantEPS := float64(4) / float64(3)
	if math.Abs(m.EventsPerSec-wantEPS) > 0.001 {
		t.Errorf("EventsPerSec = %f, want ~%f", m.EventsPerSec, wantEPS)
	}
	// BytesPerSec = 1000 / 3 ≈ 333.333...
	wantBPS := float64(1000) / float64(3)
	if math.Abs(m.BytesPerSec-wantBPS) > 0.001 {
		t.Errorf("BytesPerSec = %f, want ~%f", m.BytesPerSec, wantBPS)
	}
}

// TestMetricsIsolation verifies that Metrics for file A is not polluted by
// events belonging to a different file B.
func TestMetricsIsolation(t *testing.T) {
	s := newTestStore(t)
	fidA := seedMetricsFile(t, s, "/data/metrics_isolA.bin")
	fidB := seedMetricsFile(t, s, "/data/metrics_isolB.bin")

	// File A: 2 events.
	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fidA, Pos: 100, EndPos: 200, Size: 100, TS: 1000, TypeName: "QUERY"},
		{FileID: fidA, Pos: 200, EndPos: 300, Size: 200, TS: 1001, TypeName: "QUERY"},
	})
	// File B: 5 events with large sizes that would pollute A's stats.
	seedMetricsEvents(t, s, []*EventRow{
		{FileID: fidB, Pos: 100, EndPos: 200, Size: 99999, TS: 2000, TypeName: "WRITE_ROWS_V2"},
		{FileID: fidB, Pos: 200, EndPos: 300, Size: 99999, TS: 2001, TypeName: "WRITE_ROWS_V2"},
		{FileID: fidB, Pos: 300, EndPos: 400, Size: 99999, TS: 2002, TypeName: "WRITE_ROWS_V2"},
		{FileID: fidB, Pos: 400, EndPos: 500, Size: 99999, TS: 2003, TypeName: "WRITE_ROWS_V2"},
		{FileID: fidB, Pos: 500, EndPos: 600, Size: 99999, TS: 2004, TypeName: "WRITE_ROWS_V2"},
	})

	mA := requireMetrics(t, s, fidA)

	if mA.Events != 2 {
		t.Errorf("file A: Events = %d, want 2 (must not include file B events)", mA.Events)
	}
	if mA.EventSize.Max != 200 {
		t.Errorf("file A: EventSize.Max = %d, want 200 (must not see file B's 99999)", mA.EventSize.Max)
	}
	if mA.EventSize.Total != 300 {
		t.Errorf("file A: EventSize.Total = %d, want 300", mA.EventSize.Total)
	}
}

// TestMetricsNonExistentFile verifies that calling Metrics on an unknown
// file_id returns an error (not a nil-dereference or silent empty result).
func TestMetricsNonExistentFile(t *testing.T) {
	s := newTestStore(t)
	_, err := s.Metrics(999999)
	if err == nil {
		t.Error("Metrics(nonexistent file) should return an error, got nil")
	}
}

// TestMetricsBucketingDMLBands asserts specifically that WRITE/UPDATE/DELETE
// row events are classified as DML (not Other) and QUERY as Query (not Other).
func TestMetricsBucketingDMLBands(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_bands.bin")

	// One of each DML type plus one QUERY plus one non-DML non-QUERY.
	dmlTypes := []string{
		"WRITE_ROWS_V2", "WRITE_ROWS_V1",
		"UPDATE_ROWS_V2", "UPDATE_ROWS_V1",
		"DELETE_ROWS_V2", "DELETE_ROWS_V1",
	}
	var evs []*EventRow
	for i, tn := range dmlTypes {
		evs = append(evs, &EventRow{
			FileID: fid, Pos: int64(100 + i*50), EndPos: int64(150 + i*50),
			Size: 50, TS: 1000, TypeName: tn,
		})
	}
	evs = append(evs, &EventRow{
		FileID: fid, Pos: 500, EndPos: 580, Size: 80, TS: 1000, TypeName: "QUERY",
	})
	evs = append(evs, &EventRow{
		FileID: fid, Pos: 580, EndPos: 620, Size: 40, TS: 1000, TypeName: "XID",
	})
	seedMetricsEvents(t, s, evs)

	m := requireMetrics(t, s, fid)

	var totalDML, totalQuery, totalOther int64
	for _, b := range m.Series {
		totalDML += b.DML
		totalQuery += b.Query
		totalOther += b.Other
	}
	if totalDML != 6 {
		t.Errorf("total DML = %d, want 6 (all 6 row-image types)", totalDML)
	}
	if totalQuery != 1 {
		t.Errorf("total Query = %d, want 1", totalQuery)
	}
	if totalOther != 1 {
		t.Errorf("total Other = %d, want 1 (XID)", totalOther)
	}
}

// TestMetricsTxnGTIDPreserved verifies that LargestTxns entries carry the
// correct GTID from the transactions table.
func TestMetricsTxnGTIDPreserved(t *testing.T) {
	s := newTestStore(t)
	fid := seedMetricsFile(t, s, "/data/metrics_gtid.bin")

	_ = seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "abc123:1",
		StartPos: 100, StartTS: 1000, CommitTS: 1005,
		EventCount: 7, Status: "committed",
	})
	_ = seedMetricsTxn(t, s, &Txn{
		FileID: fid, GTID: "abc123:2",
		StartPos: 200, StartTS: 2000, CommitTS: 2003,
		EventCount: 3, Status: "committed",
	})

	m := requireMetrics(t, s, fid)

	if len(m.LargestTxns) == 0 {
		t.Fatal("LargestTxns is empty")
	}
	// Largest is event_count=7 with GTID "abc123:1".
	if m.LargestTxns[0].GTID != "abc123:1" {
		t.Errorf("LargestTxns[0].GTID = %q, want %q", m.LargestTxns[0].GTID, "abc123:1")
	}
	if m.LargestTxns[0].Events != 7 {
		t.Errorf("LargestTxns[0].Events = %d, want 7", m.LargestTxns[0].Events)
	}
}
