package config

import (
	"path/filepath"
	"testing"

	"github.com/adrijshikhar/binsight/internal/store"
)

func newStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "c.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestDefaults(t *testing.T) {
	s := newStore(t)
	c, err := Load(s, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if c.Roles.Indexer != "go-mysql" || c.Roles.Detail != "go-mysql" {
		t.Fatalf("default roles wrong: %+v", c.Roles)
	}
	if len(c.Roles.Diff) != 2 {
		t.Fatalf("default diff set wrong: %+v", c.Roles.Diff)
	}
	if c.Port != 8080 || c.MysqlbinlogPath != "mysqlbinlog" {
		t.Fatalf("defaults wrong: %+v", c)
	}
}

func TestPersistedOverridesDefaults(t *testing.T) {
	s := newStore(t)
	if err := s.SetSetting("config", `{"roles":{"indexer":"mysqlbinlog","detail":"go-mysql","diff":["go-mysql"]},"page_size":100}`); err != nil {
		t.Fatal(err)
	}
	c, err := Load(s, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if c.Roles.Indexer != "mysqlbinlog" || c.PageSize != 100 {
		t.Fatalf("persisted settings not applied: %+v", c)
	}
}

func TestEnvOverridesAll(t *testing.T) {
	s := newStore(t)
	getenv := func(k string) string {
		switch k {
		case "BV_PORT":
			return "9999"
		case "BV_MYSQLBINLOG_PATH":
			return "/opt/bin/mysqlbinlog"
		}
		return ""
	}
	c, err := Load(s, getenv)
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != 9999 || c.MysqlbinlogPath != "/opt/bin/mysqlbinlog" {
		t.Fatalf("env overrides not applied: %+v", c)
	}
}

func TestSaveRoundTrip(t *testing.T) {
	s := newStore(t)
	c, _ := Load(s, func(string) string { return "" })
	c.PageSize = 250
	c.Timezone = "local"
	if err := Save(s, c); err != nil {
		t.Fatal(err)
	}
	c2, _ := Load(s, func(string) string { return "" })
	if c2.PageSize != 250 || c2.Timezone != "local" {
		t.Fatalf("save/load lost data: %+v", c2)
	}
}

func TestWatchFlagDefaultsOff(t *testing.T) {
	s := newStore(t)
	c, err := Load(s, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if c.Watch {
		t.Fatal("Watch must default to false")
	}
}

func TestBVWatchEnvEnables(t *testing.T) {
	for _, v := range []string{"1", "true", "yes", "on", "TRUE", " on "} {
		v := v
		t.Run(v, func(t *testing.T) {
			s := newStore(t)
			c, err := Load(s, func(k string) string {
				if k == "BV_WATCH" {
					return v
				}
				return ""
			})
			if err != nil {
				t.Fatal(err)
			}
			if !c.Watch {
				t.Fatalf("BV_WATCH=%q must enable Watch", v)
			}
		})
	}
}

func TestBVWatchFalseOverridesPersistedTrue(t *testing.T) {
	for _, v := range []string{"0", "false", "no", "off", "FALSE"} {
		v := v
		t.Run(v, func(t *testing.T) {
			s := newStore(t)
			if err := Save(s, &Config{Watch: true}); err != nil {
				t.Fatal(err)
			}
			c, err := Load(s, func(k string) string {
				if k == "BV_WATCH" {
					return v
				}
				return ""
			})
			if err != nil {
				t.Fatal(err)
			}
			if c.Watch {
				t.Fatalf("BV_WATCH=%q must override persisted Watch=true to false", v)
			}
		})
	}
}

func TestStreamDefaults(t *testing.T) {
	s := newStore(t)
	c, err := Load(s, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if c.Stream.Enabled {
		t.Error("stream must default to disabled")
	}
	if c.Stream.Port != 3306 || c.Stream.Flavor != "mysql" {
		t.Errorf("defaults: got port=%d flavor=%q", c.Stream.Port, c.Stream.Flavor)
	}
	if c.Stream.ServerID != 51789 {
		t.Errorf("ServerID default: got %d", c.Stream.ServerID)
	}
	if c.Stream.MaxSpoolBytes != 2<<30 {
		t.Errorf("MaxSpoolBytes default: got %d", c.Stream.MaxSpoolBytes)
	}
}

func TestStreamEnvOverrides(t *testing.T) {
	s := newStore(t)
	env := map[string]string{
		"BV_STREAM_ENABLED": "true", "BV_STREAM_HOST": "db.example", "BV_STREAM_PORT": "3307",
		"BV_STREAM_USER": "repl", "BV_STREAM_PASSWORD": "secret", "BV_STREAM_FLAVOR": "mariadb",
		"BV_STREAM_SERVER_ID": "99", "BV_STREAM_MAX_SPOOL_BYTES": "1024",
	}
	c, err := Load(s, func(k string) string { return env[k] })
	if err != nil {
		t.Fatal(err)
	}
	if !c.Stream.Enabled || c.Stream.Host != "db.example" || c.Stream.Port != 3307 ||
		c.Stream.User != "repl" || c.Stream.Password != "secret" || c.Stream.Flavor != "mariadb" ||
		c.Stream.ServerID != 99 || c.Stream.MaxSpoolBytes != 1024 {
		t.Errorf("env overrides not applied: %+v", c.Stream)
	}
}

func TestBVStreamEnabledTruthy(t *testing.T) {
	for _, v := range []string{"1", "true", "yes", "on", "TRUE", "YES", "ON", " on "} {
		v := v
		t.Run(v, func(t *testing.T) {
			s := newStore(t)
			c, err := Load(s, func(k string) string {
				switch k {
				case "BV_STREAM_ENABLED":
					return v
				case "BV_STREAM_HOST":
					return "db.example"
				case "BV_STREAM_USER":
					return "repl"
				}
				return ""
			})
			if err != nil {
				t.Fatal(err)
			}
			if !c.Stream.Enabled {
				t.Fatalf("BV_STREAM_ENABLED=%q must enable Stream.Enabled", v)
			}
		})
	}
}

func TestBVStreamEnabledFalsy(t *testing.T) {
	for _, v := range []string{"0", "false", "no", "off", "FALSE", "NO", "OFF"} {
		v := v
		t.Run(v, func(t *testing.T) {
			s := newStore(t)
			// persist enabled=true so we confirm env overrides it to false
			if err := Save(s, &Config{Stream: Stream{Enabled: true}}); err != nil {
				t.Fatal(err)
			}
			c, err := Load(s, func(k string) string {
				if k == "BV_STREAM_ENABLED" {
					return v
				}
				return ""
			})
			if err != nil {
				t.Fatal(err)
			}
			if c.Stream.Enabled {
				t.Fatalf("BV_STREAM_ENABLED=%q must disable Stream.Enabled", v)
			}
		})
	}
}

func TestNegativeMaxSpoolBytesRejected(t *testing.T) {
	s := newStore(t)
	_, err := Load(s, func(k string) string {
		if k == "BV_STREAM_MAX_SPOOL_BYTES" {
			return "-1"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected error for negative BV_STREAM_MAX_SPOOL_BYTES, got nil")
	}
}

func TestZeroMaxSpoolBytesAllowed(t *testing.T) {
	s := newStore(t)
	c, err := Load(s, func(k string) string {
		if k == "BV_STREAM_MAX_SPOOL_BYTES" {
			return "0"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("expected 0 to be valid, got error: %v", err)
	}
	if c.Stream.MaxSpoolBytes != 0 {
		t.Errorf("MaxSpoolBytes = %d, want 0", c.Stream.MaxSpoolBytes)
	}
}

func TestSpoolDir(t *testing.T) {
	c := &Config{DataDir: "/var/lib/bv"}
	if got := c.SpoolDir(); got != filepath.Join("/var/lib/bv", "spool") {
		t.Errorf("SpoolDir: %s", got)
	}
}

func TestStreamValidateEnabledRequiresHostUser(t *testing.T) {
	s := newStore(t)
	// BV_STREAM_ENABLED=true with empty host and user must error.
	_, err := Load(s, func(k string) string {
		if k == "BV_STREAM_ENABLED" {
			return "true"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected error when stream enabled without host/user, got nil")
	}
}

func TestStreamValidateEnabledWithHostUserOK(t *testing.T) {
	s := newStore(t)
	// BV_STREAM_ENABLED=true with host and user set must succeed.
	c, err := Load(s, func(k string) string {
		switch k {
		case "BV_STREAM_ENABLED":
			return "true"
		case "BV_STREAM_HOST":
			return "db.example"
		case "BV_STREAM_USER":
			return "repl"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !c.Stream.Enabled || c.Stream.Host != "db.example" || c.Stream.User != "repl" {
		t.Errorf("unexpected stream cfg: %+v", c.Stream)
	}
}

func TestStreamValidateInvalidFlavor(t *testing.T) {
	s := newStore(t)
	_, err := Load(s, func(k string) string {
		if k == "BV_STREAM_FLAVOR" {
			return "oracle"
		}
		return ""
	})
	if err == nil {
		t.Fatal("expected error for invalid stream flavor, got nil")
	}
}

func TestAnomalyThresholdDefaults(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "cfg.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	c, err := Load(s, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	if c.Anomaly.TxnBytes != 1<<30 || c.Anomaly.TxnRows != 100_000 ||
		c.Anomaly.TxnSeconds != 60 || c.Anomaly.EventRows != 50_000 {
		t.Fatalf("anomaly defaults wrong: %+v", c.Anomaly)
	}
}
