package streamer

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-mysql-org/go-mysql/mysql"
	"github.com/go-mysql-org/go-mysql/replication"

	"github.com/adrijshikhar/binsight/internal/store"
)

// ResumePoint is where streaming continues after any (re)connect.
type ResumePoint struct {
	File string        // binlog basename; "" = empty spool, start at server's current file
	Pos  int64         // committed boundary (== spool byte size after truncation)
	GTID mysql.GTIDSet // nil when underivable → caller uses file+pos
}

// newestSpoolFile returns the basename with the highest numeric suffix
// ("" when the dir is empty or has no binlog-named files). Numeric sort, not
// lexicographic: mysql-bin.999999 < mysql-bin.1000000.
func newestSpoolFile(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", err
	}
	best, bestN := "", -1
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		i := strings.LastIndexByte(name, '.')
		if i < 0 {
			continue
		}
		n, err := strconv.Atoi(name[i+1:])
		if err != nil {
			continue
		}
		if n > bestN {
			best, bestN = name, n
		}
	}
	return best, nil
}

// errStopParse is a sentinel that stops the head parse once we have what we need.
var errStopParse = errors.New("stop")

// headParseLimit bounds how many head events we inspect before concluding the
// file carries no GTID baseline (FDE, PREVIOUS_GTIDS/GTID_LIST sit at the top).
const headParseLimit = 8

// headGTIDBaseline extracts the GTID baseline event from a binlog file head:
// PREVIOUS_GTIDS (MySQL) or GTID_LIST (MariaDB). It covers every transaction
// before this file — including pruned spool files. found=false means the file
// has no baseline (pre-GTID server) → file+pos resume.
func headGTIDBaseline(path, flavor string) (set string, found bool, err error) {
	if flavor != "mysql" && flavor != "mariadb" {
		return "", false, fmt.Errorf("headGTIDBaseline: unknown flavor %q", flavor)
	}
	p := replication.NewBinlogParser()
	n := 0
	perr := p.ParseFile(path, 4, func(ev *replication.BinlogEvent) error {
		n++
		// A mysql server emits PREVIOUS_GTIDS; a mariadb server emits GTID_LIST.
		// A baseline event of the other flavor cannot appear in a well-formed
		// binlog, so the per-case flavor checks below are belt-and-suspenders.
		switch e := ev.Event.(type) {
		case *replication.PreviousGTIDsEvent:
			if flavor == "mysql" {
				set, found = e.GTIDSets, true
				return errStopParse
			}
		case *replication.MariadbGTIDListEvent:
			if flavor == "mariadb" {
				parts := make([]string, 0, len(e.GTIDs))
				for _, g := range e.GTIDs {
					parts = append(parts, g.String())
				}
				set, found = strings.Join(parts, ","), true
				return errStopParse
			}
		}
		if n >= headParseLimit {
			return errStopParse
		}
		return nil
	})
	if perr != nil && !errors.Is(perr, errStopParse) {
		return "", false, fmt.Errorf("head-parse %s: %w", path, perr)
	}
	return set, found, nil
}

// DeriveResume computes the resume point from the spool + index alone — no
// persisted cursor (decision: spool IS the cursor; nothing to drift). The
// caller must have run a synchronous index pass first so the newest spool
// file's LastIndexedOffset is current.
func DeriveResume(st *store.Store, spoolDir, flavor string) (ResumePoint, error) {
	name, err := newestSpoolFile(spoolDir)
	if err != nil {
		return ResumePoint{}, fmt.Errorf("list spool: %w", err)
	}
	if name == "" {
		return ResumePoint{}, nil // first ever connect
	}
	path := filepath.Join(spoolDir, name)
	f, err := st.GetFileByPath(path)
	if err != nil {
		return ResumePoint{}, fmt.Errorf("spool file %s not in index: %w", name, err)
	}
	if f.State == store.FileStateError || f.LastIndexedOffset < 4 {
		return ResumePoint{}, fmt.Errorf(
			"spool file %s has no usable index (state=%s offset=%d): clear the spool or use restart-from-current",
			name, f.State, f.LastIndexedOffset)
	}
	rp := ResumePoint{File: name, Pos: f.LastIndexedOffset}

	baseline, found, err := headGTIDBaseline(path, flavor)
	if err != nil {
		log.Printf("streamer: GTID resume unavailable for %s (head-parse error: %v); using file+pos from offset %d", name, err, rp.Pos)
		return rp, nil // GTID nil → file+pos path; head-parse problems are not fatal
	}
	if !found {
		return rp, nil // pre-GTID server: expected, no log needed
	}
	set, err := mysql.ParseGTIDSet(flavor, baseline)
	if err != nil {
		log.Printf("streamer: GTID resume unavailable for %s (parse GTID set error: %v); using file+pos from offset %d", name, err, rp.Pos)
		return rp, nil
	}
	gtids, err := st.ListTxnGTIDs(f.ID, f.LastIndexedOffset)
	if err != nil {
		log.Printf("streamer: GTID resume unavailable for %s (list txn GTIDs error: %v); using file+pos from offset %d", name, err, rp.Pos)
		return rp, nil
	}
	for _, g := range gtids {
		if uerr := set.Update(g); uerr != nil {
			log.Printf("streamer: GTID resume unavailable for %s (malformed stored GTID %q: %v); using file+pos from offset %d", name, g, uerr, rp.Pos)
			return rp, nil // malformed stored gtid: fall back to file+pos rather than resync wrong
		}
	}
	rp.GTID = set
	return rp, nil
}
