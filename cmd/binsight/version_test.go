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
