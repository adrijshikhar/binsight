# stage 1: frontend
FROM node:20-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# stage 2: Go binary (pure Go — no cgo needed thanks to modernc.org/sqlite)
FROM golang:1.26-bookworm AS build
ARG VERSION=dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /app/web/dist internal/server/dist
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=${VERSION}" -o /binsight ./cmd/binsight

# stage 3: runtime with mysqlbinlog bundled
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-mysql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# default-mysql-client provides mariadb's mysqlbinlog-compatible tooling on debian;
# if true Oracle mysqlbinlog is required, switch to the mysql apt repo. The adapter
# only needs --base64-output=decode-rows -vv text output, which both provide.
COPY --from=build /binsight /binsight
# Bind 0.0.0.0 inside the container so the published port (-p) is reachable;
# network isolation + the host's port mapping/firewall control real exposure.
ENV BV_DATA_DIR=/var/lib/binlog-viewer BV_WATCH_DIR=/data BV_PORT=8080 BV_BIND=0.0.0.0
VOLUME ["/data", "/var/lib/binlog-viewer"]
EXPOSE 8080
ENTRYPOINT ["/binsight"]
CMD ["serve", "/data"]
