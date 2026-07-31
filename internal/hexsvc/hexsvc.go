// Package hexsvc reads raw event bytes straight from the binlog file —
// independent of all adapters — and annotates the 19-byte common header.
package hexsvc

import (
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"io"
	"os"

	"github.com/adrijshikhar/binsight/internal/schema"
)

// Annotation labels a byte range within the event with a decoded field. Offsets
// are absolute within the event (not the window).
type Annotation struct {
	Field string `json:"field"`
	Start int    `json:"start"` // byte offset within event
	End   int    `json:"end"`   // exclusive
	Value string `json:"value"`
}

// Result is one hex window of an event: WinStart..WinStart+len(Bytes) of Total.
// The UI renders one element per byte, so events are paged in windows rather
// than dumped whole. CRC is validated over the entire event (streamed) and is
// only carried on the first window (WinStart==0) to avoid re-reading a large
// event on every page.
type Result struct {
	Pos         int64        `json:"pos"`
	Total       int          `json:"total"`     // full event size in bytes
	WinStart    int          `json:"win_start"` // offset of this window within the event
	Bytes       []byte       `json:"bytes"`     // window bytes (base64); len ≤ WindowBytes
	Annotations []Annotation `json:"annotations"`
	CRCChecked  bool         `json:"crc_checked"`
	CRCValid    bool         `json:"crc_valid"`
}

const maxEventBytes = 64 * 1024 * 1024

// WindowBytes caps how many bytes one hex window returns/renders.
const WindowBytes = 4 * 1024

// ReadEvent returns the hex window [winStart, winStart+winLen) of the event at
// pos. It never loads more than one window into memory; the CRC (when checked)
// is streamed over the whole event in chunks and only on the first window.
func ReadEvent(path string, pos, size int64, checksumAlgo string, winStart, winLen int64) (*Result, error) {
	if size <= 0 || size > maxEventBytes {
		return nil, fmt.Errorf("invalid event size %d", size)
	}
	if winStart < 0 {
		winStart = 0
	}
	if winStart > size {
		winStart = size
	}
	if winLen <= 0 || winLen > WindowBytes {
		winLen = WindowBytes
	}
	if avail := size - winStart; winLen > avail {
		winLen = avail
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	buf := make([]byte, winLen)
	if winLen > 0 {
		if _, err := f.ReadAt(buf, pos+winStart); err != nil {
			return nil, fmt.Errorf("read %d bytes at %d: %w", winLen, pos+winStart, err)
		}
	}
	res := &Result{Pos: pos, Total: int(size), WinStart: int(winStart), Bytes: buf}

	// Header annotations (absolute offsets 0..19) come from the event header,
	// read independently so they're available on any window.
	if size >= 19 {
		hdr := make([]byte, 19)
		if _, err := f.ReadAt(hdr, pos); err == nil {
			res.Annotations = []Annotation{
				{"timestamp", 0, 4, fmt.Sprintf("%d", binary.LittleEndian.Uint32(hdr[0:4]))},
				{"type_code", 4, 5, fmt.Sprintf("0x%02X %s", hdr[4], schema.TypeName(hdr[4]))},
				{"server_id", 5, 9, fmt.Sprintf("%d", binary.LittleEndian.Uint32(hdr[5:9]))},
				{"event_size", 9, 13, fmt.Sprintf("%d", binary.LittleEndian.Uint32(hdr[9:13]))},
				{"next_pos", 13, 17, fmt.Sprintf("%d", binary.LittleEndian.Uint32(hdr[13:17]))},
				{"flags", 17, 19, fmt.Sprintf("0x%04X", binary.LittleEndian.Uint16(hdr[17:19]))},
			}
		}
	}

	// CRC over the whole event, streamed, only on the first window.
	if checksumAlgo == "CRC32" && size >= 23 && winStart == 0 {
		if want, got, err := streamCRC(f, pos, size); err == nil {
			res.CRCChecked = true
			res.CRCValid = want == got
			res.Annotations = append(res.Annotations, Annotation{
				"crc32", int(size) - 4, int(size), fmt.Sprintf("0x%08X (valid=%v)", want, res.CRCValid),
			})
		}
	}
	return res, nil
}

// streamCRC computes the IEEE CRC32 over the event body [pos, pos+size-4) and
// reads the stored 4-byte trailer, streaming in chunks so memory stays bounded.
func streamCRC(f *os.File, pos, size int64) (want, got uint32, err error) {
	sr := io.NewSectionReader(f, pos, size)
	h := crc32.NewIEEE()
	if _, err = io.CopyN(h, sr, size-4); err != nil {
		return 0, 0, err
	}
	var tail [4]byte
	if _, err = io.ReadFull(sr, tail[:]); err != nil {
		return 0, 0, err
	}
	return binary.LittleEndian.Uint32(tail[:]), h.Sum32(), nil
}
