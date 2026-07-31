package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/adrijshikhar/binsight/internal/adapter"
)

// dockerLifecycle runs one server version end-to-end and returns the extracted
// binlog's absolute path on the host plus the real server_version. The caller
// records the manifest entry. Steps (spec §5):
//
//	docker run (binlog enabled) → wait healthy → RESET + apply workload →
//	FLUSH BINARY LOGS → locate + docker cp the data binlog out → rm container.
func dockerLifecycle(c versionConfig, workload, destPath string) (serverVersion string, err error) {
	name := "bv-corpus-" + sanitize(c.Key)
	_ = run("docker", "rm", "-f", name) // best-effort cleanup of a stale container

	args := []string{"run", "-d", "--name", name, "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes"}
	if c.Platform != "" {
		args = append(args, "--platform", c.Platform)
	}
	args = append(args, c.Image,
		"--server-id=1", "--log-bin=mysql-bin", "--binlog-format="+strings.ToLower(c.Format))
	if c.GTIDMode == "ON" {
		args = append(args, "--gtid-mode=ON", "--enforce-gtid-consistency=ON")
	}
	args = append(args, c.ExtraSrv...)
	if err := run("docker", args...); err != nil {
		return "", fmt.Errorf("docker run: %w", err)
	}
	defer func() { _ = run("docker", "rm", "-f", name) }()

	// MariaDB 11.x ships only the `mariadb` client (no `mysql` symlink); MySQL
	// images ship `mysql`. Pick the right one for every in-container query.
	client := clientCmd(c.Image)

	if err := waitHealthy(name, client, 120*time.Second); err != nil {
		return "", err
	}

	// Read the server version first so we can pick the right log-reset statement.
	out, err := capture("docker", "exec", name, client, "-uroot", "-N", "-B", "-e", "SELECT VERSION()")
	if err != nil {
		return "", fmt.Errorf("read server version: %w", err)
	}
	serverVersion = strings.TrimSpace(out)

	// A fresh log reset gives a single, deterministic mysql-bin.000001 containing
	// only our workload. MySQL 8.4 deprecated RESET MASTER in favor of
	// RESET BINARY LOGS AND GTIDS; older MySQL and MariaDB still use RESET MASTER.
	// The trailing FLUSH must be the LAST statement of the assembled workload
	// (base + feature add-ons) — it rolls to .000002, so everything before it
	// stays in .000001 (the file we copy out). base.sql deliberately omits its
	// own FLUSH for this reason.
	sql := resetStmt(serverVersion) + "\n" + workload + "\nFLUSH BINARY LOGS;\n"
	if err := applySQL(name, client, sql); err != nil {
		return "", fmt.Errorf("apply reset+workload: %w", err)
	}

	// The workload ends with FLUSH BINARY LOGS, so events live in mysql-bin.000001.
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return "", err
	}
	if err := run("docker", "cp", name+":/var/lib/mysql/mysql-bin.000001", destPath); err != nil {
		return "", fmt.Errorf("docker cp binlog: %w", err)
	}
	return serverVersion, nil
}

// clientCmd returns the in-container CLI client for an image. MariaDB 11.x
// dropped the `mysql` symlink, so MariaDB images use `mariadb` (present in all
// MariaDB versions); MySQL images use `mysql`.
func clientCmd(image string) string {
	if strings.HasPrefix(image, "mariadb") {
		return "mariadb"
	}
	return "mysql"
}

func waitHealthy(name, client string, timeout time.Duration) error {
	// The MySQL entrypoint starts a TEMPORARY server for initialization, then
	// restarts the real one — a single successful probe can land in that temp
	// window and the next connection then fails on a socket race. Require
	// several CONSECUTIVE successful `SELECT 1` queries (with the container's
	// own health holding) before declaring ready.
	deadline := time.Now().Add(timeout)
	const needStreak = 3
	streak := 0
	for time.Now().Before(deadline) {
		if err := run("docker", "exec", name, client, "-uroot", "-e", "SELECT 1"); err == nil {
			streak++
			if streak >= needStreak {
				return nil
			}
		} else {
			streak = 0
		}
		time.Sleep(2 * time.Second)
	}
	return fmt.Errorf("server %q not healthy within %s", name, timeout)
}

func applySQL(name, client, sql string) error {
	cmd := exec.Command("docker", "exec", "-i", name, client, "-uroot")
	cmd.Stdin = strings.NewReader(sql)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%v: %s", err, string(out))
	}
	return nil
}

func run(name string, args ...string) error {
	if out, err := exec.Command(name, args...).CombinedOutput(); err != nil {
		return fmt.Errorf("%s %s: %v: %s", name, strings.Join(args, " "), err, string(out))
	}
	return nil
}

func capture(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).Output()
	return string(out), err
}

func sanitize(s string) string {
	return strings.NewReplacer("/", "-", ":", "-", ".", "-").Replace(s)
}

// mysql84Plus matches MySQL 8.4 and newer, where RESET MASTER was removed in
// favor of RESET BINARY LOGS AND GTIDS. Reuses the audited VersionRange
// primitive instead of an open-coded major/minor comparison.
var mysql84Plus = adapter.VersionRange{Flavor: adapter.FlavorMySQL, Min: adapter.ServerVersion{Major: 8, Minor: 4}}

// resetStmt picks the binlog-reset statement for the running server. Older MySQL
// and all MariaDB still use RESET MASTER.
func resetStmt(serverVersion string) string {
	if mysql84Plus.Supports(serverVersion) {
		return "RESET BINARY LOGS AND GTIDS;"
	}
	return "RESET MASTER;"
}
