package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/adrijshikhar/binsight/internal/config"
)

func TestGuardBrowser(t *testing.T) {
	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusTeapot) })
	h := guardBrowser(ok)

	tests := []struct {
		name    string
		host    string
		headers map[string]string
		want    int
	}{
		{"loopback ip", "127.0.0.1:8080", nil, http.StatusTeapot},
		{"localhost", "localhost:8080", nil, http.StatusTeapot},
		{"ipv6 loopback", "[::1]:8080", nil, http.StatusTeapot},
		// DNS rebinding: the page is same-origin with us, so only Host betrays it.
		{"rebound hostname", "evil.com:8080", map[string]string{"Sec-Fetch-Site": "same-origin"}, http.StatusForbidden},
		{"lan address", "192.168.1.20:8080", nil, http.StatusForbidden},
		// CSRF: Host is legitimately ours; the fetch metadata gives it away.
		{"cross-site post", "127.0.0.1:8080", map[string]string{"Sec-Fetch-Site": "cross-site"}, http.StatusForbidden},
		{"same-site post", "127.0.0.1:8080", map[string]string{"Sec-Fetch-Site": "same-site"}, http.StatusForbidden},
		{"same-origin fetch", "127.0.0.1:8080", map[string]string{"Sec-Fetch-Site": "same-origin"}, http.StatusTeapot},
		{"address-bar nav", "127.0.0.1:8080", map[string]string{"Sec-Fetch-Site": "none"}, http.StatusTeapot},
		// Origin fallback for browsers that omit Sec-Fetch-Site.
		{"foreign origin", "127.0.0.1:8080", map[string]string{"Origin": "http://evil.com"}, http.StatusForbidden},
		{"matching origin", "127.0.0.1:8080", map[string]string{"Origin": "http://127.0.0.1:8080"}, http.StatusTeapot},
		// The Vite dev proxy forwards :5173 as the Origin against a :8080 Host.
		{"dev proxy origin", "localhost:8080", map[string]string{"Origin": "http://localhost:5173"}, http.StatusTeapot},
		// curl and friends send neither header.
		{"no browser headers", "127.0.0.1:8080", nil, http.StatusTeapot},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/rescan", nil)
			req.Host = tt.host
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tt.want {
				t.Fatalf("status = %d, want %d", rec.Code, tt.want)
			}
		})
	}
}

// The password must never leave the process, but the UI still needs to know
// one is stored.
func TestRedactSettings(t *testing.T) {
	cfg := config.Config{Stream: config.Stream{Host: "db", Password: "hunter2"}}

	got := redactSettings(cfg)
	if got.Stream.Password != "" {
		t.Fatalf("password leaked: %q", got.Stream.Password)
	}
	if !got.StreamPasswordSet {
		t.Fatal("stream_password_set should be true when a password is stored")
	}
	if cfg.Stream.Password != "hunter2" {
		t.Fatal("redactSettings mutated the caller's config")
	}
	if redactSettings(config.Config{}).StreamPasswordSet {
		t.Fatal("stream_password_set should be false when no password is stored")
	}
}
