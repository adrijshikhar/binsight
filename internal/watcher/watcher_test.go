package watcher

import (
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// A burst of writes within the debounce window collapses to exactly one onChange.
func TestWatcherDebouncesBurst(t *testing.T) {
	dir := t.TempDir()
	var n int32
	w, err := New(dir, 80*time.Millisecond, func() { atomic.AddInt32(&n, 1) })
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	w.Start(context.Background())

	path := filepath.Join(dir, "binlog.000001")
	for i := 0; i < 5; i++ {
		if err := os.WriteFile(path, []byte{byte(i)}, 0o644); err != nil {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond) // all 5 writes span ~25ms < 80ms debounce
	}
	time.Sleep(250 * time.Millisecond) // let the debounce fire

	if got := atomic.LoadInt32(&n); got != 1 {
		t.Fatalf("burst within debounce window must yield exactly 1 onChange, got %d", got)
	}
}

// New on a non-existent directory returns an error (caller falls back to no tail).
func TestWatcherNewBadDir(t *testing.T) {
	_, err := New(filepath.Join(t.TempDir(), "does-not-exist"), 10*time.Millisecond, func() {})
	if err == nil {
		t.Fatal("expected error adding a non-existent directory")
	}
}

// Close is idempotent: a second call returns nil, not fsnotify's "already closed".
func TestWatcherCloseIdempotent(t *testing.T) {
	dir := t.TempDir()
	w, err := New(dir, 10*time.Millisecond, func() {})
	if err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("first Close: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("second Close must be a no-op, got %v", err)
	}
}

// Close stops the loop: no onChange fires for events after Close.
func TestWatcherCloseStopsLoop(t *testing.T) {
	dir := t.TempDir()
	var n int32
	w, err := New(dir, 30*time.Millisecond, func() { atomic.AddInt32(&n, 1) })
	if err != nil {
		t.Fatal(err)
	}
	w.Start(context.Background())
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "x"), []byte("y"), 0o644)
	time.Sleep(100 * time.Millisecond)
	if got := atomic.LoadInt32(&n); got != 0 {
		t.Fatalf("no onChange must fire after Close, got %d", got)
	}
}
