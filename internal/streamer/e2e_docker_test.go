package streamer

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/indexer"
	"github.com/adrijshikhar/binsight/internal/scanner"
	"github.com/adrijshikhar/binsight/internal/store"
)

func e2eGate(t *testing.T) {
	t.Helper()
	if os.Getenv("BINSIGHT_E2E_DOCKER") != "1" {
		t.Skip("set BINSIGHT_E2E_DOCKER=1 to run docker e2e")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not available")
	}
}

type testContainer struct {
	id, host string
	port     int
	client   string // client binary inside the container: mysql or mariadb
}

func startServer(t *testing.T, image string, gtid bool) *testContainer {
	t.Helper()
	args := []string{"run", "-d", "--rm", "-e", "MYSQL_ROOT_PASSWORD=root",
		"-p", "127.0.0.1:0:3306", image,
		"--server-id=1", "--log-bin=mysql-bin", "--binlog-format=ROW"}
	if gtid && !strings.Contains(image, "mariadb") {
		args = append(args, "--gtid-mode=ON", "--enforce-gtid-consistency=ON")
	}
	if strings.Contains(image, "mariadb") {
		args[4] = "MARIADB_ROOT_PASSWORD=root"
	}
	out, err := exec.Command("docker", args...).Output()
	if err != nil {
		t.Fatalf("docker run %s: %v", image, err)
	}
	id := strings.TrimSpace(string(out))
	t.Cleanup(func() { _ = exec.Command("docker", "kill", id).Run() })

	portOut, err := exec.Command("docker", "port", id, "3306/tcp").Output()
	if err != nil {
		t.Fatalf("docker port: %v", err)
	}
	// "127.0.0.1:49162" (possibly multiple lines; take the first)
	line := strings.TrimSpace(strings.Split(string(portOut), "\n")[0])
	var port int
	if _, err := fmt.Sscanf(line[strings.LastIndexByte(line, ':')+1:], "%d", &port); err != nil {
		t.Fatalf("parse port from %q: %v", line, err)
	}
	c := &testContainer{id: id, host: "127.0.0.1", port: port, client: "mysql"}
	if strings.Contains(image, "mariadb") {
		c.client = "mariadb"
	}
	// wait healthy: the client must connect and run a query
	deadline := time.Now().Add(90 * time.Second)
	for {
		err := exec.Command("docker", "exec", id, c.client, "-uroot", "-proot", "-e", "SELECT 1").Run()
		if err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("container %s never became healthy", image)
		}
		time.Sleep(2 * time.Second)
	}
	c.sql(t, "CREATE USER IF NOT EXISTS 'repl'@'%' IDENTIFIED BY 'replpw'")
	c.sql(t, "GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl'@'%'")
	c.sql(t, "CREATE DATABASE IF NOT EXISTS t")
	c.sql(t, "CREATE TABLE IF NOT EXISTS t.x (id INT PRIMARY KEY AUTO_INCREMENT, v VARCHAR(64))")
	return c
}

func (c *testContainer) sql(t *testing.T, q string) {
	t.Helper()
	if out, err := exec.Command("docker", "exec", c.id, c.client, "-uroot", "-proot", "-e", q).CombinedOutput(); err != nil {
		t.Fatalf("sql %q: %v\n%s", q, err, out)
	}
}

// binlogDir inside official mysql/mariadb images
const containerBinlogDir = "/var/lib/mysql"

func (c *testContainer) copyBinlogs(t *testing.T) string {
	t.Helper()
	dst := t.TempDir()
	out, err := exec.Command("docker", "exec", c.id, "sh", "-c",
		"ls "+containerBinlogDir+"/mysql-bin.[0-9]*").Output()
	if err != nil {
		t.Fatalf("list binlogs: %v", err)
	}
	for _, line := range strings.Fields(string(out)) {
		if strings.HasSuffix(line, ".index") {
			continue
		}
		if err := exec.Command("docker", "cp", c.id+":"+line, dst).Run(); err != nil {
			t.Fatalf("docker cp %s: %v", line, err)
		}
	}
	return dst
}

