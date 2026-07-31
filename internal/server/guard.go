package server

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// The API is unauthenticated by design (see cmd/binsight/main.go). Binding
// loopback keeps other machines out, but it is no defence at all against the
// victim's own browser being aimed at us by a hostile page. Two distinct
// attacks arrive that way, and neither check below subsumes the other:
//
//   - DNS rebinding. The attacker page keeps its own origin (evil.com) and
//     re-points that hostname at 127.0.0.1, so it becomes same-origin with us
//     and can read every response — including decoded row data. Origin and
//     Sec-Fetch-Site both look same-origin and say nothing; only the Host
//     header still carries "evil.com". Hence the Host allowlist.
//   - CSRF. A cross-origin form POST is a CORS "simple request": no preflight,
//     so the browser sends it and the absent CORS policy never comes into
//     play. Here Host is legitimately ours and Origin / Sec-Fetch-Site are
//     what give it away.

// loopbackHost reports whether a Host-style "name[:port]" refers to this
// machine. Anything else in a Host header means we were reached under a name
// we do not answer to.
func loopbackHost(host string) bool {
	h, _, err := net.SplitHostPort(host)
	if err != nil {
		h = host // no port present
	}
	h = strings.Trim(h, "[]") // bare IPv6 literal
	if h == "localhost" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// crossOrigin reports whether a page on another origin initiated the request.
// Sec-Fetch-Site is authoritative wherever present — every browser current
// enough to mount these attacks sends it, and non-browser clients do not.
// Origin is the fallback for the rest.
func crossOrigin(req *http.Request) bool {
	if s := req.Header.Get("Sec-Fetch-Site"); s != "" {
		return s == "cross-site" || s == "same-site"
	}
	origin := req.Header.Get("Origin")
	if origin == "" {
		return false // non-browser client, or a same-origin GET
	}
	u, err := url.Parse(origin)
	if err != nil {
		return true
	}
	// A loopback origin is another local page, already inside the trust
	// boundary — and it is what the Vite dev proxy forwards (:5173 → :8080).
	return u.Host != req.Host && !loopbackHost(u.Host)
}

// guardBrowser refuses requests a hostile web page could aim at this
// unauthenticated local server.
//
// The Host allowlist is dropped when BV_BIND is set: the operator has then
// deliberately exposed the server behind a trusted network or reverse proxy,
// where a non-loopback (or proxy-rewritten) Host is the norm. Making the check
// unsatisfiable there would just break the documented deployment.
func guardBrowser(next http.Handler) http.Handler {
	checkHost := os.Getenv("BV_BIND") == "" // boot-time; see cmd/binsight/main.go
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if checkHost && !loopbackHost(req.Host) {
			respondError(w, http.StatusForbidden, "host not allowed")
			return
		}
		if crossOrigin(req) {
			respondError(w, http.StatusForbidden, "cross-origin request refused")
			return
		}
		next.ServeHTTP(w, req)
	})
}
