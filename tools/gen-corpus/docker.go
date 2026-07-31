package main

import (
	"fmt"
	"os/exec"
)

// ensureDocker verifies the docker CLI is available and the daemon responds.
// The corpus generator is an offline maintainer tool; it never runs on the
// `go test` path, so this check only gates the manual `make corpus` flow.
func ensureDocker() error {
	if _, err := exec.LookPath("docker"); err != nil {
		return fmt.Errorf("docker CLI not found on PATH")
	}
	if out, err := exec.Command("docker", "version", "--format", "{{.Server.Version}}").CombinedOutput(); err != nil {
		return fmt.Errorf("docker daemon not reachable: %s", string(out))
	}
	return nil
}
