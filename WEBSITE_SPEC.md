# Binsight Marketing Website — Specification & Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, zero-slop, production-grade static marketing website for **Binsight** deployed to Cloudflare Pages at `https://binsight.adrijshikhar.dev`.

**Architecture:** Independent static Astro + Tailwind CSS v4 site residing in `website/` within the `binsight` repository. Pure static build with zero runtime dependencies, zero database, zero external tracking, accessible semantic HTML, and responsive dark-first terminal/observability aesthetics.

**Tech Stack:** Astro v5, TypeScript, Tailwind CSS v4, Bun, Cloudflare Pages static adapter.

**Spec:** `/Users/nemesis/Projects/my-projects/binsight/WEBSITE_SPEC.md`

---

## Global Constraints & Verified Facts

- **Repository**: `https://github.com/adrijshikhar/binsight` (Owner: `adrijshikhar`)
- **Production URL**: `https://binsight.adrijshikhar.dev`
- **Current Version**: `0.2.1`
- **Default Port & Bind**: `8080` on `127.0.0.1` (loopback by default, read-only)
- **Start Command**: `binsight serve /path/to/binlogs`
- **Default Install**: `brew install adrijshikhar/tap/binsight`
- **Curl Install**: `curl -fsSL https://raw.githubusercontent.com/adrijshikhar/binsight/main/install.sh | sh`
- **Docker Image**: `ghcr.io/adrijshikhar/binsight:0.2.1`
- **Go Install**: `go install github.com/adrijshikhar/binsight/cmd/binsight@latest`
- **Tested Compatibility**:
  - MySQL: `5.5`, `5.6`, `5.7`, `8.0`, `8.4 LTS`
  - MariaDB: `10.6`, `11.4`
  - OS: macOS (`darwin/amd64`, `darwin/arm64`), Linux (`linux/amd64`, `linux/arm64`)
  - Binlog size: Wrap-immune for files `> 4 GiB` via 64-bit monotonic position accumulator
- **Verified Features in Repo**:
  1. Virtualized event stream with transaction grouping and multi-field filtering
  2. Row-level before/after diffs (`UPDATE` before/after, `INSERT`/`DELETE` rows)
  3. Six pluggable anomaly detectors: `huge_txn_bytes`, `huge_txn_rows`, `long_running_txn`, `rolled_back_txn`, `bulk_row_event`, `schema_churn`, plus `pos_wrap`
  4. Chronological Schema / DDL timeline with cascade risk highlighting
  5. Hex forensics with event-header byte overlay
  6. Live tail (`fsnotify` + SSE push) & remote replication streaming (`DATA_DIR/spool/`)
  7. Dual-engine oracle diffing (`go-mysql` workhorse vs official `mysqlbinlog` oracle)
- **Real Asset Sources**:
  - `docs/screenshots/events-dark.png` (1512x805)
  - `docs/screenshots/overview-dark.png` (1512x805)
  - `docs/screenshots/diff-dark.png` (1512x805)
- **Design Tokens**:
  - Background: `#0b0f14` (canvas), `#11161d` (subtle surface), `#161f2c` (card/panel)
  - Borders: `#212c3d` (subtle), `#32425a` (active/focus)
  - Typography: `#f0f6fc` (headings), `#c9d1d9` (body), `#8b949e` (muted)
  - Primary Accent: `#38bdf8` / `#58a6ff` (electric cyan/blue)
  - Warning/Anomaly Accent: `#e3b341` / `#f59e0b` (amber)
  - Success Accent: `#3fb950` / `#10b981` (emerald)

---

## File Structure

```text
website/
├── public/
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── robots.txt
│   ├── og-image.png
│   └── screenshots/
│       ├── events-dark.png
│       ├── overview-dark.png
│       └── diff-dark.png
├── src/
│   ├── components/
│   │   ├── Navbar.astro
│   │   ├── Hero.astro
│   │   ├── Comparison.astro
│   │   ├── FeatureGrid.astro
│   │   ├── DiffSpotlight.astro
│   │   ├── Architecture.astro
│   │   ├── SafetyTrust.astro
│   │   ├── InstallTabs.astro
│   │   ├── CompatibilityMatrix.astro
│   │   ├── OpenSource.astro
│   │   ├── FinalCTA.astro
│   │   ├── Footer.astro
│   │   └── ui/
│   │       ├── CodeBlock.astro
│   │       ├── CopyButton.astro
│   │       └── Badge.astro
│   ├── data/
│   │   └── product.ts
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   └── index.astro
│   └── styles/
│       └── global.css
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── README.md
```

---

## Implementation Tasks

### Task 1: Scaffolding & Central Product Data
**Files:**
- Create: `website/package.json`
- Create: `website/astro.config.mjs`
- Create: `website/tsconfig.json`
- Create: `website/src/data/product.ts`
- Create: `website/src/styles/global.css`

