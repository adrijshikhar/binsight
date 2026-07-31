package adapter

import "testing"

func TestResolveForRole(t *testing.T) {
	mysqlOnly := func(v string) bool {
		return VersionRange{Flavor: FlavorMySQL, Min: ServerVersion{Major: 5}}.Supports(v)
	}
	mariaOnly := func(v string) bool {
		return VersionRange{Flavor: FlavorMariaDB, Min: ServerVersion{Major: 10}}.Supports(v)
	}

	r := NewRegistry()
	def := &fakeAdapter{name: "def", caps: Capabilities{FullScan: true}, supports: mysqlOnly}
	maria := &fakeAdapter{name: "maria", caps: Capabilities{FullScan: true}, supports: mariaOnly}
	r.Register(def)
	r.Register(maria)
	if err := r.SetRole(RoleIndexer, "def"); err != nil {
		t.Fatal(err)
	}

	// 1. role-assigned adapter supports the version → pick it.
	if d, ok := r.ResolveForRole(RoleIndexer, "8.0.29"); !ok || d == nil || d.Name() != "def" {
		t.Fatalf("mysql → def supported; got %v ok=%v", d, ok)
	}
	// 2. role adapter does NOT support → fall back to any role-qualifying adapter that does.
	if d, ok := r.ResolveForRole(RoleIndexer, "10.6.4-MariaDB"); !ok || d == nil || d.Name() != "maria" {
		t.Fatalf("mariadb → maria fallback; got %v ok=%v", d, ok)
	}
	// 3. nobody supports → return the role default with ok=false (caller flags low confidence).
	if d, ok := r.ResolveForRole(RoleIndexer, "garbage"); ok || d == nil || d.Name() != "def" {
		t.Fatalf("unsupported → default+false; got %v ok=%v", d, ok)
	}
	// 4. no role assigned → nil, false.
	empty := NewRegistry()
	if d, ok := empty.ResolveForRole(RoleIndexer, "8.0.29"); d != nil || ok {
		t.Fatalf("no role → nil,false; got %v ok=%v", d, ok)
	}
}
