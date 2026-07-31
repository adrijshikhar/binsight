package adapter

import "testing"

func TestParseServerVersion(t *testing.T) {
	cases := []struct {
		in     string
		flavor Flavor
		maj    int
		min    int
		patch  int
		ok     bool
	}{
		{"8.0.29", FlavorMySQL, 8, 0, 29, true},
		{"5.7.31-log", FlavorMySQL, 5, 7, 31, true},
		{"5.5.62", FlavorMySQL, 5, 5, 62, true},
		{"8.4.0", FlavorMySQL, 8, 4, 0, true},
		{"10.6.4-MariaDB-1:10.6.4+maria~focal", FlavorMariaDB, 10, 6, 4, true},
		{"5.5.5-10.4.13-MariaDB", FlavorMariaDB, 10, 4, 13, true}, // MariaDB 10.4 reports a 5.5.5- prefix
		{"", FlavorUnknown, 0, 0, 0, false},
		{"garbage", FlavorUnknown, 0, 0, 0, false},
	}
	for _, c := range cases {
		v, ok := ParseServerVersion(c.in)
		if ok != c.ok {
			t.Errorf("%q: ok=%v want %v", c.in, ok, c.ok)
			continue
		}
		if !ok {
			continue
		}
		if v.Flavor != c.flavor || v.Major != c.maj || v.Minor != c.min || v.Patch != c.patch {
			t.Errorf("%q: got %+v want flavor=%v %d.%d.%d", c.in, v, c.flavor, c.maj, c.min, c.patch)
		}
	}
}

func TestVersionRangeSupports(t *testing.T) {
	// MySQL 5.6.0 .. 8.4.999 inclusive
	r := VersionRange{Flavor: FlavorMySQL, Min: ServerVersion{Major: 5, Minor: 6}, Max: ServerVersion{Major: 8, Minor: 4, Patch: 999}}
	if !r.Supports("8.0.29") {
		t.Error("8.0.29 should be in range")
	}
	if !r.Supports("5.6.6-log") {
		t.Error("5.6.6 should be in range")
	}
	if r.Supports("5.5.62") {
		t.Error("5.5.62 below min should be excluded")
	}
	if r.Supports("10.6.4-MariaDB") {
		t.Error("MariaDB flavor must not match a MySQL range")
	}
	if r.Supports("garbage") {
		t.Error("unparseable version must not match")
	}
	// Max zero = open upper bound
	open := VersionRange{Flavor: FlavorMariaDB, Min: ServerVersion{Major: 10}}
	if !open.Supports("11.2.1-MariaDB") {
		t.Error("open upper bound should accept 11.2.1")
	}
	if open.Supports("8.0.29") {
		t.Error("MySQL must not match a MariaDB range")
	}
}
