// Package streamer connects to a remote MySQL/MariaDB server as a replica and
// spools raw binlog bytes into local files that byte-identically mirror the
// server's binlogs. The existing scan→index→live-tail pipeline consumes the
// spool with no knowledge that the files are remote-fed.
package streamer

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync/atomic"
)

var binlogMagic = []byte{0xfe, 0x62, 0x69, 0x6e}

// minSpoolSize is the size of a spool file containing only the 4-byte magic header.
var minSpoolSize = int64(len(binlogMagic))

// Spooler appends raw replication events to local mirror files. It never
// parses event bodies; its only contract is the binlog position invariant:
// an event's bytes span [LogPos-len(raw), LogPos), and local byte offset
// equals server position because every file starts from its real beginning.
type Spooler struct {
	dir     string
	f       *os.File
	name    string // current binlog basename ("" = closed)
	size    int64
	skipped atomic.Int64
}

func NewSpooler(dir string) *Spooler { return &Spooler{dir: dir} }

// OpenAt opens (creating if needed) the spool file for name and positions it
// at size — the committed boundary. size <= minSpoolSize means a fresh file:
// it is truncated and the 4-byte magic written. size > minSpoolSize truncates
// any bytes beyond the boundary (the partial tail a cut connection left behind).
func (sp *Spooler) OpenAt(name string, size int64) error {
	if name == "" || name != filepath.Base(name) {
		return fmt.Errorf("invalid spool file name %q", name)
	}
	if err := sp.Close(); err != nil {
		return err
	}
	path := filepath.Join(sp.dir, name)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return fmt.Errorf("open spool %s: %w", path, err)
	}
	if size <= minSpoolSize {
		if err := f.Truncate(0); err != nil {
			_ = f.Close()
			return fmt.Errorf("truncate fresh spool %s: %w", path, err)
		}
		if _, err := f.Write(binlogMagic); err != nil {
			_ = f.Close()
			return fmt.Errorf("write magic %s: %w", path, err)
		}
		size = int64(len(binlogMagic))
	} else {
		if err := f.Truncate(size); err != nil {
			_ = f.Close()
			return fmt.Errorf("truncate spool %s to %d: %w", path, size, err)
		}
		if _, err := f.Seek(size, io.SeekStart); err != nil {
			_ = f.Close()
			return fmt.Errorf("seek spool %s: %w", path, err)
		}
	}
	sp.f, sp.name, sp.size = f, name, size
	return nil
}

// Write appends one event ending at logPos. Events at or below the current
// size are duplicates from a reconnect resend — skipped, not errors. An event
// starting beyond the current size is a gap: fatal for this connection.
// Returns whether bytes were written.
func (sp *Spooler) Write(raw []byte, logPos uint32) (bool, error) {
	if sp.f == nil {
		return false, fmt.Errorf("spooler: no open file")
	}
	end := int64(logPos)
	if end <= sp.size {
		sp.skipped.Add(1)
		return false, nil
	}
	start := end - int64(len(raw))
	if start != sp.size {
		return false, fmt.Errorf("spool gap in %s: event spans %d-%d but spool is at %d",
			sp.name, start, end, sp.size)
	}
	if _, err := sp.f.Write(raw); err != nil {
		// Partial write may have advanced the OS file offset past sp.size; close
		// and nil out so the next OpenAt reopens cleanly from a known boundary.
		_ = sp.f.Close()
		sp.f = nil
		return false, fmt.Errorf("write spool %s: %w", sp.name, err)
	}
	sp.size = end
	return true, nil
}

// WriteRaw appends positionless bytes at the current size — used only for the
// connect-time FORMAT_DESCRIPTION the server sends with LogPos=0 on a fresh
// file, and for MariaDB inline events that genuinely carry LogPos=0.
func (sp *Spooler) WriteRaw(raw []byte) error {
	if sp.f == nil {
		return fmt.Errorf("spooler: no open file")
	}
	if _, err := sp.f.Write(raw); err != nil {
		// Partial write may have advanced the OS file offset past sp.size; close
		// and nil out so the next OpenAt reopens cleanly from a known boundary.
		_ = sp.f.Close()
		sp.f = nil
		return fmt.Errorf("write spool %s: %w", sp.name, err)
	}
	sp.size += int64(len(raw))
	return nil
}

// Rotate closes the current file and opens next at its existing size (resumed
// rotation) or fresh.
func (sp *Spooler) Rotate(next string) error {
	size := int64(0)
	if st, err := os.Stat(filepath.Join(sp.dir, next)); err == nil {
		size = st.Size()
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat next spool %s: %w", next, err)
	}
	return sp.OpenAt(next, size)
}

// Current reports the open file's basename and size ("" when closed).
func (sp *Spooler) Current() (string, int64) { return sp.name, sp.size }

// Skipped counts duplicate events dropped by the position guard.
func (sp *Spooler) Skipped() int64 { return sp.skipped.Load() }

// Close syncs and closes the current file. Safe on a closed spooler.
func (sp *Spooler) Close() error {
	if sp.f == nil {
		return nil
	}
	err1 := sp.f.Sync()
	err2 := sp.f.Close()
	sp.f, sp.name, sp.size = nil, "", 0
	return errors.Join(err1, err2)
}
