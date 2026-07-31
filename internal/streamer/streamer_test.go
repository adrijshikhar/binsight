package streamer

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/go-mysql-org/go-mysql/replication"

	"github.com/adrijshikhar/binsight/internal/config"
)

func TestBackoffDelay(t *testing.T) {
	for _, tc := range []struct {
		attempt int
		want    time.Duration
	}{
		{0, time.Second}, {1, 2 * time.Second}, {2, 4 * time.Second},
		{5, 32 * time.Second}, {6, 60 * time.Second}, {50, 60 * time.Second},
	} {
		if got := backoffDelay(tc.attempt); got != tc.want {
			t.Errorf("backoffDelay(%d) = %v, want %v", tc.attempt, got, tc.want)
		}
	}
}

// mkEvent fabricates a replication event with given type/logPos/flags and a
// raw payload of n bytes.
func mkEvent(typ replication.EventType, logPos uint32, flags uint16, n int, inner replication.Event) *replication.BinlogEvent {
	return &replication.BinlogEvent{
		RawData: make([]byte, n),
		Header:  &replication.EventHeader{EventType: typ, LogPos: logPos, Flags: flags, Timestamp: 1000},
		Event:   inner,
	}
}

func newTestStreamer(t *testing.T) (*Streamer, *[]Status) {
	t.Helper()
	var notifications []Status
	s := New(config.Stream{Flavor: "mysql"}, t.TempDir(), nil,
		func() error { return nil },
		func(st Status) { notifications = append(notifications, st) })
	return s, &notifications
}

func TestHandleEventFlow(t *testing.T) {
	s, _ := newTestStreamer(t)
	if err := s.spool.OpenAt("mysql-bin.000001", 0); err != nil {
		t.Fatal(err)
	}
	// heartbeat: ignored entirely
	if err := s.handleEvent(mkEvent(replication.HEARTBEAT_EVENT, 0, 0, 40, nil)); err != nil {
		t.Fatal(err)
	}
	// artificial rotate naming the SAME file: no write, no reopen
	art := mkEvent(replication.ROTATE_EVENT, 0, replication.LOG_EVENT_ARTIFICIAL_F, 40,
		&replication.RotateEvent{NextLogName: []byte("mysql-bin.000001"), Position: 4})
	if err := s.handleEvent(art); err != nil {
		t.Fatal(err)
	}
	if _, size := s.spool.Current(); size != 4 {
		t.Fatalf("artificial rotate must not write: size %d", size)
	}
	// FDE with LogPos=0 on a fresh file: appended positionless
	if err := s.handleEvent(mkEvent(replication.FORMAT_DESCRIPTION_EVENT, 0, 0, 120, nil)); err != nil {
		t.Fatal(err)
	}
	if _, size := s.spool.Current(); size != 124 {
		t.Fatalf("fde append: size %d, want 124", size)
	}
	// normal event
	if err := s.handleEvent(mkEvent(replication.WRITE_ROWS_EVENTv2, 224, 0, 100, nil)); err != nil {
		t.Fatal(err)
	}
	// real rotate: bytes written to old file, then spool switches files
	rot := mkEvent(replication.ROTATE_EVENT, 268, 0, 44,
		&replication.RotateEvent{NextLogName: []byte("mysql-bin.000002"), Position: 4})
	if err := s.handleEvent(rot); err != nil {
		t.Fatal(err)
	}
	name, size := s.spool.Current()
	if name != "mysql-bin.000002" || size != 4 {
		t.Errorf("after real rotate: %s %d", name, size)
	}
	// FDE with LogPos=0 on a NON-fresh file: skipped (reconnect resend)
	if err := s.spool.OpenAt("mysql-bin.000002", 4); err != nil {
		t.Fatal(err)
	}
	if err := s.handleEvent(mkEvent(replication.FORMAT_DESCRIPTION_EVENT, 124, 0, 120, nil)); err != nil {
		t.Fatal(err)
	}
	if err := s.handleEvent(mkEvent(replication.QUERY_EVENT, 224, 0, 100, nil)); err != nil {
		t.Fatal(err)
	}
	if err := s.handleEvent(mkEvent(replication.FORMAT_DESCRIPTION_EVENT, 0, 0, 120, nil)); err != nil {
		t.Fatal(err)
	}
	if _, size := s.spool.Current(); size != 224 {
		t.Errorf("LogPos=0 FDE on non-fresh file must be skipped: size %d", size)
	}
}

func TestSetStateNotifiesOnChangeOnly(t *testing.T) {
	s, notes := newTestStreamer(t)
	s.setState(StateConnecting, "")
	s.setState(StateConnecting, "")
	s.setState(StateStreaming, "")
	if len(*notes) != 2 {
		t.Errorf("notifications = %d, want 2 (dedup unchanged state)", len(*notes))
	}
	if s.Status().State != StateStreaming {
		t.Errorf("status = %+v", s.Status())
	}
}

// TestStopBeforeStartIsNoop verifies that calling Stop on a never-started
// Streamer neither panics nor blocks.
func TestStopBeforeStartIsNoop(t *testing.T) {
	s, _ := newTestStreamer(t)
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.Stop()
	}()
	select {
	case <-done:
		// pass
	case <-time.After(2 * time.Second):
		t.Fatal("Stop() blocked on never-started Streamer")
	}
}

// TestStartStopLifecycle verifies that Start + Stop return promptly when the
// remote host is unreachable (connectOnce fails fast on dial).
func TestStartStopLifecycle(t *testing.T) {
	s := New(
		config.Stream{
			Flavor: "mysql",
			Host:   "127.0.0.1",
			Port:   19999, // nothing listening here
		},
		t.TempDir(), nil,
		func() error { return nil },
		nil,
	)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)
	// Give the goroutine a moment to enter connectOnce (which will fail fast on
	// dial or DeriveResume since st==nil). Then stop and assert it returns.
	time.Sleep(50 * time.Millisecond)
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.Stop()
	}()
	select {
	case <-done:
		// pass
	case <-time.After(5 * time.Second):
		t.Fatal("Stop() took too long — possible deadlock")
	}
}

// TestStatusConcurrentWithWrites is a race-detector regression test for C1:
// concurrent reads of Status() alongside spool.Write calls that exercise
// the atomic skipped counter must pass under -race.
func TestStatusConcurrentWithWrites(t *testing.T) {
	s, _ := newTestStreamer(t)
	if err := s.spool.OpenAt("mysql-bin.000001", 0); err != nil {
		t.Fatal(err)
	}

	const iters = 1000
	var wg sync.WaitGroup

	// Writer goroutine: send duplicate-logPos events so skipped.Add(1) fires.
	// LogPos=4 (== minSpoolSize) on a fresh file means end <= size → skipped.
	wg.Add(1)
	go func() {
		defer wg.Done()
		raw := make([]byte, 4)
		for i := 0; i < iters; i++ {
			// logPos=4, spool starts at size=4 → duplicate, increments skipped
			s.spool.Write(raw, 4) //nolint:errcheck
		}
	}()

	// Reader goroutine: continuously call Status() which reads skipped.Load().
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iters; i++ {
			_ = s.Status()
		}
	}()

	wg.Wait()
}
