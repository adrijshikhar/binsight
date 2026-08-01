# Security Policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub's
[private vulnerability reporting](https://github.com/adrijshikhar/binsight/security/advisories/new)
rather than opening a public issue.

I'll acknowledge within a few days. This is a personal project, not a funded one,
so there is no formal SLA — but security reports go to the front of the queue.

## Supported versions

Only the latest release receives fixes. binsight is pre-1.0 and the version is
expected to move quickly.

## What's in scope

binsight **parses untrusted binary input** and serves an HTTP API, so the
interesting reports are:

- **Decoder crashes on malformed binlogs** — a panic, unbounded allocation, or
  infinite loop triggered by a crafted or corrupted binlog file. This is the most
  plausible real vulnerability class in this project.
- **Path traversal** through the scanned directory or any file-path parameter.
- **SQL injection** into the SQLite index.
- **XSS** in the web UI via decoded row data, table names, or DDL text — the UI
  renders content that originates in the binlog, which is untrusted.
- **Bypass of the loopback/origin guard** (`internal/server/guard.go`) that
  protects the unauthenticated local API from DNS rebinding and CSRF.
- **Credential leakage** — the replication password is deliberately withheld from
  `GET /api/settings`; a path that exposes it is a vulnerability.

## What's out of scope

- **The API has no authentication. That is by design**, documented, and not a
  vulnerability on its own. binsight binds `127.0.0.1` by default and is intended
  as a local, single-user debugging tool.
- **Exposing the server publicly via `BV_BIND=0.0.0.0`** without a reverse proxy
  or network controls. The README says not to; doing it anyway is a deployment
  choice, not a defect.
- **Unsigned macOS binaries.** Releases are not Developer ID signed or notarized
  (that requires a paid Apple Developer account). The install script and Homebrew
  cask clear the quarantine attribute. Known and documented.
- Anything requiring an attacker to already have local filesystem or shell access
  to the machine running binsight.

## A note on binlog contents

Binlogs frequently contain production data. If a report requires a sample file,
**do not attach a real one** — describe the structure, or send a synthetic
reproduction. `make sample` generates a synthetic binlog, and
`tools/gen-corpus` can build targeted fixtures.