// testReindex indexes every spool file with the real indexer — the same
// full/append branching the server uses, minimized for the test.
func testReindex(st *store.Store, spool string) func() error {
	dec := gomysql.New()
	return func() error {
		found, err := scanner.Scan(spool)
		if err != nil {
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		for _, d := range found {
			f, err := st.GetFileByPath(d.Path)
			if err != nil {
				f = &store.File{Path: d.Path}
			}
			f.Size, f.MagicOK = d.Size, d.MagicOK
			if f.State == store.FileStateReady && f.LastIndexedOffset == d.Size &&
				f.IndexedByAdapter == dec.Name() {
				continue
			}
			canAppend := f.ID != 0 && f.State == store.FileStateReady &&
				f.IndexedByAdapter == dec.Name() &&
				f.LastIndexedOffset > adapter.BinlogHeaderEnd && d.Size > f.LastIndexedOffset
			f.State = store.FileStateIndexing
			if err := st.UpsertFile(f); err != nil {
				return err
			}
			ix := indexer.New(st, dec)
			done := false
			if canAppend {
				if _, aerr := ix.IndexAppend(context.Background(), f, nil); aerr == nil {
					done = true
				}
			}
			if !done {
				if err := ix.IndexFile(context.Background(), f, nil); err != nil {
					return err
				}
			}
		}
		return nil
	}
}

func streamCfg(c *testContainer, flavor string) config.Stream {
	return config.Stream{Enabled: true, Host: c.host, Port: c.port, User: "repl",
		Password: "replpw", Flavor: flavor, ServerID: 51789, MaxSpoolBytes: 2 << 30}
}

func waitStreaming(t *testing.T, s *Streamer) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if s.Status().State == StateStreaming {
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("never reached streaming: %+v", s.Status())
}

// waitQuiesced waits until the spool stops growing for two ticks.
func waitQuiesced(t *testing.T, spool string) {
	t.Helper()
	var last int64 = -1
	stable := 0
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		var total int64
		entries, _ := os.ReadDir(spool)
		for _, e := range entries {
			if i, err := e.Info(); err == nil {
				total += i.Size()
			}
		}
		if total == last {
			stable++
			if stable >= 3 {
				return
			}
		} else {
			stable, last = 0, total
		}
		time.Sleep(500 * time.Millisecond)
	}
	t.Fatal("spool never quiesced")
}

// assertSpoolMirrors compares files present in BOTH the spool and the copied
// server directory.  Files absent from the spool are pre-connection files the
// streamer intentionally never received — they are logged and skipped.
// The last file in the spool is the currently-active (open) file; it is skipped
// because the spool never receives the final ROTATE event that closes it, so the
// server's closed copy will have a ROTATE appended that the spool lacks.
// Exactly the "closed" spool files (all but the last alphabetically) are compared.
func assertSpoolMirrors(t *testing.T, spool, copied string) {
	t.Helper()

	// Build sorted list of spool files to identify which are "closed" (all but
	// the last one).
	spoolEntries, err := os.ReadDir(spool)
	if err != nil {
		t.Fatal(err)
	}
	spoolFiles := make([]string, 0, len(spoolEntries))
	for _, e := range spoolEntries {
		if !e.IsDir() {
			spoolFiles = append(spoolFiles, e.Name())
		}
	}
	// The last spool file is still open (no trailing ROTATE received) — skip it.
	closedSpool := make(map[string]struct{})
	for i, name := range spoolFiles {
		if i < len(spoolFiles)-1 {
			closedSpool[name] = struct{}{}
		}
	}

	entries, err := os.ReadDir(copied)
	if err != nil {
		t.Fatal(err)
	}
	checked := 0
	for _, e := range entries {
		name := e.Name()
		gotPath := filepath.Join(spool, name)
		if _, serr := os.Stat(gotPath); errors.Is(serr, os.ErrNotExist) {
			// Pre-connection files the streamer intentionally never received — skip.
			t.Logf("assertSpoolMirrors: skipping %s (not in spool — pre-connection file)", name)
			continue
		}
		if _, ok := closedSpool[name]; !ok {
			// Last spool file is still open (no Rotate received yet) — skip.
			t.Logf("assertSpoolMirrors: skipping %s (last/open spool file)", name)
			continue
		}
		want, err := os.ReadFile(filepath.Join(copied, name))
		if err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(gotPath)
		if err != nil {
			t.Errorf("spool read %s: %v", name, err)
			continue
		}
		if !bytes.Equal(got, want) {
			i := 0
			for i < len(got) && i < len(want) && got[i] == want[i] {
				i++
			}
			t.Errorf("%s differs: spool %d bytes vs server %d bytes, first diff at %d",
				name, len(got), len(want), i)
		}
		checked++
	}
	if checked == 0 {
		t.Fatal("no closed spool binlogs to compare")
	}
}

