package streamer

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// ev fabricates a raw "event" blob of n bytes (content is irrelevant to the
// Spooler — it never parses).
func ev(n int, fill byte) []byte { return bytes.Repeat([]byte{fill}, n) }

func TestSpoolerWriteAndGuard(t *testing.T) {
	dir := t.TempDir()
	sp := NewSpooler(dir)
	if err := sp.OpenAt("mysql-bin.000001", 0); err != nil {
		t.Fatal(err)
	}
	// fresh file: magic written, size 4
	if _, size := sp.Current(); size != 4 {
		t.Fatalf("fresh size = %d, want 4", size)
	}
	// FDE: 120 bytes ending at pos 124
	if wrote, err := sp.Write(ev(120, 0xAA), 124); err != nil || !wrote {
		t.Fatalf("fde write: wrote=%v err=%v", wrote, err)
	}
	// duplicate (reconnect resend): LogPos <= size → skipped
	if wrote, err := sp.Write(ev(120, 0xAA), 124); err != nil || wrote {
		t.Fatalf("dup must be skipped: wrote=%v err=%v", wrote, err)
	}
	if sp.Skipped() != 1 {
		t.Errorf("skipped = %d, want 1", sp.Skipped())
	}
	// gap (event starts beyond current size) → hard error
	if _, err := sp.Write(ev(50, 0xBB), 999); err == nil {
		t.Fatal("gap write must error")
	}
	// contiguous event
	if wrote, err := sp.Write(ev(76, 0xCC), 200); err != nil || !wrote {
		t.Fatalf("event write: wrote=%v err=%v", wrote, err)
	}
	// on-disk bytes: magic + 120×0xAA + 76×0xCC
	got, err := os.ReadFile(filepath.Join(dir, "mysql-bin.000001"))
	if err != nil {
		t.Fatal(err)
	}
	want := append(append([]byte{0xfe, 0x62, 0x69, 0x6e}, ev(120, 0xAA)...), ev(76, 0xCC)...)
	if !bytes.Equal(got, want) {
		t.Errorf("file bytes mismatch: len got %d want %d", len(got), len(want))
	}
}

func TestSpoolerOpenAtResume(t *testing.T) {
	dir := t.TempDir()
	// pre-existing spool file with garbage tail beyond the boundary
	path := filepath.Join(dir, "mysql-bin.000002")
	if err := os.WriteFile(path, append([]byte{0xfe, 0x62, 0x69, 0x6e}, ev(200, 0x11)...), 0o644); err != nil {
		t.Fatal(err)
	}
	sp := NewSpooler(dir)
	if err := sp.OpenAt("mysql-bin.000002", 104); err != nil { // boundary mid-file
		t.Fatal(err)
	}
	st, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if st.Size() != 104 {
		t.Errorf("OpenAt must truncate to boundary: size %d", st.Size())
	}
	if wrote, err := sp.Write(ev(20, 0x22), 124); err != nil || !wrote {
		t.Fatalf("resume write: %v %v", wrote, err)
	}
}

func TestSpoolerRotate(t *testing.T) {
	dir := t.TempDir()
	sp := NewSpooler(dir)
	if err := sp.OpenAt("mysql-bin.000001", 0); err != nil {
		t.Fatal(err)
	}
	if _, err := sp.Write(ev(120, 0xAA), 124); err != nil {
		t.Fatal(err)
	}
	if err := sp.Rotate("mysql-bin.000002"); err != nil {
		t.Fatal(err)
	}
	name, size := sp.Current()
	if name != "mysql-bin.000002" || size != 4 {
		t.Errorf("after rotate: %s %d", name, size)
	}
	if _, err := os.Stat(filepath.Join(dir, "mysql-bin.000002")); err != nil {
		t.Errorf("rotated file missing: %v", err)
	}
}

func TestSpoolerRejectsPathTraversal(t *testing.T) {
	sp := NewSpooler(t.TempDir())
	if err := sp.OpenAt("../evil", 0); err == nil {
		t.Fatal("path traversal name must be rejected")
	}
}

func TestSpoolerWriteRaw(t *testing.T) {
	dir := t.TempDir()
	sp := NewSpooler(dir)

	// WriteRaw on a closed spooler must error.
	if err := sp.WriteRaw(ev(5, 0x99)); err == nil {
		t.Fatal("WriteRaw without open file must error")
	}

	// Open a fresh file: magic (4 bytes) written, size == 4.
	if err := sp.OpenAt("mysql-bin.000001", 0); err != nil {
		t.Fatal(err)
	}

	payload := ev(20, 0x55)
	if err := sp.WriteRaw(payload); err != nil {
		t.Fatalf("WriteRaw: %v", err)
	}

	// In-memory size must be magic (4) + payload (20) = 24.
	_, size := sp.Current()
	if size != 24 {
		t.Errorf("Current size = %d, want 24", size)
	}

	// On-disk bytes must be magic + payload exactly.
	got, err := os.ReadFile(filepath.Join(dir, "mysql-bin.000001"))
	if err != nil {
		t.Fatal(err)
	}
	want := append([]byte{0xfe, 0x62, 0x69, 0x6e}, payload...)
	if !bytes.Equal(got, want) {
		t.Errorf("file bytes mismatch: len got %d want %d", len(got), len(want))
	}
}
