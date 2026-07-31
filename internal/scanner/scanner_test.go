package scanner

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, dir, name string, content []byte) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, content, 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestScanGlob(t *testing.T) {
	dir := t.TempDir()
	// Discovery is by magic, not name: a binlog may be named anything, and
	// non-binlog files (any name) are skipped.
	writeFile(t, dir, "binlog.000001", append(magic, 0x00))       // standard name + magic
	writeFile(t, dir, "weird-name.log", append(magic, 0x00))      // odd name, real binlog
	writeFile(t, dir, "no-extension-at-all", append(magic, 0x00)) // no extension + magic
	writeFile(t, dir, "notabinlog.txt", []byte("hello"))          // not a binlog → skipped
	writeFile(t, dir, "binlog.000099", []byte("bad magic here"))  // binlog-ish name, bad magic → skipped

	found, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 3 {
		t.Fatalf("want 3 binlogs (by magic, any name), got %d: %+v", len(found), found)
	}
	byName := map[string]Discovered{}
	for _, f := range found {
		byName[filepath.Base(f.Path)] = f
	}
	for _, n := range []string{"binlog.000001", "weird-name.log", "no-extension-at-all"} {
		if !byName[n].MagicOK {
			t.Fatalf("%s should be discovered as a binlog by magic", n)
		}
	}
	if _, ok := byName["notabinlog.txt"]; ok {
		t.Fatal("non-binlog file must be skipped")
	}
	if _, ok := byName["binlog.000099"]; ok {
		t.Fatal("bad-magic file must be skipped regardless of name")
	}
}

func TestScanIndexFile(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "mybin.000001", append(magic, 0x00))
	writeFile(t, dir, "mybin.000002", append(magic, 0x00))
	writeFile(t, dir, "mybin.index", []byte("./mybin.000001\n"))

	found, err := Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || filepath.Base(found[0].Path) != "mybin.000001" {
		t.Fatalf("index file must drive discovery: %+v", found)
	}
}

func TestScanSingleFile(t *testing.T) {
	dir := t.TempDir()
	p := writeFile(t, dir, "binlog.000007", append(magic, 0x00))
	found, err := Scan(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || !found[0].MagicOK {
		t.Fatalf("single file scan: %+v", found)
	}
}

func TestScanReturnsAbsolutePaths(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "binlog.000001", append(magic, 0x00))
	// scan via a relative path to the dir
	wd, _ := os.Getwd()
	defer os.Chdir(wd)
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	found, err := Scan(".")
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 {
		t.Fatalf("want 1, got %d", len(found))
	}
	if !filepath.IsAbs(found[0].Path) {
		t.Fatalf("path must be absolute, got %q", found[0].Path)
	}
}
