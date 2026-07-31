package sqlkw

import "testing"

func TestLeadingAndIsDDL(t *testing.T) {
	cases := []struct {
		in   string
		want string // expected Leading() result ("" = not DDL)
	}{
		{"CREATE TABLE t", "CREATE"},
		{"alter table t add column c int", "ALTER"},
		{"DROP TABLE t", "DROP"},
		{"TRUNCATE TABLE t", "TRUNCATE"},
		{"RENAME TABLE a TO b", "RENAME"},
		{"  alter table t", "ALTER"}, // leading whitespace trimmed
		{"CREATE(", "CREATE"},        // '(' counts as a word boundary
		{"BEGIN", ""},
		{"CREATEX TABLE t", ""}, // not a whole word
		{"ALTERATION", ""},
		{"", ""},
		{"INSERT INTO t VALUES (1)", ""},
	}
	for _, c := range cases {
		if got := Leading(c.in); got != c.want {
			t.Errorf("Leading(%q) = %q, want %q", c.in, got, c.want)
		}
		if got := IsDDL(c.in); got != (c.want != "") {
			t.Errorf("IsDDL(%q) = %v, want %v", c.in, got, c.want != "")
		}
	}
}