func runStreamScenario(t *testing.T, image, flavor string, gtid bool) {
	c := startServer(t, image, gtid)
	spool := t.TempDir()
	st, err := store.Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	s := New(streamCfg(c, flavor), spool, st, testReindex(st, spool), nil)
	s.Start(context.Background())
	waitStreaming(t, s)

	// workload phase 1
	for i := 0; i < 50; i++ {
		c.sql(t, fmt.Sprintf("INSERT INTO t.x (v) VALUES ('row-%d')", i))
	}
	c.sql(t, "UPDATE t.x SET v='upd' WHERE id % 7 = 0")
	c.sql(t, "FLUSH LOGS") // rotation
	for i := 50; i < 80; i++ {
		c.sql(t, fmt.Sprintf("INSERT INTO t.x (v) VALUES ('row-%d')", i))
	}
	waitQuiesced(t, spool)

	// reconnect: stop mid-stream, write more, start again — resume must be
	// txn-aligned and the mirror must stay byte-identical
	s.Stop()
	for i := 80; i < 120; i++ {
		c.sql(t, fmt.Sprintf("INSERT INTO t.x (v) VALUES ('row-%d')", i))
	}
	s2 := New(streamCfg(c, flavor), spool, st, testReindex(st, spool), nil)
	s2.Start(context.Background())
	defer s2.Stop()
	waitStreaming(t, s2)
	waitQuiesced(t, spool)

	// FLUSH LOGS closes the active binlog on the server (clearing
	// LOG_EVENT_BINLOG_IN_USE_F) and opens a fresh stub file.  waitQuiesced
	// waits for the spool to receive and write the Rotate + new-file FDE.
	// assertSpoolMirrors then compares only the closed spool files (all but the
	// last, which is still open/active), so the stub's IN_USE mismatch is never
	// compared.
	c.sql(t, "FLUSH LOGS")
	waitQuiesced(t, spool)

	copied := c.copyBinlogs(t)

	// Re-index the spool with its current contents.
	if err := testReindex(st, spool)(); err != nil {
		t.Fatal(err)
	}

	// Compare index per file for closed spool files present in both spool and
	// copy.  Skip pre-connection files (not in spool) and the last/open spool
	// file (never received its closing Rotate, so its index is partial).
	spoolEntries, err := os.ReadDir(spool)
	if err != nil {
		t.Fatal(err)
	}
	spoolNames := make([]string, 0, len(spoolEntries))
	for _, e := range spoolEntries {
		if !e.IsDir() {
			spoolNames = append(spoolNames, e.Name())
		}
	}
	closedSpoolIdx := make(map[string]struct{})
	for i, name := range spoolNames {
		if i < len(spoolNames)-1 {
			closedSpoolIdx[name] = struct{}{}
		}
	}
	// countFile tallies transactions and events for a single named binlog file
	// within a store.  It takes t so that store errors are surfaced immediately
	// rather than silently returning (0, 0) and producing a vacuous-pass.
	countFile := func(t *testing.T, st *store.Store, base string) (ev, tx int64) {
		t.Helper()
		files, err := st.ListFiles()
		if err != nil {
			t.Fatalf("countFile ListFiles: %v", err)
		}
		for _, f := range files {
			if filepath.Base(f.Path) != base {
				continue
			}
			txns, err := st.ListTxns(f.ID)
			if err != nil {
				t.Fatalf("countFile ListTxns(%d): %v", f.ID, err)
			}
			tx += int64(len(txns))
			for _, x := range txns {
				ev += x.EventCount
			}
		}
		return
	}

	indexChecked := 0
	for base := range closedSpoolIdx {
		base := base // capture for closure
		spoolPath := filepath.Join(spool, base)
		copyPath := filepath.Join(copied, base)
		if _, serr := os.Stat(copyPath); errors.Is(serr, os.ErrNotExist) {
			t.Logf("index check: skipping %s (not in copied dir)", base)
			continue
		}

		// Wrap each iteration in an inline closure so stA/stB defers fire
		// immediately at end of this iteration rather than accumulating to
		// the end of the enclosing function.
		func() {
			// Build per-file stores for spool side and copy side.
			stA, err := store.Open(filepath.Join(t.TempDir(), "a-"+base+".db"))
			if err != nil {
				t.Fatal(err)
			}
			defer stA.Close()
			stB, err := store.Open(filepath.Join(t.TempDir(), "b-"+base+".db"))
			if err != nil {
				t.Fatal(err)
			}
			defer stB.Close()

			if err := testReindex(stA, filepath.Dir(spoolPath))(); err != nil {
				t.Fatalf("reindex spool %s: %v", base, err)
			}
			if err := testReindex(stB, filepath.Dir(copyPath))(); err != nil {
				t.Fatalf("reindex copy %s: %v", base, err)
			}

			ea, ta := countFile(t, stA, base)
			eb, tb := countFile(t, stB, base)
			if ta != tb || ea != eb {
				t.Errorf("index mismatch %s: spool txns=%d events=%d vs copy txns=%d events=%d",
					base, ta, ea, tb, eb)
			}
		}()
		indexChecked++
	}
	if indexChecked == 0 {
		t.Fatal("no closed spool files found for index comparison")
	}

	assertSpoolMirrors(t, spool, copied)
}

func TestE2EMySQL80GTID(t *testing.T) {
	e2eGate(t)
	runStreamScenario(t, "mysql:8.0", "mysql", true)
}

func TestE2EMySQL80FilePos(t *testing.T) {
	e2eGate(t)
	runStreamScenario(t, "mysql:8.0", "mysql", false) // gtid-mode off → file+pos path
}

func TestE2EMariaDB114(t *testing.T) {
	e2eGate(t)
	runStreamScenario(t, "mariadb:11.4", "mariadb", true)
}
