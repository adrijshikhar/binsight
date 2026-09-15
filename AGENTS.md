# AGENTS.md

This file provides non-negotiable architectural, styling, and coding guidance for AI agents working in this repository (`binsight`).

---

## Toolchain & CLI Rules

- **Package Manager**: Bun only in `web/` (`rtk bun install`, `rtk bun run test`, `rtk bun run build`). Never commit `package-lock.json`.
- **Command Prefix**: ALWAYS prefix shell commands with `rtk` (e.g. `rtk bun run test`, `rtk make build`, `rtk git status`).
- **Navigation Ban**: NEVER propose or execute a `cd` command. Pass the working directory via tool parameters (`Cwd`).
- **Typographic Ban**: No em dash characters in UI copy, placeholders, or documentation; use standard regular hyphen (`-`).

---

## Frontend Styling & CSS Standards (Strict)

### Current Phase: Centralized Palette and Typography, Desktop Only

`web/src/styles/ui.css` is the sole application styling and token source. Components may use semantic roles and layout utilities, but must not add literal colors, inline appearance styles, local appearance recipes, or CSS Modules. Inline `style` is reserved for dynamic runtime geometry such as virtual offsets and dragged widths; never use JS hover handlers for appearance.

The approved dark palette is the charcoal ladder: `#141516` canvas; `#1b1c1e`, `#212224`, `#252629`, and `#27282b` surfaces; `#34363b` and `#45484f` separators. Keep light tokens, blue interaction tokens, semantic data tokens, and the original logo unchanged.

Typography is approved. Define centralized sans and mono stacks and apply semantic roles: view headings `20px/26px`, section headings `16px/22px`, metrics `24px/30px`, and application prose `13px/20px`, all with zero tracking. Numeric data is tabular monospace and right-aligned. Keep stock Coss controls and badges on their own type recipes so typography does not alter their geometry.

Ordinary Coss controls use stock default props and the stock 32px desktop size. Do not reintroduce compact 28px filter controls or CSS size overrides. The pinned Coss source in `web/coss-stock-lock.json` is immutable except for import-path changes; do not format or modify it. Run `rtk bun scripts/verify-coss-source.mjs` from `web/` when source verification is needed.

This is a desktop application. Mobile sheets, mobile-specific controls, and mobile acceptance checks are out of scope. Event rows are the approved density exception: keep grouped and ungrouped event rows at 32px with synchronized virtualization. Radii, shapes, shadows, and elevation remain deferred. Preserve domain behavior, runtime virtualization/resizing, accessibility, the original logo, and forensic semantics.

Historical checkpoint and migration notes in `DESIGN.md` are reference only unless repeated in this current-phase section.

TanStack Table v8 owns sorting and expansion; stock Coss renders the table UI and TanStack Virtual retains event virtualization. Preserve the Binsight transaction-run grouping adapter.

---

## Companion Directories (Outside this repo)

The canonical design system is tracked at root `DESIGN.md`. Working plans and roadmaps remain in the private companion directory:

```text
../projects/binsight/    # specifications, numbered plans, ROADMAP.md
```

---

## Verification Before Completion

Frontend implementation tasks must be verified with:
1. `rtk bun run test` (all 158+ web tests passing)
2. `rtk go test ./...` (all 335+ Go tests passing)
3. `rtk make build` (production build passes cleanly)
4. Playwright visual inspection on `http://127.0.0.1:8080` in both Dark and Light modes.

Documentation-only tasks require whitespace, punctuation, stale-reference, and consistency checks. Report runtime checks as not run rather than claiming application verification. Test counts above are historical baselines; record actual results.

## Required Design Skills

Before design, planning, or frontend implementation, discover and read applicable `SKILL.md` files for `impeccable`, `design-taste-frontend`, `design-system`, and `ui-styling`. Check repository skills first, then configured skill roots. Report loaded paths and relevant guidance; explicitly report unavailable skills.

Use Impeccable Operate guidance. The installed design-taste-frontend skill excludes dashboards/data tables: apply only its relevant brief-reading and audit principles, not landing-page presets. Root `DESIGN.md` governs product-specific choices. AntiGravity must follow the approved file-specific TDD roadmap, preserve existing behavior, and obtain implementation approval before changing frontend code.
