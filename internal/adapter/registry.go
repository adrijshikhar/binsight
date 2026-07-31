package adapter

import (
	"fmt"
	"sync"
)

// Role names a function an adapter can be assigned to via configuration.
type Role string

const (
	RoleIndexer Role = "indexer"
	RoleDetail  Role = "detail"
	RoleStream  Role = "stream"
)

// required capability per role
func roleQualifies(role Role, c Capabilities) bool {
	switch role {
	case RoleIndexer:
		return c.FullScan
	case RoleDetail:
		return c.FullScan || c.SeekDecode // full-scan adapters can skip-to-pos
	case RoleStream:
		return c.RemoteStream
	}
	return false
}

// Registry holds all known adapters and their role assignments; safe for
// concurrent use.
type Registry struct {
	mu       sync.RWMutex
	adapters map[string]Decoder
	roles    map[Role]string
	diffSet  []string
}

func NewRegistry() *Registry {
	return &Registry{adapters: map[string]Decoder{}, roles: map[Role]string{}}
}

func (r *Registry) Register(d Decoder) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.adapters[d.Name()] = d
}

func (r *Registry) Get(name string) Decoder {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.adapters[name]
}

func (r *Registry) All() []Decoder {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Decoder, 0, len(r.adapters))
	for _, d := range r.adapters {
		out = append(out, d)
	}
	return out
}

func (r *Registry) SetRole(role Role, name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.adapters[name]
	if !ok {
		return fmt.Errorf("unknown adapter %q", name)
	}
	if !roleQualifies(role, d.Capabilities()) {
		return fmt.Errorf("adapter %q lacks capabilities for role %q", name, role)
	}
	r.roles[role] = name
	return nil
}

func (r *Registry) ForRole(role Role) Decoder {
	r.mu.RLock()
	defer r.mu.RUnlock()
	name, ok := r.roles[role]
	if !ok {
		return nil
	}
	return r.adapters[name]
}

func (r *Registry) SetDiffSet(names []string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, n := range names {
		if _, ok := r.adapters[n]; !ok {
			return fmt.Errorf("unknown adapter %q in diff set", n)
		}
	}
	r.diffSet = append([]string(nil), names...)
	return nil
}

func (r *Registry) DiffSet() []Decoder {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Decoder, 0, len(r.diffSet))
	for _, n := range r.diffSet {
		out = append(out, r.adapters[n])
	}
	return out
}
