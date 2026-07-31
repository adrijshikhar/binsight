package streamer

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

func TestNewestSpoolFile(t *testing.T) {
	dir := t.TempDir()
	for _, n := range []string{"mysql-bin.000009", "mysql-bin.000010", "mysql-bin.000002"} {
		if err := os.WriteFile(filepath.Join(dir, n), []byte{0xfe, 0x62, 0x69, 0x6e}, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	got, err := newestSpoolFile(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got != "mysql-bin.000010" { // numeric suffix sort, NOT lexicographic-only
		t.Errorf("newest = %q", got)
	}
}

func TestNewestSpoolFileEmpty(t *testing.T) {
	got, err := newestSpoolFile(t.TempDir())
	if err != nil || got != "" {
		t.Errorf("empty dir: got %q err %v", got, err)
	}
}

func TestHeadGTIDBaselineMySQL(t *testing.T) {
	base, found, err := headGTIDBaseline("../testdata/corpus/8.0/mysql-8.0.binlog", "mysql")
	if err != nil {
		t.Fatal(err)
	}
	if !found {
		t.Fatal("8.0 fixture must contain PREVIOUS_GTIDS")
	}
	_ = base // empty string == empty set is valid
}

func TestHeadGTIDBaselineMariaDB(t *testing.T) {
	base, found, err := headGTIDBaseline("../testdata/corpus/maria-11.4/mysql-maria-11.4.binlog", "mariadb")
	if err != nil {
		t.Fatal(err)
	}
	if !found {
		t.Fatal("maria fixture must contain GTID_LIST")
	}
	_ = base
}

func TestDeriveResume(t *testing.T) {
	dir := t.TempDir()
	src, err := os.ReadFile("../testdata/corpus/8.0/mysql-8.0.binlog")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "mysql-bin.000003")
	if err := os.WriteFile(path, src, 0o644); err != nil {
		t.Fatal(err)
	}
	base, found, err := headGTIDBaseline(path, "mysql")
	if err != nil || !found || base != "" {
		t.Fatalf("test assumes 8.0 fixture has an empty PREVIOUS_GTIDS baseline; got base=%q found=%v err=%v", base, found, err)
	}

	st, err := store.Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	f := &store.File{Path: path, State: store.FileStateReady, LastIndexedOffset: int64(len(src))}
	if err := st.UpsertFile(f); err != nil {
		t.Fatal(err)
	}
	if _, err := st.InsertTxn(&store.Txn{FileID: f.ID, GTID: "11111111-2222-3333-4444-555555555555:7",
		StartPos: 200, EndPos: 400, Status: "committed"}); err != nil {
		t.Fatal(err)
	}
	rp, err := DeriveResume(st, dir, "mysql")
	if err != nil {
		t.Fatal(err)
	}
	if rp.File != "mysql-bin.000003" || rp.Pos != int64(len(src)) {
		t.Errorf("resume point: %+v", rp)
	}
	if rp.GTID == nil {
		t.Fatal("GTID set must derive (baseline found + 1 txn)")
	}
	if got := rp.GTID.String(); got != "11111111-2222-3333-4444-555555555555:7" {
		t.Errorf("gtid set = %q", got)
	}
}

func TestDeriveResumeEmptySpool(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	rp, err := DeriveResume(st, t.TempDir(), "mysql")
	if err != nil {
		t.Fatal(err)
	}
	if rp.File != "" {
		t.Errorf("empty spool must yield empty resume point, got %+v", rp)
	}
}

func TestDeriveResumeUnindexedFails(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "mysql-bin.000001"),
		[]byte{0xfe, 0x62, 0x69, 0x6e, 1, 2, 3}, 0o644); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(filepath.Join(t.TempDir(), "x.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	if _, err := DeriveResume(st, dir, "mysql"); err == nil {
		t.Fatal("spool file with no usable index row must error (caller surfaces restart-from-current)")
	}
}
