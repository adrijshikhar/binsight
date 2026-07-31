package mysqlbinlog

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

// Adapter wraps the mysqlbinlog binary as an exec decoder.
type Adapter struct {
	bin string
}

// New returns the adapter using the given mysqlbinlog binary path
// ("mysqlbinlog" → resolve via PATH).
func New(bin string) *Adapter {
	if bin == "" {
		bin = "mysqlbinlog"
	}
	return &Adapter{bin: bin}
}

func (a *Adapter) Name() string { return "mysqlbinlog" }

func (a *Adapter) Capabilities() adapter.Capabilities {
	return adapter.Capabilities{FullScan: true, RowImages: true}
}

// Supports declares coverage: MySQL ≥5.6 (MariaDB compatibility is unproven).
// The lower bound is 5.6, not 5.x, because the modern mysqlbinlog client cannot
// read pre-5.6 V1 row binlogs — on a 5.5 log it bails with "Error in log format"
// after the first TABLE_MAP. 5.6+ emits V2 row events the client decodes. The
// conformance matrix proved this boundary (5.5 errors, 5.6 agrees with go-mysql).
func (a *Adapter) Supports(serverVersion string) bool {
	return adapter.VersionRange{Flavor: adapter.FlavorMySQL, Min: adapter.ServerVersion{Major: 5, Minor: 6}}.Supports(serverVersion)
}

// Available reports whether the binary can be spawned (Settings shows this).
// Bounded by a timeout so a hung/misbehaving binary can't block the caller
// (e.g. a Settings API handler) indefinitely.
func (a *Adapter) Available() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, a.bin, "--version").Output()
	if err != nil {
		return "", fmt.Errorf("mysqlbinlog not available: %w", err)
	}
	return string(out), nil
}

type execStream struct {
	events []*schema.Event
	i      int
	cmdErr error
}

func (s *execStream) Next() (*schema.Event, error) {
	if s.i >= len(s.events) {
		if s.cmdErr != nil {
			return nil, s.cmdErr
		}
		return nil, io.EOF
	}
	ev := s.events[s.i]
	s.i++
	return ev, nil
}

func (s *execStream) Close() error { return nil }

// Decode buffers parsed events in memory (text for a 10MB binlog ≈ tens of
// MB — acceptable; true line-streaming is a later optimization).
func (a *Adapter) Decode(ctx context.Context, src adapter.Source, opts adapter.DecodeOpts) (adapter.EventStream, error) {
	args := []string{"--base64-output=decode-rows", "-vv"}
	if opts.AtPos != 0 {
		// A row event can only be decoded with its preceding TABLE_MAP (which
		// defines table_id → db.table + column metadata), and that lives EARLIER
		// in the file. Seeking past it with --start-position yields an
		// undecodable row. So decode from the start, bounded by --stop-position
		// just past the target, so all table maps up to it are in scope. We then
		// return only the event at AtPos. (Cost: decodes up to AtPos — fine for
		// the single-event diff/detail path; AtPos==0 full decode is unchanged.)
		args = append(args, "--stop-position="+strconv.FormatUint(opts.AtPos+1, 10))
	} else if src.Offset > 4 {
		args = append(args, "--start-position="+strconv.FormatUint(src.Offset, 10))
	}
	args = append(args, src.Path)
	cmd := exec.CommandContext(ctx, a.bin, args...)
	// mysqlbinlog prints event timestamps in its local timezone; force UTC so the
	// parsed ts matches the raw UTC epoch go-mysql reads from the header (else
	// every event's header.ts disagrees by the local TZ offset). parseTS reads
	// the printed time as UTC, so the binary must emit UTC.
	cmd.Env = append(cmd.Environ(), "TZ=UTC")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("spawn %s: %w", a.bin, err)
	}
	// keepPos=AtPos: parse the whole prefix (so the row's TABLE_MAP is in scope)
	// but retain ONLY the target event — bounds memory to O(1) events instead of
	// buffering everything up to AtPos.
	events, parseErr := ParseText(stdout, opts.AtPos)
	waitErr := cmd.Wait()

	st := &execStream{events: events}
	if parseErr != nil {
		st.cmdErr = parseErr
	} else if waitErr != nil {
		st.cmdErr = fmt.Errorf("mysqlbinlog exited: %w", waitErr)
	}
	if opts.AtPos != 0 {
		// ParseText already kept only the AtPos event (or none). A successful
		// single-event seek clears any tail wait/parse error.
		if len(st.events) > 0 {
			st.events = st.events[:1]
			st.cmdErr = nil
		}
		return st, nil
	}
	if opts.Limit > 0 && len(st.events) > opts.Limit {
		st.events = st.events[:opts.Limit]
	}
	return st, nil
}
