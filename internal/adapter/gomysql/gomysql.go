// Package gomysql is the builtin adapter wrapping
// github.com/go-mysql-org/go-mysql/replication. It is the default indexer
// but holds no special status — just adapter #1 behind the Decoder interface.
package gomysql

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/go-mysql-org/go-mysql/replication"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

// Adapter decodes binlog files via the go-mysql replication parser.
type Adapter struct{}

// New returns the builtin go-mysql adapter.
func New() *Adapter { return &Adapter{} }

func (a *Adapter) Name() string { return "go-mysql" }

func (a *Adapter) Capabilities() adapter.Capabilities {
	return adapter.Capabilities{FullScan: true, SeekDecode: true, ResumeDecode: true, RemoteStream: true, RowImages: true}
}

// Supports declares go-mysql's coverage. It currently claims a broad range
// (MySQL ≥5, MariaDB ≥10); the conformance matrix will narrow this as real
// decode gaps surface (version-testing spec §8).
func (a *Adapter) Supports(serverVersion string) bool {
	for _, r := range []adapter.VersionRange{
		{Flavor: adapter.FlavorMySQL, Min: adapter.ServerVersion{Major: 5}},
		{Flavor: adapter.FlavorMariaDB, Min: adapter.ServerVersion{Major: 10}},
	} {
		if r.Supports(serverVersion) {
			return true
		}
	}
	return false
}

type stream struct {
	ch     chan *schema.Event
	errCh  chan error
	cancel context.CancelFunc
	done   bool
	err    error
}

func (s *stream) Next() (*schema.Event, error) {
	if s.done {
		return nil, s.err
	}
	ev, ok := <-s.ch
	if !ok {
		s.done = true
		s.err = <-s.errCh
		if s.err == nil {
			s.err = io.EOF
		}
		return nil, s.err
	}
	return ev, nil
}

func (s *stream) Close() error {
	s.cancel()
	for range s.ch { // drain so the producer goroutine exits
	}
	return nil
}

// errStop aborts ParseFile early without reporting an error.
var errStop = errors.New("stop requested")

// isStop reports whether err is (or wraps) errStop. go-mysql wraps callback
// errors via pingcap/errors.Trace which implements Unwrap, so errors.Is
// correctly unwraps the chain.
func isStop(err error) bool {
	return errors.Is(err, errStop)
}

func (a *Adapter) Decode(ctx context.Context, src adapter.Source, opts adapter.DecodeOpts) (adapter.EventStream, error) {
	if opts.AtPos != 0 {
		// AtPos is an exact single-event lookup; a simultaneous Offset could
		// skip past it and silently yield zero events. AtPos wins.
		src.Offset = 0
	}
	if src.Offset > adapter.BinlogHeaderEnd {
		return a.decodeResume(ctx, src, opts)
	}
	ctx, cancel := context.WithCancel(ctx)
	st := &stream{ch: make(chan *schema.Event, 64), errCh: make(chan error, 1), cancel: cancel}

	go func() {
		defer close(st.ch)
		p := replication.NewBinlogParser()
		// TIMESTAMP columns are a UTC epoch on disk; go-mysql renders them through
		// time.Local unless pinned, which would make decode output host-dependent
		// (and disagree with the mysqlbinlog adapter, which is spawned with TZ=UTC).
		p.SetTimestampStringLocation(time.UTC)
		// Parsing always starts at offset 4: the parser needs FORMAT_DESCRIPTION
		// (at pos 4) for checksum detection. A requested opts.AtPos is honored by
		// skipping events until we reach it — ParseFile must NOT be called with
		// offset > 4. (src.Offset > 4 takes the true-seek decodeResume path.)
		count := 0
		var runPos uint64 = 4 // running stream offset; the first event (FDE) is at 4
		err := p.ParseFile(src.Path, 4, func(be *replication.BinlogEvent) error {
			select {
			case <-ctx.Done():
				return errStop
			default:
			}
			// pos is a running BYTE-OFFSET accumulator (starts at 4, advances by
			// each event's size). We deliberately do NOT trust the event header's
			// LogPos: it is a uint32 and WRAPS at 4 GiB. A single transaction
			// larger than 4 GiB forces a binlog file larger than 4 GiB (rotation
			// defers until COMMIT); LogPos then wraps and using LogPos-size yields
			// wrapped, colliding positions that corrupt LastIndexedOffset. The
			// accumulator is the true offset and is wrap-immune; it also naturally
			// handles MariaDB inline events (e.g. ANNOTATE_ROWS) that carry
			// LogPos=0. EventSize is the authoritative event-length field go-mysql
			// uses to advance the stream anyway. See CLAUDE.md gotcha #1.
			size := uint64(be.Header.EventSize)
			pos := runPos
			endPos := pos + size
			runPos = endPos
			if opts.AtPos != 0 && pos != opts.AtPos {
				if pos > opts.AtPos {
					return errStop // passed it; nothing to find
				}
				return nil
			}
			ev := convert(be, pos, endPos)
			select {
			case st.ch <- ev:
			case <-ctx.Done():
				return errStop
			}
			count++
			if opts.AtPos != 0 || (opts.Limit > 0 && count >= opts.Limit) {
				return errStop
			}
			return nil
		})
		if err != nil && !isStop(err) {
			st.errCh <- err
			return
		}
		st.errCh <- nil
	}()
	return st, nil
}

