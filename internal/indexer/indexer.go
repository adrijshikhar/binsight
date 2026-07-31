// Package indexer streams normalized events from an adapter into the SQLite
// index. It owns the transaction state machine and per-table aggregation.
// Metadata only — row values are never stored.
package indexer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
	"github.com/adrijshikhar/binsight/internal/sqlkw"
	"github.com/adrijshikhar/binsight/internal/store"
)

const batchSize = 1000

// Progress is invoked periodically during indexing (SSE hub subscribes).
type Progress func(fileID int64, eventsIndexed int64, bytePos uint64)

// Indexer drives one adapter to build the index for files.
type Indexer struct {
	store   *store.Store
	decoder adapter.Decoder
}

// New returns an Indexer writing to s using decoder d.
func New(s *store.Store, d adapter.Decoder) *Indexer {
	return &Indexer{store: s, decoder: d}
}

// passResult is what one index pass (full or append) accumulated.
type passResult struct {
	deltas   map[string]*store.TableStat // key "db.table" — committed deltas only
	colTypes map[string]string           // latest column-types JSON per key (committed)
	sawDDL   bool                        // a committed QUERY in this pass was DDL
	boundary uint64                      // committed boundary: highest pos with no open txn
	nIndexed int64
}

// streamError wraps a decode-stream failure. Everything below res.boundary is
// intact; an append pass treats this as a truncated tail (partial flush) and
// finalizes at the boundary instead of failing.
type streamError struct{ err error }

func (e *streamError) Error() string { return e.err.Error() }
func (e *streamError) Unwrap() error { return e.err }

// IndexFile (re)indexes one file from scratch: clears prior data, streams
// events, writes batches, maintains the txn state machine, aggregates
// committed transactions, finalizes file state. On error the file is marked
// error state with the message.
func (ix *Indexer) IndexFile(ctx context.Context, f *store.File, progress Progress) error {
	if err := ix.store.ClearFileIndex(f.ID); err != nil {
		return ix.fail(f, err)
	}
	res, err := ix.run(ctx, f, 0, progress)
	if err != nil {
		return ix.fail(f, err)
	}
	for key, agg := range res.deltas {
		if ct, ok := res.colTypes[key]; ok {
			agg.ColumnTypesJSON = ct
		} else {
			agg.ColumnTypesJSON = "[]"
		}
		// After ClearFileIndex, replace-from-zero and add are equivalent.
		if err := ix.store.UpsertTableStat(agg); err != nil {
			return ix.fail(f, err)
		}
	}
	f.State = store.FileStateReady
	f.IndexedByAdapter = ix.decoder.Name()
	f.LastIndexedOffset = int64(res.boundary)
	if progress != nil {
		progress(f.ID, res.nIndexed, res.boundary)
	}
	return ix.store.UpsertFile(f)
}

// IndexAppend indexes only the region at/after f.LastIndexedOffset (a
// committed boundary established by a prior pass). It deletes the previously
// indexed open tail, resumes decode at the boundary (ResumeDecode-gated by
// the caller), and atomically applies stat deltas + the boundary advance.
// Returns whether the appended tail contained DDL (the caller rebuilds the
// schema only then). On error the caller falls back to a full IndexFile —
// IndexAppend does NOT mark the file error state itself.
//
// Crash-safety spans three transactions, not one giant one: DeleteIndexedFrom
// clears the old tail (A), run's batched event/txn inserts land next (B..N),
// and FinalizeAppend commits the stat deltas + boundary advance last (Z).
// Idempotency comes from delete-from + the un-advanced boundary: a crash
// between B..N and Z leaves event rows orphaned above the old boundary, which
// the next pass's DeleteIndexedFrom (or a full re-index while still 'indexing')
// reclaims — never from a single all-encompassing transaction.
func (ix *Indexer) IndexAppend(ctx context.Context, f *store.File, progress Progress) (bool, error) {
	resume := f.LastIndexedOffset
	if resume <= adapter.BinlogHeaderEnd {
		return false, fmt.Errorf("append: no resume boundary for file %d", f.ID)
	}
	if err := ix.store.DeleteIndexedFrom(f.ID, resume); err != nil {
		return false, err
	}
	res, err := ix.run(ctx, f, uint64(resume), progress)
	if err != nil {
		var se *streamError
		if !errors.As(err, &se) || res == nil || res.boundary <= uint64(resume) {
			// Store error, or a stream error with zero progress (first tail
			// event already unreadable) — let the caller fall back to full.
			return false, err
		}
		// Truncated tail (partial flush mid-write): everything up to
		// res.boundary is committed and intact. Finalize there; the next scan
		// resumes the rest.
		log.Printf("indexer: file %d: tail truncated at %d, finalizing early (next scan resumes): %v",
			f.ID, res.boundary, err)
	}
	deltas := make([]*store.TableStat, 0, len(res.deltas))
	// An empty ColumnTypesJSON deliberately means "preserve what's persisted":
	// FinalizeAppend only replaces column types when the delta carries a
	// non-empty value (a tail with rows but no new TABLE_MAP must not clobber
	// the types learned by the original pass). IndexFile, by contrast, writes
	// "[]" because it replaces from scratch.
	for key, agg := range res.deltas {
		if ct, ok := res.colTypes[key]; ok {
			agg.ColumnTypesJSON = ct
		}
		deltas = append(deltas, agg)
	}
	f.State = store.FileStateReady
	f.IndexedByAdapter = ix.decoder.Name()
	f.LastIndexedOffset = int64(res.boundary)
	if err := ix.store.FinalizeAppend(f, deltas); err != nil {
		return false, err
	}
	if progress != nil {
		progress(f.ID, res.nIndexed, res.boundary)
	}
	return res.sawDDL, nil
}

