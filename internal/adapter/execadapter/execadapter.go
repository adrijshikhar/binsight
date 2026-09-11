// Package execadapter bridges any subprocess speaking the JSON-lines
// protocol into the Decoder interface. This is how Java/Python adapters
// plug in without core changes.
package execadapter

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/schema"
)

// Adapter wraps an external command speaking JSON-lines as a Decoder.
type Adapter struct {
	name     string
	cmd      []string
	caps     adapter.Capabilities
	supports func(string) bool // optional version predicate; nil = supports all
}

// New builds an exec adapter. cmd[0] is the binary, cmd[1:] fixed args.
func New(name string, cmd []string, caps adapter.Capabilities) *Adapter {
	return &Adapter{name: name, cmd: cmd, caps: caps}
}

// SetSupports installs a version predicate so a version-specific sidecar can
// declare the server_version range it handles (parsed from BINSIGHT_EXEC_ADAPTERS
// config when sidecars are wired up). Returns the adapter for chaining.
func (a *Adapter) SetSupports(pred func(string) bool) *Adapter {
	a.supports = pred
	return a
}

func (a *Adapter) Name() string                       { return a.name }
func (a *Adapter) Capabilities() adapter.Capabilities { return a.caps }

// Supports reports whether the configured predicate accepts serverVersion. A
// sidecar with no declared range defaults to supporting all versions.
func (a *Adapter) Supports(serverVersion string) bool {
	if a.supports == nil {
		return true
	}
	return a.supports(serverVersion)
}

type stream struct {
	cmd     *exec.Cmd
	scanner *bufio.Scanner
	stderr  *strings.Builder
	waited  bool
	closed  bool
}

func (s *stream) Next() (*schema.Event, error) {
	for s.scanner.Scan() {
		line := strings.TrimSpace(s.scanner.Text())
		if line == "" {
			continue
		}
		var ev schema.Event
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			// bad line → decode error event, stream continues
			excerpt := line
			if len(excerpt) > 200 {
				excerpt = excerpt[:200]
			}
			return schema.NewDecodeError(0, "invalid json-lines output: "+err.Error(), []byte(excerpt)), nil
		}
		if ev.SchemaVersion != schema.Version {
			return schema.NewDecodeError(ev.Header.Pos,
				fmt.Sprintf("schema version mismatch: got %d want %d", ev.SchemaVersion, schema.Version), nil), nil
		}
		return &ev, nil
	}
	if err := s.scanner.Err(); err != nil {
		return nil, err
	}
	if !s.waited {
		s.waited = true
		if err := s.cmd.Wait(); err != nil {
			return nil, fmt.Errorf("adapter exited: %w; stderr: %s", err, s.stderr.String())
		}
	}
	return nil, io.EOF
}

func (s *stream) Close() error {
	if s.closed {
		return nil
	}
	s.closed = true
	if !s.waited && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		s.waited = true
		_ = s.cmd.Wait()
	}
	return nil
}

// Decode spawns the subprocess with protocol flags and streams its stdout.
func (a *Adapter) Decode(ctx context.Context, src adapter.Source, opts adapter.DecodeOpts) (adapter.EventStream, error) {
	args := append([]string{}, a.cmd[1:]...)
	args = append(args, "--file", src.Path, "--format", "json-lines")
	if src.Offset > 0 {
		args = append(args, "--offset", strconv.FormatUint(src.Offset, 10))
	}
	if opts.Limit > 0 {
		args = append(args, "--limit", strconv.Itoa(opts.Limit))
	}
	if opts.AtPos > 0 {
		args = append(args, "--at-pos", strconv.FormatUint(opts.AtPos, 10))
	}
	cmd := exec.CommandContext(ctx, a.cmd[0], args...)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("spawn adapter %q: %w", a.name, err)
	}
	sc := bufio.NewScanner(stdout)
	sc.Buffer(make([]byte, 1024*1024), 64*1024*1024)
	return &stream{cmd: cmd, scanner: sc, stderr: &stderr}, nil
}
