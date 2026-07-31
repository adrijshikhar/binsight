package adapter

// ResolveForRole picks the best decoder for a file of the given server_version
// for a role, per version-testing spec §8:
//
//  1. the role-assigned adapter, if it Supports(serverVersion);
//  2. else any registered adapter that qualifies for the role AND Supports it;
//  3. else the role-assigned adapter with ok=false (caller flags low
//     decode_confidence);
//  4. else (no role assigned) nil, false.
//
// NOTE: not yet wired into the live index/detail path. With a single broad
// builtin adapter the routing is a no-op; wiring lands with the first
// version-specific exec sidecar (spec phase 4), at which point ok=false should
// set decode_confidence on the indexed file.
func (r *Registry) ResolveForRole(role Role, serverVersion string) (Decoder, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	def := r.adapters[r.roles[role]]
	if def != nil && def.Supports(serverVersion) {
		return def, true
	}
	for _, d := range r.adapters {
		if roleQualifies(role, d.Capabilities()) && d.Supports(serverVersion) {
			return d, true
		}
	}
	if def != nil {
		return def, false
	}
	return nil, false
}