// run is the shared index core: decode from `resume` (0 = full file), drive
// the txn state machine, batch event inserts, and aggregate per COMMITTED
// transaction. The returned passResult is valid even when err is a
// *streamError (partial tail). Store errors return res=nil.
func (ix *Indexer) run(ctx context.Context, f *store.File, resume uint64, progress Progress) (*passResult, error) {
	stream, err := ix.decoder.Decode(ctx, adapter.Source{Path: f.Path, Offset: resume}, adapter.DecodeOpts{})
	if err != nil {
		return nil, err
	}
	defer stream.Close()

	res := &passResult{
		deltas:   map[string]*store.TableStat{},
		colTypes: map[string]string{},
		boundary: resume,
	}
	var (
		batch   []*store.EventRow
		openTxn *store.Txn
		lastPos = resume
		// scratch holds the OPEN txn's aggregates; merged into res.deltas on
		// commit, dropped on incomplete close. Standalone events (no open txn)
		// aggregate straight into res — they are committed by construction.
		scratchAgg map[string]*store.TableStat
		scratchCT  map[string]string
	)
	resetScratch := func() {
		scratchAgg = map[string]*store.TableStat{}
		scratchCT = map[string]string{}
	}
	resetScratch()

	aggFor := func(key, db, table string, m map[string]*store.TableStat) *store.TableStat {
		a := m[key]
		if a == nil {
			a = &store.TableStat{FileID: f.ID, DBName: db, TableName: table}
			m[key] = a
		}
		return a
	}
	mergeScratch := func() {
		for key, sa := range scratchAgg {
			a := aggFor(key, sa.DBName, sa.TableName, res.deltas)
			a.Inserts += sa.Inserts
			a.Updates += sa.Updates
			a.Deletes += sa.Deletes
			a.RowsTotal += sa.RowsTotal
			a.BytesTotal += sa.BytesTotal
			a.TableMapCount += sa.TableMapCount
		}
		for key, ct := range scratchCT {
			res.colTypes[key] = ct
		}
		resetScratch()
	}

	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		if err := ix.store.InsertEvents(batch); err != nil {
			return err
		}
		batch = batch[:0]
		return nil
	}

	closeTxn := func(status string, endPos int64, commitTS int64) error {
		if openTxn == nil {
			return nil
		}
		if status == "committed" {
			mergeScratch()
		} else {
			resetScratch() // incomplete: its aggregates never count
		}
		openTxn.Status = status
		openTxn.EndPos = endPos
		openTxn.CommitTS = commitTS
		err := ix.store.UpdateTxn(openTxn)
		openTxn = nil
		return err
	}

	// handleEvent runs the txn state machine for one event: the event-type
	// switch mutates loop state (openTxn, row.TxnID, res.sawDDL, f fields) and
	// the trailing membership rule attaching non-control events to the open txn.
	// Kept as a closure (not a method) precisely because it threads that shared
	// state. A returned error is a store failure — the caller maps it to res=nil.
	handleEvent := func(ev *schema.Event, row *store.EventRow) error {
		switch ev.Header.TypeName {
		case "FORMAT_DESCRIPTION":
			f.FormatVersion = 4
			if ev.Decoded != nil {
				if i := strings.Index(ev.Decoded.SQL, "server "); i >= 0 {
					f.ServerVersion = strings.TrimSpace(ev.Decoded.SQL[i+7:])
				}
			}
			if ev.Native != nil {
				var n struct {
					ChecksumAlgorithm int `json:"checksum_algorithm"`
				}
				if json.Unmarshal(ev.Native, &n) == nil && n.ChecksumAlgorithm == 1 {
					f.ChecksumAlgo = "CRC32"
				}
			}
		case "GTID", "ANONYMOUS_GTID":
			if err := closeTxn("incomplete", row.Pos, 0); err != nil {
				return err
			}
			gtid := "ANONYMOUS"
			if ev.Decoded != nil && ev.Decoded.GTID != "" {
				gtid = ev.Decoded.GTID
			}
			t := &store.Txn{FileID: f.ID, GTID: gtid, StartPos: row.Pos,
				StartTS: row.TS, Status: "incomplete"}
			if _, err := ix.store.InsertTxn(t); err != nil {
				return err
			}
			openTxn = t
		case "MARIA_GTID":
			// MariaDB's GTID event opens a transaction (no BEGIN QUERY in the
			// row-based flavor); the trailing XID commits it. A STANDALONE GTID
			// fronts a single non-transactional statement (DDL) — it must NOT
			// open a txn, mirroring how MySQL DDL stays out of the txn machine.
			if err := closeTxn("incomplete", row.Pos, 0); err != nil {
				return err
			}
			if !mariaGTIDStandalone(ev) {
				gtid := "ANONYMOUS"
				if ev.Decoded != nil && ev.Decoded.GTID != "" {
					gtid = ev.Decoded.GTID
				}
				t := &store.Txn{FileID: f.ID, GTID: gtid, StartPos: row.Pos,
					StartTS: row.TS, Status: "incomplete"}
				if _, err := ix.store.InsertTxn(t); err != nil {
					return err
				}
				openTxn = t
			}
		case "QUERY":
			sql := ""
			if ev.Decoded != nil {
				sql = strings.TrimSpace(ev.Decoded.SQL)
			}
			if strings.EqualFold(sql, "BEGIN") {
				if openTxn == nil {
					t := &store.Txn{FileID: f.ID, GTID: "ANONYMOUS", StartPos: row.Pos,
						StartTS: row.TS, Status: "incomplete"}
					if _, err := ix.store.InsertTxn(t); err != nil {
						return err
					}
					openTxn = t
				}
			} else {
				if sqlkw.IsDDL(sql) {
					res.sawDDL = true
				}
				if openTxn != nil {
					openTxn.EventCount++
					row.TxnID = openTxn.ID
					if err := closeTxn("committed", row.EndPos, row.TS); err != nil {
						return err
					}
				}
			}
		case "XID":
			if openTxn != nil {
				openTxn.EventCount++
				row.TxnID = openTxn.ID
				if err := closeTxn("committed", row.EndPos, row.TS); err != nil {
					return err
				}
			}
		case "DECODE_ERROR":
			var raw []byte
			if ev.Native != nil {
				var n struct {
					RawExcerpt []byte `json:"raw_excerpt"`
				}
				_ = json.Unmarshal(ev.Native, &n)
				raw = n.RawExcerpt
			}
			if derr := ix.store.InsertDecodeError(&store.DecodeError{
				FileID: f.ID, Pos: row.Pos, Adapter: ix.decoder.Name(),
				Message: ev.Error, RawExcerpt: raw,
			}); derr != nil {
				log.Printf("indexer: file %d: record decode error at pos %d failed: %v", f.ID, row.Pos, derr)
			}
		}

		if openTxn != nil && row.TxnID == 0 &&
			ev.Header.TypeName != "FORMAT_DESCRIPTION" &&
			ev.Header.TypeName != "PREVIOUS_GTIDS" &&
			ev.Header.TypeName != "ROTATE" && ev.Header.TypeName != "STOP" {
			row.TxnID = openTxn.ID
			openTxn.EventCount++
		}
		return nil
	}

	// aggregate folds an event's row counts / TABLE_MAP column-types into the
	// open txn's scratch (counted only on commit) or straight into the pass
	// result for standalone events. Mutates openTxn's per-txn row tallies too.
	aggregate := func(ev *schema.Event, row *store.EventRow) {
		aggTarget, ctTarget := res.deltas, res.colTypes
		if openTxn != nil {
			aggTarget, ctTarget = scratchAgg, scratchCT
		}
		if ev.Decoded != nil && len(ev.Decoded.Rows) > 0 {
			n := int64(len(ev.Decoded.Rows))
			key := ev.Decoded.DB + "." + ev.Decoded.Table
			agg := aggFor(key, ev.Decoded.DB, ev.Decoded.Table, aggTarget)
			switch ev.Header.TypeName {
			case "WRITE_ROWS_V2", "WRITE_ROWS_V1":
				agg.Inserts += n
				if openTxn != nil {
					openTxn.RowsInserted += n
				}
			case "UPDATE_ROWS_V2", "UPDATE_ROWS_V1":
				agg.Updates += n
				if openTxn != nil {
					openTxn.RowsUpdated += n
				}
			case "DELETE_ROWS_V2", "DELETE_ROWS_V1":
				agg.Deletes += n
				if openTxn != nil {
					openTxn.RowsDeleted += n
				}
			}
			agg.RowsTotal += n
			agg.BytesTotal += row.Size
		}
		if ev.Header.TypeName == "TABLE_MAP" && ev.Decoded != nil {
			key := ev.Decoded.DB + "." + ev.Decoded.Table
			agg := aggFor(key, ev.Decoded.DB, ev.Decoded.Table, aggTarget)
			agg.TableMapCount++
			if len(ev.Decoded.ColumnTypes) > 0 {
				b, _ := json.Marshal(ev.Decoded.ColumnTypes)
				ctTarget[key] = string(b)
			}
		}
	}

	for {
		ev, err := stream.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			if ferr := flush(); ferr != nil {
				log.Printf("indexer: file %d: flush on stream error failed: %v", f.ID, ferr)
			}
			if openTxn != nil {
				res.boundary = uint64(openTxn.StartPos)
			}
			if cerr := closeTxn("incomplete", int64(lastPos), 0); cerr != nil {
				log.Printf("indexer: file %d: close open txn on stream error failed: %v", f.ID, cerr)
			}
			return res, &streamError{err}
		}
		lastPos = ev.Header.NextPos
		row := toRow(f.ID, ev)

		if err := handleEvent(ev, row); err != nil {
			return nil, err
		}
		aggregate(ev, row)

		batch = append(batch, row)
		res.nIndexed++
		// The committed boundary advances only while no txn is open. (After a
		// GTID/BEGIN it freezes at that txn's StartPos until commit.)
		if openTxn == nil {
			res.boundary = lastPos
		}
		if len(batch) >= batchSize {
			if err := flush(); err != nil {
				return nil, err
			}
			if progress != nil {
				progress(f.ID, res.nIndexed, lastPos)
			}
		}
	}

	if err := flush(); err != nil {
		return nil, err
	}
	if openTxn != nil {
		res.boundary = uint64(openTxn.StartPos)
	}
	if err := closeTxn("incomplete", int64(lastPos), 0); err != nil {
		return nil, err
	}
	return res, nil
}