// binlogMagic is the 4-byte binlog file header.
var binlogMagic = []byte{0xfe, 0x62, 0x69, 0x6e}

// decodeResume resumes a full decode at src.Offset without re-parsing the
// prefix (true seek). The parser needs the FORMAT_DESCRIPTION (at pos 4) for
// checksum/header-length state, so it is parsed once and DISCARDED, then the
// reader is seeked to the offset and parsing continues from there. src.Offset
// must be an event boundary where no transaction is open — the caller
// guarantees this (Capabilities.ResumeDecode contract).
func (a *Adapter) decodeResume(ctx context.Context, src adapter.Source, opts adapter.DecodeOpts) (adapter.EventStream, error) {
	f, err := os.Open(src.Path)
	if err != nil {
		return nil, err
	}
	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil || !bytes.Equal(magic, binlogMagic) {
		_ = f.Close()
		return nil, fmt.Errorf("resume %s: bad binlog magic", src.Path)
	}
	p := replication.NewBinlogParser()
	p.SetTimestampStringLocation(time.UTC) // see Decode: keep TIMESTAMP host-independent
	// Prime p.format from the FDE at pos 4; the event itself is discarded
	// (its pos is below the resume offset). Do NOT Reset() afterwards.
	if _, err := p.ParseSingleEvent(f, func(*replication.BinlogEvent) error { return nil }); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("resume %s: prime FORMAT_DESCRIPTION: %w", src.Path, err)
	}
	if _, err := f.Seek(int64(src.Offset), io.SeekStart); err != nil {
		_ = f.Close()
		return nil, err
	}

	ctx, cancel := context.WithCancel(ctx)
	st := &stream{ch: make(chan *schema.Event, 64), errCh: make(chan error, 1), cancel: cancel}
	go func() {
		defer close(st.ch)
		defer f.Close()
		count := 0
		// runPos starts at the resume offset — NOT 4 — and is a true byte-offset
		// accumulator. We do NOT trust LogPos (uint32, wraps at 4 GiB; see the
		// main decode path and CLAUDE.md gotcha #1). The accumulator stays
		// correct past 4 GiB and handles MariaDB LogPos=0 inline events.
		runPos := src.Offset
		err := p.ParseReader(f, func(be *replication.BinlogEvent) error {
			select {
			case <-ctx.Done():
				return errStop
			default:
			}
			size := uint64(be.Header.EventSize)
			pos := runPos
			endPos := pos + size
			runPos = endPos
			ev := convert(be, pos, endPos)
			select {
			case st.ch <- ev:
			case <-ctx.Done():
				return errStop
			}
			count++
			if opts.Limit > 0 && count >= opts.Limit {
				return errStop
			}
			return nil
		})
		if err != nil && !isStop(err) {
			st.errCh <- err
			return
		}
		st.errCh <- nil
	}()
	return st, nil
}

var staticNativeGoMySQL = json.RawMessage(`{"adapter":"go-mysql"}`)

