package streamer

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/go-mysql-org/go-mysql/client"
	"github.com/go-mysql-org/go-mysql/mysql"

	"github.com/adrijshikhar/binsight/internal/config"
)

const probeDialTimeout = 10 * time.Second

// serverInfo is what one probe connection learns before syncing starts.
type serverInfo struct {
	gtidMode bool
	file     string // server's current binlog basename
	pos      int64  // server's current write position (unused: we snap to 4)
}

// gtidModeOn decides the resume path. MariaDB has no gtid_mode — GTIDs are
// always present. MySQL must be fully ON: in the _PERMISSIVE modes anonymous
// transactions may exist that a GTID-set resume would silently skip.
func gtidModeOn(flavor, val string) bool {
	if flavor == "mariadb" {
		return true
	}
	return strings.EqualFold(val, "ON")
}

// probeServer opens a short-lived client connection to learn gtid mode and
// the current binlog file. Connection/auth errors surface to the reconnect
// loop, which classifies them.
func probeServer(cfg config.Stream) (*serverInfo, error) {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	conn, err := client.ConnectWithTimeout(addr, cfg.User, cfg.Password, "", probeDialTimeout)
	if err != nil {
		return nil, fmt.Errorf("probe connect %s: %w", addr, err)
	}
	defer conn.Close()

	info := &serverInfo{}
	if cfg.Flavor == "mariadb" {
		info.gtidMode = true
	} else {
		gtidRes, err := conn.Execute("SELECT @@gtid_mode")
		if err != nil {
			return nil, fmt.Errorf("probe gtid_mode: %w", err)
		}
		v, err := gtidRes.GetString(0, 0)
		if err != nil {
			return nil, fmt.Errorf("probe: read @@gtid_mode: %w", err)
		}
		info.gtidMode = gtidModeOn(cfg.Flavor, v)
	}

	// MySQL 8.4 removed SHOW MASTER STATUS; try the new form first.
	// Fall back to SHOW MASTER STATUS only when the server rejects the statement
	// as unknown/unsupported (older MySQL/MariaDB). Any other error (e.g. missing
	// REPLICATION CLIENT privilege) is surfaced immediately so it is not masked.
	statusRes, err := conn.Execute("SHOW BINARY LOG STATUS")
	if err != nil {
		if !isUnknownStmtErr(err) {
			return nil, fmt.Errorf("probe binlog status: %w", err)
		}
		var err2 error
		statusRes, err2 = conn.Execute("SHOW MASTER STATUS")
		if err2 != nil {
			return nil, fmt.Errorf("probe binlog status (is log_bin enabled?): %w", err2)
		}
	}
	if statusRes.RowNumber() == 0 {
		return nil, fmt.Errorf("probe: server reports no binary logs (log_bin off?)")
	}
	f, err := statusRes.GetStringByName(0, "File")
	if err != nil {
		return nil, fmt.Errorf("probe: read File column: %w", err)
	}
	p, err := statusRes.GetIntByName(0, "Position")
	if err != nil {
		return nil, fmt.Errorf("probe: read Position column: %w", err)
	}
	info.file, info.pos = f, p
	return info, nil
}

// isUnknownStmtErr reports whether err is a MySQL server error indicating that
// the statement is unknown or not supported by this server version
// (ER_PARSE_ERROR=1064, ER_SYNTAX_ERROR=1149, ER_NOT_SUPPORTED_YET=1235).
// Only these codes justify falling back to an older SQL variant; all other
// errors (e.g. access-denied, ER_SPECIFIC_ACCESS_DENIED_ERROR) are real
// failures that must not be silently retried as a different statement.
func isUnknownStmtErr(err error) bool {
	var me *mysql.MyError
	if !errors.As(err, &me) {
		return false
	}
	switch me.Code {
	case mysql.ER_PARSE_ERROR, mysql.ER_SYNTAX_ERROR, mysql.ER_NOT_SUPPORTED_YET:
		return true
	}
	return false
}
