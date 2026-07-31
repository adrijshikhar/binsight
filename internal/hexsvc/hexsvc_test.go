package hexsvc

import (
	"encoding/binary"
	"hash/crc32"
	"os"
	"path/filepath"
	"testing"
)

// build a synthetic event: 19-byte header + 2 payload bytes + CRC32
func buildEvent(t *testing.T) []byte {
	ev := make([]byte, 19+2)
	binary.LittleEndian.PutUint32(ev[0:4], 1673519531) // ts
	ev[4] = 0x10                                       // XID type
	binary.LittleEndian.PutUint32(ev[5:9], 1)          // server id
	binary.LittleEndian.PutUint32(ev[9:13], 25)        // event size incl crc
	binary.LittleEndian.PutUint32(ev[13:17], 129)      // next pos
	binary.LittleEndian.PutUint16(ev[17:19], 0)        // flags
	ev[19], ev[20] = 0xAB, 0xCD                        // payload
	crc := crc32.ChecksumIEEE(ev)
	out := make([]byte, 25)
	copy(out, ev)
	binary.LittleEndian.PutUint32(out[21:25], crc)
	return out
}

func TestReadEventAnnotated(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "binlog.test")
	magic := []byte{0xfe, 0x62, 0x69, 0x6e}
	ev := buildEvent(t)
	if err := os.WriteFile(path, append(magic, ev...), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := ReadEvent(path, 4, 25, "CRC32", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Bytes) != 25 {
		t.Fatalf("want 25 bytes, got %d", len(res.Bytes))
	}
	if !res.CRCValid {
		t.Fatal("CRC must validate")
	}
	fieldByName := map[string]Annotation{}
	for _, a := range res.Annotations {
		fieldByName[a.Field] = a
	}
	ts := fieldByName["timestamp"]
	if ts.Start != 0 || ts.End != 4 || ts.Value != "1673519531" {
		t.Fatalf("timestamp annotation wrong: %+v", ts)
	}
	typ := fieldByName["type_code"]
	if typ.Start != 4 || typ.Value != "0x10 XID" {
		t.Fatalf("type annotation wrong: %+v", typ)
	}
	np := fieldByName["next_pos"]
	if np.Value != "129" {
		t.Fatalf("next_pos annotation wrong: %+v", np)
	}
}

// TestMinimalCRCEvent verifies that the off-by-one fix is correct: a 23-byte
// event (19-byte common header + 0 payload bytes + 4-byte CRC) must have
// CRCChecked=true and CRCValid=true.
func TestMinimalCRCEvent(t *testing.T) {
	// Build a 19-byte header with no payload.
	hdr := make([]byte, 19)
	binary.LittleEndian.PutUint32(hdr[0:4], 1700000000) // timestamp
	hdr[4] = 0x10                                       // XID type
	binary.LittleEndian.PutUint32(hdr[5:9], 1)          // server id
	binary.LittleEndian.PutUint32(hdr[9:13], 23)        // event size = 19 + 4 (CRC)
	binary.LittleEndian.PutUint32(hdr[13:17], 27)       // next_pos
	binary.LittleEndian.PutUint16(hdr[17:19], 0)        // flags

	// Append valid CRC32 over the 19-byte header.
	checksum := crc32.ChecksumIEEE(hdr)
	buf := make([]byte, 23)
	copy(buf, hdr)
	binary.LittleEndian.PutUint32(buf[19:23], checksum)

	dir := t.TempDir()
	path := filepath.Join(dir, "binlog.min")
	magic := []byte{0xfe, 0x62, 0x69, 0x6e}
	if err := os.WriteFile(path, append(magic, buf...), 0o644); err != nil {
		t.Fatal(err)
	}

	res, err := ReadEvent(path, 4, 23, "CRC32", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !res.CRCChecked {
		t.Fatal("CRCChecked must be true for a 23-byte event")
	}
	if !res.CRCValid {
		t.Fatal("CRCValid must be true when checksum matches")
	}
}

func TestCRCMismatchDetected(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "binlog.bad")
	magic := []byte{0xfe, 0x62, 0x69, 0x6e}
	ev := buildEvent(t)
	ev[20] = 0xFF // corrupt payload, CRC now wrong
	if err := os.WriteFile(path, append(magic, ev...), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := ReadEvent(path, 4, 25, "CRC32", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.CRCValid {
		t.Fatal("corrupted event must fail CRC")
	}
}
