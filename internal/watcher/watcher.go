// Package watcher reports directory changes via a debounced callback. It wraps
// fsnotify and knows nothing about binlogs: any filesystem event on the watched
// directory (create/write/rename/remove/chmod) resets the debounce timer, so a
// burst collapses to a single onChange after a quiet interval.
package watcher

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Watcher debounces fsnotify events for one directory.
type Watcher struct {
	fsw      *fsnotify.Watcher
	debounce time.Duration
	onChange func()
	closed   chan struct{}
	once     sync.Once
}

// New creates a watcher on dir. It returns an error if fsnotify cannot be
// initialised or dir cannot be added; the caller treats that as "no live tail"
// and continues. debounce is the quiet window after the last event before
// onChange fires.
func New(dir string, debounce time.Duration, onChange func()) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	if err := fsw.Add(dir); err != nil {
		_ = fsw.Close()
		return nil, err
	}
	return &Watcher{
		fsw:      fsw,
		debounce: debounce,
		onChange: onChange,
		closed:   make(chan struct{}),
	}, nil
}

// Start runs the debounce loop in a goroutine until ctx is cancelled or Close
// is called.
func (w *Watcher) Start(ctx context.Context) {
	go w.loop(ctx)
}

func (w *Watcher) loop(ctx context.Context) {
	var timer *time.Timer
	var fire <-chan time.Time // nil until an event arrives; a nil channel blocks
	defer func() {
		if timer != nil {
			timer.Stop()
		}
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.closed:
			return
		case _, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			if timer == nil {
				timer = time.NewTimer(w.debounce)
			} else {
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(w.debounce)
			}
			fire = timer.C
		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			log.Printf("watcher: %v", err)
		case <-fire:
			fire = nil
			w.onChange()
		}
	}
}

// Close stops the loop and releases the fsnotify watcher. Safe to call once.
func (w *Watcher) Close() error {
	var err error
	w.once.Do(func() {
		close(w.closed)
		err = w.fsw.Close()
	})
	return err
}
