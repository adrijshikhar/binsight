// Package adapter defines the Decoder interface — the ONLY contract the core
// knows about binlog parsing libraries — plus the registry that assigns
// adapters to roles (indexer/detail/diff/stream).
package adapter

import (
	"context"

	"github.com/adrijshikhar/binsight/internal/schema"
)

// BinlogHeaderEnd is the offset just past the 4-byte binlog magic — the
// FORMAT_DESCRIPTION event starts here. A resume offset must be strictly
// greater to be meaningful.
const BinlogHeaderEnd = 4

// Capabilities declares what a decoder can do; roles are validated against it.
type Capabilities struct {
	FullScan     bool // can stream a whole file with offsets → eligible as indexer
	SeekDecode   bool // can decode a single event at an offset → eligible for detail view
	ResumeDecode bool // can resume a full decode FROM an offset without re-parsing the prefix (true seek) → eligible for append-indexing
	RemoteStream bool // speaks replication protocol → live mode B (phase 2)
	RowImages    bool // decodes row values (vs structure only)
}

// Source identifies the binlog input a decoder should read.
type Source struct {
	Path string
	// Offset, when >4, asks the decoder to resume decoding AT this byte offset,
	// which MUST be an event boundary where no transaction is open (a committed
	// boundary) — callers gate on Capabilities.ResumeDecode. 0 = from start.
	Offset uint64
}

// DecodeOpts bounds a decode run (event count limit or single-event lookup).
type DecodeOpts struct {
	Limit int    // max events to emit; 0 = unlimited
	AtPos uint64 // if non-zero, emit only the event whose Header.Pos == AtPos
}

// EventStream yields normalized events; Next returns io.EOF when exhausted.
type EventStream interface {
	Next() (*schema.Event, error)
	Close() error
}

// Decoder is implemented by every binlog parser adapter (builtin or exec).
type Decoder interface {
	Name() string
	Capabilities() Capabilities
	// Supports reports whether this decoder can correctly handle a binlog
	// produced by the given server_version (from FORMAT_DESCRIPTION). The
	// registry resolver uses it to route per-file. Builtin adapters declare a
	// broad range until the conformance matrix proves a narrower one.
	Supports(serverVersion string) bool
	Decode(ctx context.Context, src Source, opts DecodeOpts) (EventStream, error)
}
