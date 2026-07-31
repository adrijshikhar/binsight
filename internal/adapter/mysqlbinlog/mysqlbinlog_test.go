package mysqlbinlog

import (
	"context"
	"io"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
)

func TestDecodeFixtureWithBinary(t *testing.T) {
	if _, err := exec.LookPath("mysqlbinlog"); err != nil {
		t.Skip("mysqlbinlog not installed")
	}
	_, thisFile, _, _ := runtime.Caller(0)
	fixture := filepath.Join(filepath.Dir(thisFile), "..", "..", "testdata", "binlog.000002")

	a := New("mysqlbinlog")
	stream, err := a.Decode(context.Background(), adapter.Source{Path: fixture}, adapter.DecodeOpts{})
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	n := 0
	sawWrite := false
	for {
		ev, err := stream.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		n++
		if ev.Header.TypeName == "WRITE_ROWS_V2" {
			sawWrite = true
			if len(ev.Decoded.Rows) == 0 {
				t.Fatal("write rows must carry row images")
			}
		}
	}
	if n < 15 || !sawWrite {
		t.Fatalf("decoded %d events, sawWrite=%v", n, sawWrite)
	}
}
