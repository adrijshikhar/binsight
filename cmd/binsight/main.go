package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
	"github.com/adrijshikhar/binsight/internal/adapter/execadapter"
	"github.com/adrijshikhar/binsight/internal/adapter/gomysql"
	"github.com/adrijshikhar/binsight/internal/adapter/mysqlbinlog"
	"github.com/adrijshikhar/binsight/internal/config"
	"github.com/adrijshikhar/binsight/internal/server"
	"github.com/adrijshikhar/binsight/internal/store"
)

// version is stamped by -ldflags "-X main.version=…" in the GoReleaser and
// Docker builds. A plain `go install` cannot pass ldflags, so it stays "dev"
// there and resolveVersion falls back to the module version below.
var version = "dev"

func formatVersion(v string) string {
	return "binsight " + v + "\n"
}

// resolveVersion picks the most trustworthy version available. stamped is the
// ldflags value; buildRev is the module version from the build info, which Go
// records for `go install module@vX.Y.Z` and sets to "(devel)" for a local
// build from source.
func resolveVersion(stamped, buildRev string) string {
	if stamped != "dev" && stamped != "" {
		return stamped
	}
	if buildRev != "" && buildRev != "(devel)" {
		return buildRev
	}
	return stamped
}

// currentVersion resolves the version using this binary's real build info.
func currentVersion() string {
	var buildRev string
	if bi, ok := debug.ReadBuildInfo(); ok {
		buildRev = bi.Main.Version
	}
	return resolveVersion(version, buildRev)
}

func main() {
	if len(os.Args) >= 2 {
		switch os.Args[1] {
		case "version", "--version", "-v":
			fmt.Print(formatVersion(currentVersion()))
			os.Exit(0)
		}
	}
	if len(os.Args) < 2 || os.Args[1] != "serve" {
		fmt.Fprintln(os.Stderr, "usage: binsight serve <dir-or-file>")
		os.Exit(2)
	}
	watch := "."
	if len(os.Args) > 2 {
		watch = os.Args[2]
	}

	dataDir := os.Getenv("BINSIGHT_DATA_DIR")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".binsight")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	st, err := store.Open(filepath.Join(dataDir, "index.db"))
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	cfg, err := config.Load(st, os.Getenv)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	cfg.WatchDir = watch
	cfg.DataDir = dataDir

	reg := adapter.NewRegistry()
	reg.Register(gomysql.New())
	mbl := mysqlbinlog.New(cfg.MysqlbinlogPath)
	if _, err := mbl.Available(); err == nil {
		reg.Register(mbl)
	} else {
		log.Printf("mysqlbinlog adapter disabled: %v", err)
	}

	registerExecAdapters(reg)

	if err := reg.SetRole(adapter.RoleIndexer, cfg.Roles.Indexer); err != nil {
		log.Fatalf("indexer role: %v", err)
	}
	if err := reg.SetRole(adapter.RoleDetail, cfg.Roles.Detail); err != nil {
		log.Fatalf("detail role: %v", err)
	}
	var diff []string
	for _, n := range cfg.Roles.Diff {
		if reg.Get(n) != nil {
			diff = append(diff, n)
		}
	}
	if err := reg.SetDiffSet(diff); err != nil {
		log.Fatalf("diff set: %v", err)
	}

	srv := server.New(st, reg, cfg)
	go func() {
		if err := srv.ScanAndIndex(); err != nil {
			log.Printf("initial scan: %v", err)
		}
	}()

	// No graceful-shutdown path; Background is intentional (watcher runs for the
	// process lifetime).
	srv.StartWatch(context.Background())
	srv.StartStream(context.Background())

	// Bind loopback by default — the UI surfaces decoded binlog row data and
	// has no authentication. Set BINSIGHT_BIND=0.0.0.0 to deliberately expose it
	// (only behind a trusted network / reverse proxy).
	bind := os.Getenv("BINSIGHT_BIND")
	if bind == "" {
		bind = "127.0.0.1"
	}
	addr := fmt.Sprintf("%s:%d", bind, cfg.Port)
	log.Printf("binsight listening on http://%s (watching %s)", addr, watch)
	// No WriteTimeout: the SSE endpoint holds connections open indefinitely.
	// ReadHeaderTimeout guards against slowloris-style header stalls.
	srv2 := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv2.ListenAndServe())
}

// registerExecAdapters registers JSON-lines sidecar adapters declared via
// BINSIGHT_EXEC_ADAPTERS — the phase-2 path for connector-java/python parsers:
//
//	BINSIGHT_EXEC_ADAPTERS='[{"name":"connector-java","cmd":["java","-jar","adapter.jar"],
//	  "capabilities":{"FullScan":true,"SeekDecode":true,"RowImages":true}}]'
func registerExecAdapters(reg *adapter.Registry) {
	raw := os.Getenv("BINSIGHT_EXEC_ADAPTERS")
	if raw == "" {
		return
	}
	var specs []struct {
		Name         string               `json:"name"`
		Cmd          []string             `json:"cmd"`
		Capabilities adapter.Capabilities `json:"capabilities"`
	}
	if err := json.Unmarshal([]byte(raw), &specs); err != nil {
		log.Fatalf("BINSIGHT_EXEC_ADAPTERS: invalid JSON: %v", err)
	}
	for _, sp := range specs {
		if sp.Name == "" || len(sp.Cmd) == 0 {
			log.Fatalf("BINSIGHT_EXEC_ADAPTERS: each entry needs name and cmd")
		}
		reg.Register(execadapter.New(sp.Name, sp.Cmd, sp.Capabilities))
		log.Printf("registered exec adapter %q (%v)", sp.Name, sp.Cmd)
	}
}
