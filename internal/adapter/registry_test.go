package adapter

import (
	"context"
	"testing"

	"github.com/adrijshikhar/binsight/internal/schema"
)

type fakeAdapter struct {
	name     string
	caps     Capabilities
	supports func(string) bool
}

func (f *fakeAdapter) Name() string               { return f.name }
func (f *fakeAdapter) Capabilities() Capabilities { return f.caps }
func (f *fakeAdapter) Supports(v string) bool {
	if f.supports == nil {
		return true
	}
	return f.supports(v)
}
func (f *fakeAdapter) Decode(ctx context.Context, src Source, opts DecodeOpts) (EventStream, error) {
	return nil, nil
}

func TestRegistryRoleValidation(t *testing.T) {
	r := NewRegistry()
	r.Register(&fakeAdapter{name: "full", caps: Capabilities{FullScan: true, RowImages: true}})
	r.Register(&fakeAdapter{name: "weak", caps: Capabilities{RowImages: true}})

	if err := r.SetRole(RoleIndexer, "full"); err != nil {
		t.Fatalf("full should qualify as indexer: %v", err)
	}
	if err := r.SetRole(RoleIndexer, "weak"); err == nil {
		t.Fatal("weak lacks FullScan, must be rejected as indexer")
	}
	if err := r.SetRole(RoleIndexer, "missing"); err == nil {
		t.Fatal("unknown adapter must be rejected")
	}
}

func TestRegistryDiffSet(t *testing.T) {
	r := NewRegistry()
	r.Register(&fakeAdapter{name: "a", caps: Capabilities{FullScan: true}})
	r.Register(&fakeAdapter{name: "b", caps: Capabilities{FullScan: true}})
	if err := r.SetDiffSet([]string{"a", "b"}); err != nil {
		t.Fatal(err)
	}
	got := r.DiffSet()
	if len(got) != 2 || got[0].Name() != "a" || got[1].Name() != "b" {
		t.Fatalf("diff set wrong: %v", got)
	}
}

func TestRoleLookup(t *testing.T) {
	r := NewRegistry()
	r.Register(&fakeAdapter{name: "x", caps: Capabilities{FullScan: true, SeekDecode: true}})
	if err := r.SetRole(RoleIndexer, "x"); err != nil {
		t.Fatal(err)
	}
	if r.ForRole(RoleIndexer).Name() != "x" {
		t.Fatal("role lookup failed")
	}
	if r.ForRole(RoleDetail) != nil {
		t.Fatal("unset role must return nil")
	}
	_ = schema.Version // keep import honest
}
