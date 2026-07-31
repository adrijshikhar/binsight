package streamer

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/go-mysql-org/go-mysql/mysql"
	"github.com/go-mysql-org/go-mysql/replication"

	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/store"
)

// Stream states surfaced in /api/stream/status and the stream_status SSE event.
const (
	StateDisabled     = "disabled"
	StateConnecting   = "connecting"
	StateStreaming    = "streaming"
	StateReconnecting = "reconnecting"
	StateError        = "error"
)

const (
	heartbeatPeriod = 30 * time.Second
	readTimeout     = 90 * time.Second // > heartbeatPeriod, required by go-mysql
	authRetryDelay  = 60 * time.Second
	maxBackoff      = 60 * time.Second
)

// Status is the streamer's externally visible state.
type Status struct {
	State         string `json:"state"`
	File          string `json:"file"`
	Pos           int64  `json:"pos"`
	LastEventTS   int64  `json:"last_event_ts"`
	Error         string `json:"error,omitempty"`
	SkippedEvents int64  `json:"skipped_events"`
}

// Streamer owns the replication connection and feeds the Spooler. All
// failures funnel into one reconnect sequence (reindex → truncate-to-boundary
// → derive resume → sync); there are no special-case resume states.
type Streamer struct {
	cfg      config.Stream
	spoolDir string
	st       *store.Store
	reindex  func() error // synchronous scan+index pass (server.ScanAndIndex)
	notify   func(Status) // state-transition broadcast (server SSE)

	spool *Spooler

	mu      sync.Mutex
	status  Status
	started bool

	cancel context.CancelFunc
	done   chan struct{}
}

// New builds a Streamer. st may be nil only in unit tests that never connect.
func New(cfg config.Stream, spoolDir string, st *store.Store,
	reindex func() error, notify func(Status)) *Streamer {
	return &Streamer{
		cfg: cfg, spoolDir: spoolDir, st: st, reindex: reindex, notify: notify,
		spool:  NewSpooler(spoolDir),
		status: Status{State: StateDisabled},
	}
}

// Start launches the connect/stream/reconnect loop. Call once; subsequent
// calls are no-ops (a warning is logged).
func (s *Streamer) Start(ctx context.Context) {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		log.Printf("streamer: Start called on already-started streamer — ignored")
		return
	}
	s.started = true
	ctx, s.cancel = context.WithCancel(ctx)
	s.done = make(chan struct{})
	s.mu.Unlock()
	go s.run(ctx)
}

// Stop cancels the loop and waits for it to exit. Safe when never started.
func (s *Streamer) Stop() {
	s.mu.Lock()
	cancel := s.cancel
	done := s.done
	s.mu.Unlock()
	if cancel == nil {
		return
	}
	cancel()
	<-done
}

// Status returns a copy of the current status.
func (s *Streamer) Status() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.status
	st.SkippedEvents = s.spool.Skipped()
	return st
}

func (s *Streamer) setState(state, errMsg string) {
	s.mu.Lock()
	changed := s.status.State != state || s.status.Error != errMsg
	s.status.State, s.status.Error = state, errMsg
	snapshot := s.status
	s.mu.Unlock()
	if changed && s.notify != nil {
		s.notify(snapshot)
	}
}

func (s *Streamer) setPosition(file string, pos int64, ts uint32) {
	s.mu.Lock()
	s.status.File, s.status.Pos = file, pos
	if ts > 0 {
		s.status.LastEventTS = int64(ts)
	}
	s.mu.Unlock()
}

// backoffDelay is the transport-error retry schedule: 1s,2s,4s,... capped at 60s.
func backoffDelay(attempt int) time.Duration {
	if attempt > 5 {
		return maxBackoff
	}
	return time.Second << attempt
}

// errFatal marks conditions that must NOT auto-retry (purged resume point,
// disk full): silently restarting from the server's current position would
// hide a gap from the user. Recovery is the restart-from-current action.
var errFatal = errors.New("fatal stream error")

func classify(err error) (fatal, auth bool) {
	if errors.Is(err, errFatal) {
		return true, false
	}
	var me *mysql.MyError
	if errors.As(err, &me) {
		switch me.Code {
		case mysql.ER_ACCESS_DENIED_ERROR, mysql.ER_SPECIFIC_ACCESS_DENIED_ERROR,
			mysql.ER_DBACCESS_DENIED_ERROR:
			return false, true
		case mysql.ER_MASTER_FATAL_ERROR_READING_BINLOG: // 1236: resume point purged
			return true, false
		}
	}
	return false, false
}

func (s *Streamer) run(ctx context.Context) {
	defer close(s.done)
	defer func() { _ = s.spool.Close() }()
	attempt := 0
	for {
		streamed, err := s.connectOnce(ctx)
		if ctx.Err() != nil {
			s.setState(StateDisabled, "")
			return
		}
		fatal, auth := classify(err)
		switch {
		case fatal:
			s.setState(StateError, err.Error())
			log.Printf("streamer: fatal: %v (manual recovery: restart-from-current)", err)
			return
		case auth:
			s.setState(StateError, err.Error())
			log.Printf("streamer: auth error, retrying in %s: %v", authRetryDelay, err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(authRetryDelay):
			}
		default:
			s.setState(StateReconnecting, err.Error())
			if streamed {
				attempt = 0
			}
			d := backoffDelay(attempt)
			log.Printf("streamer: reconnecting in %s: %v", d, err)
			attempt++
			select {
			case <-ctx.Done():
				return
			case <-time.After(d):
			}
		}
	}
}

