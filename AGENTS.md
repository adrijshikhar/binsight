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

### Current Phase: Stock Coss, Desktop Only

Stock checkpoint update: `web/coss-stock-lock.json` pins 23 upstream component/helper files and the complete Coss neutral palette. Shared source permits import-path changes only. Do not format or modify locked files; `rtk bun scripts/verify-coss-source.mjs` from `web/` checks live upstream on demand. Do not add redundant unit tests for upstream markup, styling, or source hashes; retain Binsight behavior tests. Built-in badge variants replace custom mutation variants. The forced 32px density and bespoke tab animations are paused along with final DESIGN.md styling. Domain layout and runtime virtualization/resizing remain application code, outside the stock component directory.

The user's 2026-09-14 instruction supersedes the staged styling rules below: remove custom application CSS and pause DESIGN.md customization. Keep stock Coss component recipes and the Tailwind/Coss foundation in `web/src/styles/ui.css`. Do not add CSS Modules, custom theme palettes, radii, shadows, or component appearance overrides. Use layout utilities and runtime geometry only where required by the application. Preserve forensic data semantics and behavior. This is a desktop web application; mobile sheets and mobile acceptance work are out of scope. Codex owns implementation. Obtain user review of the stock checkpoint before applying DESIGN.md changes.

### 1. Ban on Inline Styles for Component Styling & Interactive States
- **NEVER** use `style={{ ... }}` for reusable components, interactive elements, or states.
- **NEVER** use imperative JS mouse handlers (`onMouseEnter`, `onMouseLeave`) to manually toggle element styles.
- Use owned Coss UI components with token-backed Tailwind variants for shared controls. Use CSS Modules for specialized layout and data surfaces. States use CSS pseudo-classes or primitive data attributes, never JS appearance handlers.
- Inline `style` is only permissible for dynamic runtime values that cannot be known at build time (e.g., dynamically dragged widths, absolute virtual scroll offsets). Everything else belongs in CSS classes.

### 2. Design Language: Binsight Design System
The root `DESIGN.md` is canonical for `web/`. It supersedes older companion design references. Target stack: stock Coss UI source backed by Base UI (`@base-ui/react`), Tailwind, and retained specialized CSS Modules. This user-approved choice supersedes the previous Radix-first direction. Use Coss natively, not merely as inspiration. Keep its stock appearance through a functional checkpoint, then apply colors, density, shapes and elevation as separate verified passes; never delete layout CSS before its replacement is verified.
- Resume interrupted work by inventorying current files and tests. Preserve useful partial changes; replace existing Radix primitive bindings with verified stock Coss source before building more components on them. Remove unused Radix packages only after their consumers migrate. Do not reset the worktree or mechanically rename primitive imports.
- Use the Coss Combobox with multiple selection/chips. Do not build a custom Popover/Command multi-select or silently mix primitive systems. Radix Colors remains palette research only, not a runtime primitive choice.
- **Phase rule**: Appearance values below are final theme targets. Before the stock checkpoint, Coss neutral primary, sizes, radii and shadows are accepted. Behavior, accessibility, zero tracking, no green chrome, semantic data mapping and 32px virtual rows remain mandatory. Keep stock and legacy role values explicit in the one theme file; do not overwrite legacy styling with the full Coss preset.
- Use Coss Segmented Control's Radio Group particle, Number Field and Toast where applicable. Use individual registry sources through the shadcn CLI, not generic shadcn components or an all-component installation. Verify actual APIs and generated paths.
- **Canvas**: `#010102` (deepest dark surface).
- **Surface Ladder**:
  - `surface-1`: `#0f1011` (base cards, panels)
  - `surface-2`: `#141516` (lifted / hovered cards)
  - `surface-3`: `#18191a` (sub-nav, dropdowns)
  - `surface-4`: `#191a1b` (highest lifted surfaces)
- **Hairlines**: 1px `#23252a` (`var(--border)`); strong hairline `#34343a`.
- **Top-Edge Highlight**: Lifted panels on dark surfaces receive subtle top highlight: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);`.
- **Radii Scale**:
  - `xs: 4px` (filter summaries, transaction chips, jump links)
  - `sm: 6px` (event badges, data/status pills, tags)
  - `md: 8px` (buttons, text/number inputs - default radius)
  - `lg: 12px` (cards, panels)
  - `pill: 9999px` (segmented tracks and selected segments only)
- Binsight data pills are compact rounded rectangles, not oval capsules. Shared variants own their appearance.

### 3. Strict Quarantine on Green (Zero Green in Chrome)
- **Green** (`#34d399` / `#059669` / `var(--green)`) is strictly quarantined to **semantic data changes**:
  - `WRITE_ROWS` events
  - Genuine diff additions, not adapter agreement
  - Ready state dot in `Sidebar`
- Absolutely **zero green** in interactive chrome (buttons, active tabs, links, active file indicator, brand logo, focus rings).
- Primary controls use Binsight Blue: dark `#0075de`, hover `#2c6bb3`; light `#0062bd`, hover `#0053ad`. Focus and text-blue roles are defined separately in `DESIGN.md`.
- Adapter agreement is neutral. Operational success and live-tail indicators are blue, not green.
- `web/src/styles/theme.css` is the target executable token source. Resolve legacy `--accent` and `--muted` name collisions before adopting Coss token meanings; follow the migration roadmap.

### 4. Typography & Data Density
- **Display Headings**: Compact fixed-size headings with zero letter spacing and font weight 600.
- **Numbers & Metrics**: Tabular monospace (`font-variant-numeric: tabular-nums`).
- **Events Table**: Dense 32px rows with 1px hairlines.
- **Labels**: Zero letter spacing; preserve event-name casing and user identifiers.

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
