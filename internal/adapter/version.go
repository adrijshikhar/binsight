package adapter

import (
	"regexp"
	"strconv"
	"strings"
)

// Flavor is the server family parsed from a server_version string.
type Flavor int

const (
	FlavorUnknown Flavor = iota
	FlavorMySQL
	FlavorMariaDB
)

// ServerVersion is a parsed semver + flavor from a FORMAT_DESCRIPTION server_version.
type ServerVersion struct {
	Flavor Flavor
	Major  int
	Minor  int
	Patch  int
}

var verRe = regexp.MustCompile(`(\d+)\.(\d+)\.(\d+)`)

// ParseServerVersion extracts flavor + numeric version from strings like
// "8.0.29", "5.7.31-log", or "10.6.4-MariaDB-1:...". MariaDB ≥10 sometimes
// prefixes a legacy "5.5.5-" compatibility tag; the real version follows, so
// when the string mentions MariaDB we take the LAST semver match and force the
// MariaDB flavor.
func ParseServerVersion(s string) (ServerVersion, bool) {
	if s == "" {
		return ServerVersion{}, false
	}
	matches := verRe.FindAllStringSubmatch(s, -1)
	if len(matches) == 0 {
		return ServerVersion{}, false
	}
	isMaria := strings.Contains(strings.ToLower(s), "mariadb")
	m := matches[0]
	if isMaria {
		m = matches[len(matches)-1] // skip the 5.5.5- compatibility prefix
	}
	maj, _ := strconv.Atoi(m[1])
	min, _ := strconv.Atoi(m[2])
	patch, _ := strconv.Atoi(m[3])
	flavor := FlavorMySQL
	if isMaria {
		flavor = FlavorMariaDB
	}
	return ServerVersion{Flavor: flavor, Major: maj, Minor: min, Patch: patch}, true
}

// cmp returns -1/0/1 comparing major.minor.patch (flavor ignored).
func (v ServerVersion) cmp(o ServerVersion) int {
	for _, p := range [][2]int{{v.Major, o.Major}, {v.Minor, o.Minor}, {v.Patch, o.Patch}} {
		switch {
		case p[0] < p[1]:
			return -1
		case p[0] > p[1]:
			return 1
		}
	}
	return 0
}

// VersionRange is an inclusive [Min, Max] range for one flavor. A zero Max
// means open-ended (any version ≥ Min).
type VersionRange struct {
	Flavor Flavor
	Min    ServerVersion
	Max    ServerVersion
}

// Supports reports whether serverVersion parses, matches the flavor, and falls
// within [Min, Max].
func (r VersionRange) Supports(serverVersion string) bool {
	v, ok := ParseServerVersion(serverVersion)
	if !ok || v.Flavor != r.Flavor {
		return false
	}
	if v.cmp(r.Min) < 0 {
		return false
	}
	if (r.Max != ServerVersion{}) && v.cmp(r.Max) > 0 {
		return false
	}
	return true
}