// connectOnce runs the full reconnect sequence and then streams until error
// or cancellation. Returning nil never happens — only ctx cancellation or an
// error end a connection. streamed is true when StateStreaming was reached and
// at least one event loop iteration ran; callers use this to reset backoff.
func (s *Streamer) connectOnce(ctx context.Context) (streamed bool, err error) {
	s.setState(StateConnecting, "")

	// (1) index the spool so the newest file's boundary is current
	if err := s.reindex(); err != nil {
		return false, fmt.Errorf("pre-resume index pass: %w", err)
	}
	// (2)+(3) derive resume from spool + index
	rp, err := DeriveResume(s.st, s.spoolDir, s.cfg.Flavor)
	if err != nil {
		return false, fmt.Errorf("%w: %v", errFatal, err)
	}
	// (2b) probe gtid mode + current file
	info, err := probeServer(s.cfg)
	if err != nil {
		return false, err
	}
	if rp.File == "" {
		// first ever connect: snap to the start of the server's current file so
		// local byte offsets == LogPos for the whole spool (true-seek + hex
		// depend on this). GTID resume kicks in from the next reconnect on.
		rp.File, rp.Pos, rp.GTID = filepath.Base(info.file), 4, nil
	}

	// (4) truncate the partial tail + open the spool at the boundary
	if err := s.spool.OpenAt(rp.File, rp.Pos); err != nil {
		return false, fmt.Errorf("%w: %v", errFatal, err)
	}

	// (5) sync
	syncerCfg := replication.BinlogSyncerConfig{
		ServerID:         s.cfg.ServerID,
		Flavor:           s.cfg.Flavor,
		Host:             s.cfg.Host,
		Port:             uint16(s.cfg.Port),
		User:             s.cfg.User,
		Password:         s.cfg.Password,
		HeartbeatPeriod:  heartbeatPeriod,
		ReadTimeout:      readTimeout,
		DisableRetrySync: true, // ALL reconnects must flow through this sequence
		// Match the file decoder: render TIMESTAMP columns in UTC, not host-local.
		TimestampStringLocation: time.UTC,
	}
	if s.cfg.Flavor == "mariadb" {
		// MariaDB omits ANNOTATE_ROWS_EVENT from the dump stream unless this is
		// set; without it the on-disk LogPos accounts for bytes we never receive
		// → spool gap that causes crash-loops on resume.
		syncerCfg.FillZeroLogPos = true
	}
	syncer := replication.NewBinlogSyncer(syncerCfg)
	defer syncer.Close()

	var bs *replication.BinlogStreamer
	if info.gtidMode && rp.GTID != nil {
		bs, err = syncer.StartSyncGTID(rp.GTID)
	} else {
		bs, err = syncer.StartSync(mysql.Position{Name: rp.File, Pos: uint32(rp.Pos)})
	}
	if err != nil {
		return false, fmt.Errorf("start sync: %w", err)
	}
	s.setState(StateStreaming, "")

	for {
		ev, err := bs.GetEvent(ctx)
		if err != nil {
			return true, fmt.Errorf("get event: %w", err)
		}
		if err := s.handleEvent(ev); err != nil {
			return true, err
		}
	}
}

// handleEvent routes one replication event into the spool. Disk-full write
// errors are fatal (no retry spin); everything else bubbles to the reconnect
// loop.
func (s *Streamer) handleEvent(ev *replication.BinlogEvent) error {
	h := ev.Header
	artificial := h.Flags&replication.LOG_EVENT_ARTIFICIAL_F != 0

	switch h.EventType {
	case replication.HEARTBEAT_EVENT:
		return nil

	case replication.ROTATE_EVENT:
		re, ok := ev.Event.(*replication.RotateEvent)
		if !ok {
			return fmt.Errorf("rotate event with unexpected body %T", ev.Event)
		}
		next := filepath.Base(string(re.NextLogName))
		if artificial {
			// connect-time marker naming the file we are about to receive
			if cur, _ := s.spool.Current(); cur != next {
				if err := s.spool.Rotate(next); err != nil {
					return wrapDisk(err)
				}
			}
			return nil
		}
		// real rotate: its bytes belong to the OLD file, then switch
		if _, err := s.spool.Write(ev.RawData, h.LogPos); err != nil {
			return wrapDisk(err)
		}
		if err := s.spool.Rotate(next); err != nil {
			return wrapDisk(err)
		}
		name, size := s.spool.Current()
		s.setPosition(name, size, h.Timestamp)
		return nil

	case replication.FORMAT_DESCRIPTION_EVENT:
		if h.LogPos == 0 {
			// positionless FDE sent on mid-file resume: only a fresh file needs it
			if _, size := s.spool.Current(); size == 4 {
				if err := s.spool.WriteRaw(ev.RawData); err != nil {
					return wrapDisk(err)
				}
			}
			return nil
		}
		if _, err := s.spool.Write(ev.RawData, h.LogPos); err != nil {
			return wrapDisk(err)
		}
		return nil

	default:
		if artificial {
			return nil
		}
		if h.LogPos == 0 {
			// MariaDB inline events (e.g. ANNOTATE_ROWS) carry LogPos=0 in the
			// file too — append keeps byte parity with the server's file.
			if err := s.spool.WriteRaw(ev.RawData); err != nil {
				return wrapDisk(err)
			}
		} else {
			if _, err := s.spool.Write(ev.RawData, h.LogPos); err != nil {
				return wrapDisk(err)
			}
		}
		name, size := s.spool.Current()
		s.setPosition(name, size, h.Timestamp)
		return nil
	}
}

// wrapDisk upgrades out-of-space write errors to fatal so the loop stops
// instead of spinning against a full disk.
func wrapDisk(err error) error {
	if err == nil {
		return nil
	}
	var pe *os.PathError
	if errors.As(err, &pe) || errors.Is(err, os.ErrPermission) {
		return fmt.Errorf("%w: %v", errFatal, err)
	}
	return err
}
