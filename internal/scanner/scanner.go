// Package scanner discovers binlog files: via the *.index file when present
// (authoritative, like MySQL itself), else by treating every regular file in
// the directory as a candidate and keeping those whose first four bytes are the
// binlog magic (0xfe 'bin'). Names are irrelevant — a binlog can be named
// anything; non-binlog files are simply skipped.
package scanner

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

var magic = []byte{0xfe, 0x62, 0x69, 0x6e}

// Discovered is one candidate binlog file found on disk.
type Discovered struct {
	Path    string `json:"path"`
	Size    int64  `json:"size"`
	MagicOK bool   `json:"magic_ok"`
}

// Scan discovers binlog files under target (a directory or a single file).
func Scan(target string) ([]Discovered, error) {
	st, err := os.Stat(target)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		d := check(target, st.Size())
		return []Discovered{d}, nil
	}

	entries, err := os.ReadDir(target)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".index") && !e.IsDir() {
			return scanIndexFile(filepath.Join(target, e.Name()), target)
		}
	}

	var out []Discovered
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		// Every file is a candidate; keep only real binlogs (magic match).
		if d := check(filepath.Join(target, e.Name()), info.Size()); d.MagicOK {
			out = append(out, d)
		}
	}
	return out, nil
}

func scanIndexFile(indexPath, dir string) ([]Discovered, error) {
	f, err := os.Open(indexPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []Discovered
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		p := line
		if !filepath.IsAbs(p) {
			p = filepath.Join(dir, filepath.Base(line))
		}
		st, err := os.Stat(p)
		if err != nil {
			continue // listed but missing — skip
		}
		out = append(out, check(p, st.Size()))
	}
	return out, sc.Err()
}

func check(path string, size int64) Discovered {
	// Canonicalize to an absolute path so the same physical file dedupes in
	// the index regardless of how the watch dir was specified (e.g. "." vs an
	// absolute path). Fall back to the original path if Abs fails.
	if abs, err := filepath.Abs(path); err == nil {
		path = abs
	}
	d := Discovered{Path: path, Size: size}
	f, err := os.Open(path)
	if err != nil {
		return d
	}
	defer f.Close()
	head := make([]byte, 4)
	if n, _ := f.Read(head); n == 4 {
		d.MagicOK = string(head) == string(magic)
	}
	return d
}
