package main

import "testing"

// resetStmt drives a live server, and the wrong statement breaks generation
// (RESET MASTER is gone in 8.4+; RESET BINARY LOGS AND GTIDS is a syntax error
// pre-8.4). Lock the version boundary.
func TestResetStmt(t *testing.T) {
	const old = "RESET MASTER;"
	const new84 = "RESET BINARY LOGS AND GTIDS;"
	cases := map[string]string{
		"8.4.3":           new84,
		"8.4.0":           new84,
		"9.0.0":           new84,
		"8.0.39":          old,
		"8.0.20":          old,
		"5.7.44-log":      old,
		"5.6.51":          old,
		"10.6.18-MariaDB": old, // MariaDB keeps RESET MASTER regardless of major
		"11.4.3-MariaDB":  old,
		"garbage":         old, // unparseable → safe default
	}
	for ver, want := range cases {
		if got := resetStmt(ver); got != want {
			t.Errorf("resetStmt(%q) = %q, want %q", ver, got, want)
		}
	}
}