**Interfaces:**
- `product.ts` exports typed objects: `SITE_CONFIG`, `INSTALL_COMMANDS`, `FEATURES`, `ANOMALIES`, `COMPATIBILITY_MATRIX`, `NAV_LINKS`, `ARCHITECTURE_STEPS`.

- [ ] **Step 1: Create `website/package.json` with Astro, Tailwind CSS v4, and TypeScript dependencies.**
- [ ] **Step 2: Create `website/astro.config.mjs` with static output and Cloudflare compatibility.**
- [ ] **Step 3: Create `website/tsconfig.json` extending `astro/tsconfigs/strict`.**
- [ ] **Step 4: Create `website/src/data/product.ts` centralizing all verified repository metadata.**
- [ ] **Step 5: Create `website/src/styles/global.css` with Tailwind v4 `@theme` tokens, One Dark/GitHub dark palette, and custom utility classes.**
- [ ] **Step 6: Run `cd website && bun install` to establish `bun.lock`.**

---

### Task 2: Assets & Base Layout with SEO Metadata
**Files:**
- Copy: `docs/screenshots/*.png` &rarr; `website/public/screenshots/`
- Create: `website/public/favicon.svg`
- Create: `website/public/robots.txt`
- Create: `website/src/layouts/BaseLayout.astro`

**Interfaces:**
- `BaseLayout.astro` accepts `{ title?: string; description?: string; ogImage?: string; canonicalUrl?: string }`.
- Injects OpenGraph, Twitter Cards, Schema.org `SoftwareApplication` JSON-LD, fonts, and dark theme metadata.

- [ ] **Step 1: Copy real dark-mode screenshots from `docs/screenshots/` to `website/public/screenshots/`.**
- [ ] **Step 2: Create brand SVG favicon featuring Binsight's terminal/binary log theme.**
- [ ] **Step 3: Create `website/public/robots.txt` pointing to sitemap.**
- [ ] **Step 4: Implement `BaseLayout.astro` with full semantic tags, skip link, and structured data.**
- [ ] **Step 5: Verify build compiles cleanly with `bun run build`.**

---

### Task 3: Navigation, UI Primitives & Copy Button
**Files:**
- Create: `website/src/components/ui/Badge.astro`
- Create: `website/src/components/ui/CopyButton.astro`
- Create: `website/src/components/ui/CodeBlock.astro`
- Create: `website/src/components/Navbar.astro`

**Interfaces:**
- `CopyButton.astro` accepts `text: string`. Minimal, zero-dependency inline vanilla JS (<15 lines) with clipboard API and visual feedback checkmark.
- `CodeBlock.astro` renders syntax-highlighted or styled terminal block with integrated copy button.
- `Navbar.astro` renders sticky blur navigation with logo, anchor links, and GitHub star button.

- [ ] **Step 1: Implement `Badge.astro` for tags, version badges, and status chips.**
- [ ] **Step 2: Implement accessible `CopyButton.astro` with SVG copy/check icons and keyboard support.**
- [ ] **Step 3: Implement `CodeBlock.astro` supporting shell, sql, and diff styles.**
- [ ] **Step 4: Implement `Navbar.astro` with responsive mobile menu.**

---

### Task 4: Hero Section & Product Showcase
**Files:**
- Create: `website/src/components/Hero.astro`

**Requirements:**
- Headline: "See what's really happening inside your binlogs."
- Subtitle: "Binsight is a local, read-only visual explorer for MySQL and MariaDB binlogs. Inspect transactions, understand row changes, catch anomalies, and trace schema changes without digging through `mysqlbinlog` output."
- Dual CTA: "Get Started" (smooth-scrolls to `#install`) and "View on GitHub" (external repo link).
- Canonical install command with instant copy: `brew install adrijshikhar/tap/binsight`.
- Product showcase: Real `events-dark.png` framed in a dark terminal/browser chrome mockup with subtle glow.

- [ ] **Step 1: Build `Hero.astro` with typography, badge, CTAs, and copy-box.**
- [ ] **Step 2: Embed `events-dark.png` with responsive sizing and crisp device bezel.**
- [ ] **Step 3: Verify layout on mobile (320px), tablet, and desktop viewports.**

---

### Task 5: Storytelling Comparison Section ("Stop reading binlogs like this")
**Files:**
- Create: `website/src/components/Comparison.astro`

**Requirements:**
- Headline: "Stop reading binlogs like this." &rarr; "See them like this."
- Left side: Terminal pager showing messy raw `mysqlbinlog --base64-output=DECODE-ROWS -v -v` text stream.
- Right side: Clean, structured Binsight event row cards showing Start Pos, Event Badge (`WRITE_ROWS_V2`, `QUERY`), Table, Row counts, and Anomaly markers.
- Supporting tagline: "`mysqlbinlog`, but visual."