func (ix *Indexer) fail(f *store.File, err error) error {
	f.State = store.FileStateError
	f.Error = err.Error()
	if uerr := ix.store.UpsertFile(f); uerr != nil {
		// If we can't persist the error state the file stays "indexing" and is
		// skipped forever — make the secondary failure visible.
		return fmt.Errorf("%w; also failed to persist error state: %v", err, uerr)
	}
	return err
}

// mariaGTIDStandalone reports whether a MARIA_GTID event is STANDALONE (fronts
// a single non-transactional statement such as DDL) rather than opening a
// transaction. The gomysql adapter records the flag in the event's native
// metadata; a missing/false flag means a transaction-opening GTID.
func mariaGTIDStandalone(ev *schema.Event) bool {
	if ev.Native == nil {
		return false
	}
	var n struct {
		Standalone bool `json:"maria_gtid_standalone"`
	}
	_ = json.Unmarshal(ev.Native, &n)
	return n.Standalone
}

func toRow(fileID int64, ev *schema.Event) *store.EventRow {
	row := &store.EventRow{
		FileID: fileID, Pos: int64(ev.Header.Pos), EndPos: int64(ev.Header.NextPos),
		Size: int64(ev.Header.Size), TS: int64(ev.Header.Timestamp),
		TypeCode: int(ev.Header.TypeCode), TypeName: ev.Header.TypeName,
		ServerID: int64(ev.Header.ServerID), Flags: int(ev.Header.Flags),
		Summary: ev.Summary(), Confidence: ev.Confidence,
	}
	if d := ev.Decoded; d != nil {
		row.TableID = int64(d.TableID)
		row.DBName = d.DB
		row.TableName = d.Table
		row.RowsCount = int64(len(d.Rows))
	}
	return row
}
