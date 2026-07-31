package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

type httptestServerWrap struct {
	srv *Server
	ts  *httptest.Server
}

func newWrap(t *testing.T) *httptestServerWrap {
	srv, ts := newTestServer(t)
	return &httptestServerWrap{srv: srv, ts: ts}
}

// find the first WRITE_ROWS_V2 event in the indexed fixture
func firstWriteEvent(t *testing.T, w *httptestServerWrap) (int64, int64) {
	t.Helper()
	var files []*store.File
	get(t, w.ts, "/api/files", &files)
	fid := files[0].ID
	var page store.EventPage
	get(t, w.ts, "/api/events?file="+itoa(fid)+"&type=WRITE_ROWS_V2&limit=1", &page)
	if len(page.Events) == 0 {
		t.Fatal("fixture has no write rows event")
	}
	return fid, page.Events[0].Pos
}

func TestEventDetailReturnsRowImages(t *testing.T) {
	w := newWrap(t)
	fid, pos := firstWriteEvent(t, w)
	var detail map[string]any
	get(t, w.ts, "/api/events/"+itoa(fid)+"/"+itoa(pos), &detail)
	dec, ok := detail["decoded"].(map[string]any)
	if !ok {
		t.Fatalf("no decoded layer: %v", detail)
	}
	rows, ok := dec["rows"].([]any)
	if !ok || len(rows) == 0 {
		t.Fatalf("no row images in detail: %v", dec)
	}
}

func TestEventHex(t *testing.T) {
	w := newWrap(t)
	fid, pos := firstWriteEvent(t, w)
	var hex map[string]any
	get(t, w.ts, "/api/events/"+itoa(fid)+"/"+itoa(pos)+"/hex", &hex)
	if hex["bytes"] == nil {
		t.Fatalf("hex bytes missing: %v", hex)
	}
	anns, ok := hex["annotations"].([]any)
	if !ok || len(anns) < 6 {
		t.Fatalf("want >=6 header annotations, got %v", hex["annotations"])
	}
	if hex["crc_checked"] == true && hex["crc_valid"] != true {
		t.Fatalf("fixture event must pass CRC: %v", hex)
	}
}

func TestEventDiff(t *testing.T) {
	w := newWrap(t)
	fid, pos := firstWriteEvent(t, w)
	var diff map[string]any
	get(t, w.ts, "/api/events/"+itoa(fid)+"/"+itoa(pos)+"/diff", &diff)
	fields, ok := diff["fields"].([]any)
	if !ok || len(fields) == 0 {
		t.Fatalf("diff fields missing: %v", diff)
	}
}

func TestDetailUnknownPos404(t *testing.T) {
	w := newWrap(t)
	var files []*store.File
	get(t, w.ts, "/api/files", &files)
	resp := get(t, w.ts, "/api/events/"+itoa(files[0].ID)+"/99999999", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown pos must 404, got %d", resp.StatusCode)
	}
}
