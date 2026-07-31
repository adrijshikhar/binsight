// Package sqlkw provides lightweight, dependency-free detection of the leading
// keyword of a SQL statement. It is the single source of truth for the cheap
// "does this statement look like DDL?" prefix check used across the indexer,
// schema builder, and anomaly detectors — distinct from the full vitess parse
// in internal/ddl, which is reserved for statements that pass this filter.
package sqlkw

import "strings"

// ddlKeywords are the statement-leading keywords that mark a DDL statement,
// matched as whole words (followed by space, tab, '(', or end of string).
var ddlKeywords = []string{"CREATE", "ALTER", "DROP", "RENAME", "TRUNCATE"}

// Leading returns the canonical uppercase leading DDL keyword of sql (one of
// ddlKeywords) when sql begins with one as a whole word, or "" otherwise.
// Leading whitespace is ignored.
func Leading(sql string) string {
	u := strings.ToUpper(strings.TrimSpace(sql))
	for _, kw := range ddlKeywords {
		if strings.HasPrefix(u, kw) {
			rest := u[len(kw):]
			if rest == "" || rest[0] == ' ' || rest[0] == '\t' || rest[0] == '(' {
				return kw
			}
		}
	}
	return ""
}

// IsDDL reports whether sql begins with a DDL keyword (whole word).
func IsDDL(sql string) bool { return Leading(sql) != "" }
