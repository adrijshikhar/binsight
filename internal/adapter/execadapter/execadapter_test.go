package execadapter

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/adapter"
)

func writeScript(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "fake-adapter.sh")
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestExecAdapterStreamsJSONLines(t *testing.T) {
	script := writeScript(t, `
echo '{"schema_version":1,"header":{"pos":4,"ts":100,"type_code":15,"type_name":"FORMAT_DESCRIPTION","server_id":1,"size":122,"next_pos":126,"flags":0},"decode_confidence":"full"}'
echo '{"schema_version":1,"header":{"pos":126,"ts":101,"type_code":2,"type_name":"QUERY","server_id":1,"size":80,"next_pos":206,"flags":0},"decoded":{"sql":"BEGIN"},"decode_confidence":"full"}'
`)
	a := New("fake", []string{script}, adapter.Capabilities{FullScan: true})
	stream, err := a.Decode(context.Background(), adapter.Source{Path: "/x"}, adapter.DecodeOpts{})
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()

	ev1, err := stream.Next()
	if err != nil {
		t.Fatal(err)
	}
	if ev1.Header.Pos != 4 || ev1.Header.TypeName != "FORMAT_DESCRIPTION" {
		t.Fatalf("ev1 wrong: %+v", ev1)
	}
	ev2, err := stream.Next()
	if err != nil {
		t.Fatal(err)
	}
	if ev2.Decoded == nil || ev2.Decoded.SQL != "BEGIN" {
		t.Fatalf("ev2 wrong: %+v", ev2)
	}
	if _, err := stream.Next(); err != io.EOF {
		t.Fatalf("want EOF, got %v", err)
	}
}

func TestExecAdapterBadLineBecomesDecodeError(t *testing.T) {
	script := writeScript(t, `
echo 'this is not json'
echo '{"schema_version":1,"header":{"pos":4,"ts":1,"type_code":15,"type_name":"FORMAT_DESCRIPTION","server_id":1,"size":1,"next_pos":5,"flags":0},"decode_confidence":"full"}'
`)
	a := New("fake", []string{script}, adapter.Capabilities{FullScan: true})
	stream, _ := a.Decode(context.Background(), adapter.Source{Path: "/x"}, adapter.DecodeOpts{})
	defer stream.Close()
	ev, err := stream.Next()
	if err != nil {
		t.Fatal(err)
	}
	if ev.Header.TypeName != "DECODE_ERROR" || ev.Error == "" {
		t.Fatalf("bad line must yield DECODE_ERROR event, got %+v", ev)
	}
	ev2, err := stream.Next()
	if err != nil || ev2.Header.Pos != 4 {
		t.Fatalf("stream must continue after bad line: %v %+v", err, ev2)
	}
}

func TestExecAdapterNonzeroExit(t *testing.T) {
	script := writeScript(t, `
echo 'fatal: cannot open file' >&2
exit 3
`)
	a := New("fake", []string{script}, adapter.Capabilities{FullScan: true})
	stream, err := a.Decode(context.Background(), adapter.Source{Path: "/x"}, adapter.DecodeOpts{})
	if err != nil {
		return // acceptable: error at spawn-result time
	}
	defer stream.Close()
	_, err = stream.Next()
	if err == nil || err == io.EOF {
		t.Fatalf("nonzero exit must surface as error, got %v", err)
	}
}