- [ ] **Step 1: Build `Comparison.astro` showing realistic raw terminal output side-by-side with Binsight's structured visualization.**
- [ ] **Step 2: Ensure responsive stack on small mobile screens without horizontal overflow.**

---

### Task 6: Core Features & Spotlight Sections
**Files:**
- Create: `website/src/components/FeatureGrid.astro`
- Create: `website/src/components/DiffSpotlight.astro`

**Requirements:**
- FeatureGrid: 6 verified capabilities:
  1. Filterable Event Stream & Transaction Grouping
  2. Row-Level Before/After Diffs (`UPDATE` before/after values, full `INSERT`/`DELETE` rows)
  3. Six Pluggable Anomaly Detectors (`huge_txn_bytes`, `huge_txn_rows`, `long_running_txn`, `rolled_back_txn`, `bulk_row_event`, `schema_churn`, plus `pos_wrap`)
  4. Chronological Schema / DDL Timeline
  5. Hex Forensics with Byte Header Overlay
  6. Live Tail & Remote Streaming
- DiffSpotlight: Dual-engine oracle diffing (`go-mysql` workhorse vs `mysqlbinlog` oracle) with `diff-dark.png` screenshot.

- [ ] **Step 1: Implement `FeatureGrid.astro` pulling data from `product.ts`.**
- [ ] **Step 2: Implement `DiffSpotlight.astro` explaining field-level divergence detection and embedding `diff-dark.png`.**

---

### Task 7: Local-First Safety, Architecture & Compatibility
**Files:**
- Create: `website/src/components/SafetyTrust.astro`
- Create: `website/src/components/Architecture.astro`
- Create: `website/src/components/CompatibilityMatrix.astro`

**Requirements:**
- SafetyTrust: "Your database stays your database." Positioning: "Local by design. Read-only by default." Loopback binding (`127.0.0.1`), zero CGO embedded SQLite, no cloud telemetry, read-only permissions.
- Architecture: Flowchart: Binlog / Remote Replica &rarr; Pluggable Decoders &rarr; SQLite Metadata Index &rarr; REST API + SSE &rarr; React UI.
- CompatibilityMatrix: MySQL (5.5, 5.6, 5.7, 8.0, 8.4 LTS), MariaDB (10.6, 11.4), macOS & Linux (amd64, arm64), >4 GiB position wrap immunity.

- [ ] **Step 1: Implement `SafetyTrust.astro` highlighting local security guarantees.**
- [ ] **Step 2: Implement `Architecture.astro` with clean SVG/CSS flow diagram.**
- [ ] **Step 3: Implement `CompatibilityMatrix.astro` with database version badges.**

---

### Task 8: Installation Tabs, Open Source, Final CTA & Footer
**Files:**
- Create: `website/src/components/InstallTabs.astro`
- Create: `website/src/components/OpenSource.astro`
- Create: `website/src/components/FinalCTA.astro`
- Create: `website/src/components/Footer.astro`
- Modify: `website/src/pages/index.astro`

**Requirements:**
- InstallTabs: Accessible tabs for Homebrew (`brew install adrijshikhar/tap/binsight`), Script (`curl -fsSL ...`), Docker, and Go Install, followed by `binsight serve /path/to/binlogs` &rarr; `http://localhost:8080`.
- OpenSource: MIT License, link to GitHub, releases, issues, contributing.
- FinalCTA: "Your binlogs already have the answer. Binsight helps you find it."
- Footer: Copyright Adrij Shikhar, links to GitHub, docs, `adrijshikhar.dev`.

- [ ] **Step 1: Implement accessible `InstallTabs.astro` with zero-JS CSS tab switching or light progressive enhancement.**
- [ ] **Step 2: Implement `OpenSource.astro` and `FinalCTA.astro`.**
- [ ] **Step 3: Implement `Footer.astro`.**
- [ ] **Step 4: Wire all components into `website/src/pages/index.astro`.**

---

### Task 9: Deployment Docs, Makefile Integration & Verification
**Files:**
- Create: `website/README.md`
- Create: `website/SCREENSHOTS_NEEDED.md`
- Modify: `Makefile` (add `website-dev`, `website-build` targets)

**Requirements:**
- `website/README.md` details local dev, build steps, and Cloudflare Pages setup (root: `website`, build: `bun run build`, output: `dist`).
- `Makefile` adds convenient targets for running the website alongside Binsight.
- Verification: `bun run build` generates 100% static HTML, 0 errors, Lighthouse check verification.

- [ ] **Step 1: Create `website/README.md` with exact Cloudflare Pages configuration.**
- [ ] **Step 2: Create `website/SCREENSHOTS_NEEDED.md` documenting image requirements.**
- [ ] **Step 3: Add `website-dev` and `website-build` targets to `Makefile`.**
- [ ] **Step 4: Run full production build (`bun run build`) and test output.**
- [ ] **Step 5: Verify zero console errors, responsive behavior, and accessibility.**
