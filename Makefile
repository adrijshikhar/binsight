.PHONY: ui build test run dev dev-api dev-web corpus sample clean-data hooks fmt

# DIR is the binlog directory to serve; defaults to the bundled demo sample so
# `make run` / `make dev` show something immediately. Override for real use:
#   make dev DIR=/path/to/your/binlogs
DIR ?= samples

ui:
	cd web && bun install && bun run build
	rm -rf internal/server/dist
	cp -r web/dist internal/server/dist

build: ui
	go build -ldflags "-X main.version=$(shell git describe --tags --always --dirty 2>/dev/null || echo dev)" -o bin/binsight ./cmd/binsight

test:
	go test ./...

run: build
	./bin/binsight serve $(DIR)

# dev runs the Go API (:8080) and the Vite dev server (:5173, hot reload)
# together. Open http://localhost:5173 — Vite proxies /api to the Go backend.
# The API is killed automatically when the Vite server exits.
dev:
	@echo "API → :8080   UI (hot reload) → http://localhost:5173"
	@BV_PORT=8080 go run ./cmd/binsight serve $(DIR) & \
	  API_PID=$$!; \
	  trap "kill $$API_PID 2>/dev/null" EXIT INT TERM; \
	  cd web && bun install && bun run dev

# Individual halves, for running in separate terminals if preferred.
dev-api:
	BV_PORT=8080 go run ./cmd/binsight serve $(DIR)

dev-web:
	cd web && bun install && bun run dev

# corpus regenerates conformance fixtures (OFFLINE — requires Docker). Not on the
# `go test` path. `make corpus` does the whole matrix; `make corpus VERSION=8.0`
# does one version. See tools/gen-corpus and the version-testing spec.
VERSION ?=
corpus:
	go run ./tools/gen-corpus $(if $(VERSION),-version $(VERSION),)

# sample regenerates the demo binlog in samples/ from samples/demo-workload.sql
# (OFFLINE — Docker).
sample:
	go run ./tools/gen-corpus -sample samples/mysql-bin.000001 -sample-sql samples/demo-workload.sql

# hooks installs the repo's git hooks (pre-commit: gofmt + Prettier). Run once
# per clone. core.hooksPath is local config, so it is not applied automatically.
hooks:
	git config core.hooksPath .githooks
	@echo "git hooks installed (core.hooksPath=.githooks)"

# fmt formats everything the pre-commit hook checks: Go via gofmt, web via Prettier.
fmt:
	gofmt -w $$(git ls-files '*.go')
	cd web && bun run format

# clean-data wipes the persisted index so stale/old files stop showing in the
# viewer. Honors BV_DATA_DIR; defaults to ~/.binlog-viewer.
clean-data:
	rm -rf "$${BV_DATA_DIR:-$$HOME/.binlog-viewer}"
	@echo "cleared index data dir"
