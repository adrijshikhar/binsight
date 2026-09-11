# Contributing

Thanks for taking a look. binsight is a personal project, so please **open an
issue before starting anything substantial** — it may already be planned,
deliberately out of scope, or harder than it looks (binlog parsing usually is).

Small fixes, docs, and tests: just send a PR.

## Setup

You need **Go 1.26+**, **[bun](https://bun.sh)** for the web UI, and **Docker**
for the version-matrix fixtures.

```sh
git clone https://github.com/adrijshikhar/binsight
cd binsight
make ui        # build the web UI into internal/server/dist
go build ./...
```

`make ui` matters: `internal/server/dist` is an embedded build artifact. A bare
`go build` without it embeds an empty UI and serves a blank page.

## Running it

```sh
export BINSIGHT_DATA_DIR=$(mktemp -d)   # the default /var/lib/binsight isn't writable on a dev box
make dev DIR=samples              # Go API on :8080 + Vite hot reload on :5173
```

`make sample` generates a synthetic demo binlog (needs Docker).

## Tests

```sh
go test -race ./...        # always use -race
cd web && bun run test     # web tests
cd web && bunx tsc --noEmit
```

CI runs the Go suite and the web tests; both must pass before a PR can merge.

**Conformance fixtures.** `internal/testdata/corpus/` holds authentic binlogs
from MySQL 5.5–8.4 and MariaDB 10.6/11.4, with golden snapshots. If a decode
change alters output, regenerate with:

```sh
go test ./internal/conformance/ -run L3 -update
```

Inspect that diff carefully — a golden change means decoder output moved, which
is sometimes the fix and sometimes the bug.

**Timezone.** Goldens must be timezone-independent. If a test passes only in your
local zone, that's a bug — see gotcha #6 in `CLAUDE.md`.

## Before you push

`make fmt` runs gofmt and Prettier. `make hooks` installs a pre-commit hook that
does it for you.

## Things worth knowing

`CLAUDE.md` documents the binlog-format traps this project has already hit —
the uint32 `end_log_pos` wrap on files over 4 GiB, MariaDB's `ANNOTATE_ROWS`
handling, TIMESTAMP timezone rendering, and the committed-boundary invariant that
resume depends on. **Read it before changing anything about positions, resume, or
decoded values.** Every entry in that file cost somebody a debugging session.

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
Explain *why* in the body when it isn't obvious.
