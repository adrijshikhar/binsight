package streamer

import (
	"fmt"
	"testing"

	"github.com/go-mysql-org/go-mysql/mysql"
)

func TestIsUnknownStmtErr(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want bool
	}{
		{"nil", nil, false},
		{"generic error", fmt.Errorf("some error"), false},
		{"ER_PARSE_ERROR (1064)", mysql.NewError(mysql.ER_PARSE_ERROR, "You have an error in your SQL syntax"), true},
		{"ER_SYNTAX_ERROR (1149)", mysql.NewError(mysql.ER_SYNTAX_ERROR, "syntax error"), true},
		{"ER_NOT_SUPPORTED_YET (1235)", mysql.NewError(mysql.ER_NOT_SUPPORTED_YET, "this version does not yet support"), true},
		{"ER_SPECIFIC_ACCESS_DENIED (1227)", mysql.NewError(1227, "Access denied; you need the REPLICATION CLIENT privilege"), false},
		{"ER_ACCESS_DENIED (1045)", mysql.NewError(1045, "Access denied for user"), false},
		{"wrapped unknown stmt", fmt.Errorf("probe: %w", mysql.NewError(mysql.ER_PARSE_ERROR, "syntax")), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := isUnknownStmtErr(tc.err); got != tc.want {
				t.Errorf("isUnknownStmtErr(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestGTIDModeOn(t *testing.T) {
	for _, tc := range []struct {
		flavor, val string
		want        bool
	}{
		{"mysql", "ON", true},
		{"mysql", "on", true},
		{"mysql", "OFF", false},
		{"mysql", "OFF_PERMISSIVE", false},
		{"mysql", "ON_PERMISSIVE", false}, // not fully on: anonymous txns possible → file+pos
		{"mariadb", "", true},             // MariaDB: GTIDs always present
	} {
		if got := gtidModeOn(tc.flavor, tc.val); got != tc.want {
			t.Errorf("gtidModeOn(%q,%q) = %v, want %v", tc.flavor, tc.val, got, tc.want)
		}
	}
}
