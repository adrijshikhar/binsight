// Package config implements settings precedence:
// env vars (BINSIGHT_*) → persisted UI settings (SQLite) → built-in defaults.
package config

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/adrijshikhar/binsight/internal/anomaly"
	"github.com/adrijshikhar/binsight/internal/store"
)

// Stream configures the Phase 2 remote-streaming connection (one source).
// Password is persisted plaintext in the local SQLite settings — an accepted,
// documented caveat for a local debugging tool.
type Stream struct {
	Enabled       bool   `json:"enabled"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	User          string `json:"user"`
	Password      string `json:"password"`
	Flavor        string `json:"flavor"`          // "mysql" | "mariadb"
	ServerID      uint32 `json:"server_id"`       // replica server-id; must be unique in the topology
	MaxSpoolBytes int64  `json:"max_spool_bytes"` // retention cap for DataDir/spool
}

// Roles assigns adapters to functions (validated against capabilities by
// the server before persisting).
type Roles struct {
	Indexer string   `json:"indexer"`
	Detail  string   `json:"detail"`
	Diff    []string `json:"diff"`
}

// Config is the full viewer configuration.
type Config struct {
	Port            int                `json:"port"`
	DataDir         string             `json:"data_dir"`
	WatchDir        string             `json:"watch_dir"`
	MysqlbinlogPath string             `json:"mysqlbinlog_path"`
	PageSize        int                `json:"page_size"`
	Timezone        string             `json:"timezone"` // "utc" | "local"
	Watch           bool               `json:"watch"`    // enable fsnotify live-tail watcher
	Roles           Roles              `json:"roles"`
	Anomaly         anomaly.Thresholds `json:"anomaly"`
	Stream          Stream             `json:"stream"`
}

// SpoolDir is where the streamer writes remote binlog mirrors.
func (c *Config) SpoolDir() string { return filepath.Join(c.DataDir, "spool") }

// Validate checks Stream invariants enforced regardless of config source
// (env vars or UI). Called by Load after all overrides are applied.
func (s Stream) Validate() error {
	if s.Flavor != "" && s.Flavor != "mysql" && s.Flavor != "mariadb" {
		return fmt.Errorf("stream.flavor must be mysql or mariadb, got %q", s.Flavor)
	}
	if s.Enabled && (s.Host == "" || s.User == "") {
		return fmt.Errorf("stream.host and stream.user are required when streaming is enabled")
	}
	return nil
}

func defaults() *Config {
	return &Config{
		Port:            8080,
		DataDir:         "/var/lib/binsight",
		WatchDir:        "/data",
		MysqlbinlogPath: "mysqlbinlog",
		PageSize:        500,
		Timezone:        "utc",
		Roles: Roles{
			Indexer: "go-mysql",
			Detail:  "go-mysql",
			Diff:    []string{"go-mysql", "mysqlbinlog"},
		},
		Anomaly: anomaly.DefaultThresholds(),
		Stream:  Stream{Port: 3306, Flavor: "mysql", ServerID: 51789, MaxSpoolBytes: 2 << 30},
	}
}

// parseBool interprets a non-empty env-var value as a boolean.
// Accepted truthy values:  1, true, yes, on  (case-insensitive, trimmed).
// Accepted falsy values:   0, false, no, off (case-insensitive, trimmed).
// ok is false when the value is not one of the recognised tokens, in which
// case the caller should leave the existing setting unchanged.
func parseBool(v string) (value, ok bool) {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true, true
	case "0", "false", "no", "off":
		return false, true
	}
	return false, false
}

// Load applies: defaults ← persisted settings ← env vars.
// getenv is injected for testability (pass os.Getenv in production).
func Load(s *store.Store, getenv func(string) string) (*Config, error) {
	c := defaults()
	raw, err := s.GetSetting("config")
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("load config setting: %w", err) // a real DB error must not be masked as "use defaults"
	}
	if err == nil {
		if err := json.Unmarshal([]byte(raw), c); err != nil {
			return nil, fmt.Errorf("unmarshal config setting: %w", err)
		}
	}
	if v := getenv("BINSIGHT_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid BINSIGHT_PORT %q: %w", v, err)
		}
		c.Port = p
	}
	if v := getenv("BINSIGHT_DATA_DIR"); v != "" {
		c.DataDir = v
	}
	if v := getenv("BINSIGHT_WATCH_DIR"); v != "" {
		c.WatchDir = v
	}
	if v := getenv("BINSIGHT_MYSQLBINLOG_PATH"); v != "" {
		c.MysqlbinlogPath = v
	}
	if v := getenv("BINSIGHT_WATCH"); v != "" {
		if b, ok := parseBool(v); ok {
			c.Watch = b
		}
	}
	if v := getenv("BINSIGHT_STREAM_ENABLED"); v != "" {
		if b, ok := parseBool(v); ok {
			c.Stream.Enabled = b
		}
	}
	if v := getenv("BINSIGHT_STREAM_HOST"); v != "" {
		c.Stream.Host = v
	}
	if v := getenv("BINSIGHT_STREAM_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid BINSIGHT_STREAM_PORT %q: %w", v, err)
		}
		c.Stream.Port = p
	}
	if v := getenv("BINSIGHT_STREAM_USER"); v != "" {
		c.Stream.User = v
	}
	if v := getenv("BINSIGHT_STREAM_PASSWORD"); v != "" {
		c.Stream.Password = v
	}
	if v := getenv("BINSIGHT_STREAM_FLAVOR"); v != "" {
		c.Stream.Flavor = v
	}
	if v := getenv("BINSIGHT_STREAM_SERVER_ID"); v != "" {
		id, err := strconv.ParseUint(v, 10, 32)
		if err != nil {
			return nil, fmt.Errorf("invalid BINSIGHT_STREAM_SERVER_ID %q: %w", v, err)
		}
		c.Stream.ServerID = uint32(id)
	}
	if v := getenv("BINSIGHT_STREAM_MAX_SPOOL_BYTES"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid BINSIGHT_STREAM_MAX_SPOOL_BYTES %q: %w", v, err)
		}
		if n < 0 {
			return nil, fmt.Errorf("invalid BINSIGHT_STREAM_MAX_SPOOL_BYTES %q: must be >= 0", v)
		}
		c.Stream.MaxSpoolBytes = n
	}
	if c.PageSize <= 0 {
		c.PageSize = 500
	}
	def := anomaly.DefaultThresholds()
	if c.Anomaly.TxnBytes <= 0 {
		c.Anomaly.TxnBytes = def.TxnBytes
	}
	if c.Anomaly.TxnRows <= 0 {
		c.Anomaly.TxnRows = def.TxnRows
	}
	if c.Anomaly.TxnSeconds <= 0 {
		c.Anomaly.TxnSeconds = def.TxnSeconds
	}
	if c.Anomaly.EventRows <= 0 {
		c.Anomaly.EventRows = def.EventRows
	}
	if err := c.Stream.Validate(); err != nil {
		return nil, fmt.Errorf("stream config: %w", err)
	}
	return c, nil
}

// Save persists the config as the UI settings layer.
func Save(s *store.Store, c *Config) error {
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return s.SetSetting("config", string(b))
}
