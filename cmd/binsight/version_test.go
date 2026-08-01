package main

import "testing"

func TestVersionStringDefault(t *testing.T) {
	if version == "" {
		t.Fatal("version must default to a non-empty string")
	}
}

func TestFormatVersionLine(t *testing.T) {
	got := formatVersion("1.2.3")
	want := "binsight 1.2.3\n"
	if got != want {
		t.Fatalf("formatVersion = %q, want %q", got, want)
	}
}

// resolveVersion must prefer an ldflags stamp, fall back to the module version
// that `go install module@vX.Y.Z` records in the build info, and only then
// report "dev". Without the build-info fallback a `go install` binary reports
// "dev" even when installed at a real tag.
func TestResolveVersion(t *testing.T) {
	tests := []struct {
		name     string
		stamped  string
		buildRev string
		want     string
	}{
		{"ldflags stamp wins", "0.1.1", "v0.9.9", "0.1.1"},
		{"go install falls back to module version", "dev", "v0.1.1", "v0.1.1"},
		{"local go build stays dev", "dev", "(devel)", "dev"},
		{"no build info stays dev", "dev", "", "dev"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveVersion(tt.stamped, tt.buildRev); got != tt.want {
				t.Fatalf("resolveVersion(%q, %q) = %q, want %q",
					tt.stamped, tt.buildRev, got, tt.want)
			}
		})
	}
}