// convert maps a go-mysql event into the normalized schema. nextPos is the
// computed end offset (pos+size) — used instead of the raw LogPos so MariaDB
// inline events with LogPos=0 still chain contiguously.
func convert(be *replication.BinlogEvent, pos, nextPos uint64) *schema.Event {
	h := schema.Header{
		Pos:       pos,
		Timestamp: be.Header.Timestamp,
		TypeCode:  byte(be.Header.EventType),
		TypeName:  schema.TypeName(byte(be.Header.EventType)),
		ServerID:  be.Header.ServerID,
		Size:      be.Header.EventSize,
		NextPos:   nextPos,
		Flags:     be.Header.Flags,
	}
	ev := &schema.Event{
		SchemaVersion: schema.Version,
		Header:        h,
		Confidence:    schema.ConfidenceFull,
		Native:        staticNativeGoMySQL,
	}

	switch e := be.Event.(type) {
	case *replication.FormatDescriptionEvent:
		ev.Decoded = &schema.Decoded{SQL: fmt.Sprintf("binlog v%d, server %s", e.Version, e.ServerVersion)}
		ev.Native = fmt.Appendf(nil, `{"adapter":"go-mysql","checksum_algorithm":%d}`, e.ChecksumAlgorithm)
	case *replication.QueryEvent:
		ev.Decoded = &schema.Decoded{DB: string(e.Schema), SQL: string(e.Query)}
	case *replication.XIDEvent:
		ev.Decoded = &schema.Decoded{XID: uint64(e.XID)}
	case *replication.GTIDEvent:
		gtid := "ANONYMOUS"
		if h.TypeCode != 0x22 { // not ANONYMOUS_GTID
			gtid = gtidString(e)
		}
		ev.Decoded = &schema.Decoded{GTID: gtid}
	case *replication.MariadbGTIDEvent:
		// MariaDB's GTID event opens a transaction (the flavor has no BEGIN
		// QUERY for row-based txns). A STANDALONE GTID precedes a single
		// non-transactional statement (e.g. DDL) and must NOT open a txn — the
		// indexer keys off native["maria_gtid_standalone"] to decide.
		ev.Decoded = &schema.Decoded{GTID: e.GTID.String()}
		ev.Native = fmt.Appendf(nil, `{"adapter":"go-mysql","maria_gtid_standalone":%t}`, e.IsStandalone())
	case *replication.TableMapEvent:
		cols := make([]string, len(e.ColumnType))
		for i, c := range e.ColumnType {
			cols[i] = schema.ColumnTypeName(c)
		}
		ev.Decoded = &schema.Decoded{
			DB: string(e.Schema), Table: string(e.Table),
			TableID: e.TableID, ColumnTypes: cols,
		}
		// Column names are only present when the source binlog was written with
		// FULL row metadata (binlog_row_metadata=FULL, MySQL 8.0+). go-mysql
		// leaves ColumnName nil for the MINIMAL default — leave Decoded.ColumnNames
		// nil too so the UI falls back to positional @1..@n.
		if len(e.ColumnName) == len(e.ColumnType) {
			names := make([]string, len(e.ColumnName))
			for i, n := range e.ColumnName {
				names[i] = string(n)
			}
			ev.Decoded.ColumnNames = names
		}
	case *replication.RowsEvent:
		d := &schema.Decoded{
			DB: string(e.Table.Schema), Table: string(e.Table.Table), TableID: e.Table.TableID,
		}
		isUpdate := h.TypeName == "UPDATE_ROWS_V2" || h.TypeName == "UPDATE_ROWS_V1" || h.TypeName == "PARTIAL_UPDATE_ROWS"
		isDelete := h.TypeName == "DELETE_ROWS_V2" || h.TypeName == "DELETE_ROWS_V1"
		if isUpdate {
			// go-mysql emits update rows as [before, after, before, after, ...]
			d.Rows = make([]schema.RowImage, 0, len(e.Rows)/2)
			for i := 0; i+1 < len(e.Rows); i += 2 {
				d.Rows = append(d.Rows, schema.RowImage{
					Before: normalizeRow(e.Rows[i]), After: normalizeRow(e.Rows[i+1]),
				})
			}
		} else if isDelete {
			d.Rows = make([]schema.RowImage, 0, len(e.Rows))
			for _, r := range e.Rows {
				d.Rows = append(d.Rows, schema.RowImage{Before: normalizeRow(r)})
			}
		} else {
			d.Rows = make([]schema.RowImage, 0, len(e.Rows))
			for _, r := range e.Rows {
				d.Rows = append(d.Rows, schema.RowImage{After: normalizeRow(r)})
			}
		}
		ev.Decoded = d
	case *replication.RotateEvent:
		ev.Decoded = &schema.Decoded{SQL: fmt.Sprintf("rotate to %s pos %d", e.NextLogName, e.Position)}
	case *replication.RowsQueryEvent:
		ev.Decoded = &schema.Decoded{SQL: string(e.Query)}
	}
	return ev
}

// gtidString builds a canonical "uuid:gno" string from a GTIDEvent.
// GTIDNext() is available in go-mysql v1.15.0 and returns a GTIDSet whose
// String() yields the standard MySQL GTID notation (uuid:gno).
func gtidString(e *replication.GTIDEvent) string {
	gs, err := e.GTIDNext()
	if err != nil || gs == nil {
		return fmt.Sprintf("GTID_ERROR(%v)", err)
	}
	return gs.String()
}

// normalizeRow applies canonical renderings: []byte → string,
// time.Time → UTC RFC3339. Everything else passes through.
func normalizeRow(row []any) []any {
	out := make([]any, len(row))
	for i, v := range row {
		switch x := v.(type) {
		case []byte:
			out[i] = string(x)
		case time.Time:
			out[i] = x.UTC().Format(time.RFC3339)
		default:
			out[i] = v
		}
	}
	return out
}
