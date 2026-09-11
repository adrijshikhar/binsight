# binsight — Design System (as-built, pure-Mantine rewrite)

A local, read-only MySQL/MariaDB binlog inspector. Desktop web app (React + Vite +
TypeScript; charts via Recharts). GitHub-inspired, with both **dark (default) and
light** schemes. This document describes the system **as it is actually built** after
the pure-Mantine rewrite (branch `feat/mantine-rewrite`, Tasks 1–12).

> **Single source of truth for color and theme**: `web/src/theme.ts`.
> The theme object (`createTheme`) + `cssVariablesResolver` together replace
> the former `:root` / `[data-mantine-color-scheme='light']` token blocks and
> the `tokens` JS export — none of those patterns exist any more.
> The **only** global CSS is `web/src/global.css` (resets, scrollbar, focus ring,
> reduced-motion). Everything else is Mantine props, Styles API, or co-located
> CSS Modules (`*.module.css`). The former 945-line `styles.css` is gone.

---

## 1. Overview & design principles

- **Audience**: developers inspecting binlog events. Information density is a feature,
  not a bug. Optimize for scan-ability of tabular data, not whitespace.
- **Dark default + light theme.** Dark is the default (`defaultColorScheme="dark"`);
  a header sun/moon `ThemeToggle` flips to light, persisted by Mantine in localStorage
  via the `data-mantine-color-scheme` attribute on `<html>`. Mantine components adapt
  automatically; the `cssVariablesResolver` in `theme.ts` emits per-scheme bespoke
  CSS vars that flip with it.
- **One standard palette — Sky + slate.** Semantic colors are Mantine **scale names** —
  `green orange red grape teal` + the brand `accent` (Sky blue) — applied as
  `<Badge color={name} variant="light">`. No component hand-codes badge hex.
  `autoContrast: true` keeps any filled element legible.
- **Data-UI typography.** Monospace (`fontFamilyMonospace` in theme, emitted as
  `--mono` by the resolver) for all numeric / positional / code data (positions,
  sizes, hex, JSON, type badges). Sans for chrome and prose.
- **Color is data, but not the only signal.** Event kinds, severities, and stream states
  map to consistent colors — color must be _consistent_ and _never the only_ signal.
  Every status carries a text/`aria-label`/shape companion.
- **Keyboard-first.** `j/k` row nav, `t` group toggle, `/` focus search, roving-tabindex
  tablists, a global `:focus-visible` ring. Preserve this.
- **Honor reduced motion.** `global.css` has a `prefers-reduced-motion` block that
  disables all transitions and animations. Any new motion must live outside that override.
- **Many small files.** One component per file; layout CSS co-located as `*.module.css`.

---

## 2. File structure

```
web/src/
  main.tsx            MantineProvider(theme, cssVariablesResolver) + ColorSchemeScript → App
  App.tsx             AppShell (header/navbar/main/aside), tab routing, top-level state, SSE context
  App.module.css      custom tab strip (.tabs/.tab/.tab.active/.tabpanelFill) + content layout
  theme.ts            single source of truth: scales, defaultProps, cssVariablesResolver
  global.css          ONLY: box-sizing reset, body layout, scrollbar, :focus-visible ring, reduced-motion
  lib/                CARRIED OVER (unchanged): api.ts sse.ts types.ts url.ts format.ts a11y.ts sidebarPrefs.ts
  components/
    icons.ts           @tabler/icons-react wrapper (inlineIcon) + kindBadgeStyle() + severityColor()
    ThemeToggle.tsx    header sun/moon scheme switch
    Sidebar.tsx        file list, state dots, anomaly counts, stream chip, collapse rail
    Sidebar.module.css state dot (.st.*) + animation
    FilterBar.tsx      type/db/table MultiSelects, search, flat/grouped, jump-to-pos
    TruncCell.tsx      truncation-gated static Tooltip cell (+ lazy full-statement fetch)
    EventsTable.tsx    Mantine Table primitives + @tanstack/react-virtual windowing
    EventsTable.module.css  fixed table-layout, scroll container, vSpacer, zebra, pos-wrap tint, skeleton
    table-utils.module.css  shared :global rules: sortable headers, .num, severity/.warn classes,
                             .anom-marker, .statusbar, .load-more, .empty-state
    MetricsCharts.tsx  recharts BarCharts; series colors from Mantine CSS vars
    MetricsCharts.module.css  chart container layout (.charts/.chartRow/.panel/.widePanel)
    Drawer.tsx         aside: tabs Rows/Diff/Hex/JSON + pos-wrap explainer
    Drawer.module.css  before/after grid, diff grid, hex chip colors, pos-wrap panel
    HexView.tsx        monospace hex dump
    HexView.module.css hex dump grid layout + byte-class tints
    DiffView.tsx       before/after diff renderer
    DiffView.module.css  agree/disagree row tints
  views/
    OverviewView.tsx   file metadata grid, metric cards, anomaly strip, MetricsCharts, top-N tables
    EventsView.tsx     FilterBar + virtualized EventsTable, live tail, grouped, pos-wrap rows, Drawer
    TxnsView.tsx       transaction list, status badges, anomaly severity tints, open-txn indicator
    TablesView.tsx     per-table ins/upd/del badges, byte totals, click-to-filter
    AnomaliesView.tsx  severity filter, re-run, table with severity/detector/message/links
    SchemaView.tsx     DDL events, kind badge, statement column (TruncCell + lazy full-SQL)
    SettingsView.tsx   vertical-nav sections: general/display/anomaly/remote streaming, save
    ArchitectureView.tsx  static pluggable-decoder diagram; close
```

---

## 3. Theme and CSS variables — Sky + slate palette

The palette is **Sky + slate**: Tailwind color ramps replace all hand-crafted hex values.
Sky (`#38bdf8` dark / `#0284c7` light) is the accent; slate is the dark-scheme surface
ladder; Emerald / Amber / Rose / Violet / Teal carry semantic meaning. All scales are
defined in `web/src/theme.ts` and nowhere else.

### 3.1 Color principles

| Principle                             | Description                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Neutral surfaces**                  | Surfaces, backgrounds, and borders use the slate scale. They carry no meaning — they fade into the background.                                                                                                                                                                                                      |
| **Accent for interaction only**       | Sky accent (`var(--accent)`, `color="accent"`) appears exclusively on interactive elements: focus rings, active tab underlines, active-file left border, selected row tint, primary buttons, interactive hover borders. It must never appear on static data labels, column headers, or non-interactive decorations. |
| **Color carries meaning**             | Each semantic color is tied to a concept and kept consistent. Green = success/live/OK (Emerald). Amber/orange = warning/UPDATE/medium severity. Red/rose = error/DELETE/critical. Violet/grape = QUERY/DDL. Indigo = TABLE_MAP events. Gray = low-severity/neutral.                                                 |
| **Quiet agreements, loud exceptions** | Normal rows are neutral. Exceptional rows (pos-wrap 4 GiB boundary, anomaly severity) get amber/red tints that stand out sharply.                                                                                                                                                                                   |
| **3-tier text**                       | `--text` (primary), `--text2` (secondary/subdued), `--muted` (tertiary/placeholders). Use these instead of inventing new shades.                                                                                                                                                                                    |
| **Color is not the only signal**      | Every status (severity, wrap, stream state, chart series) must carry a non-color companion: text, `aria-label`, shape, or pattern.                                                                                                                                                                                  |

### 3.2 Mantine theme (`web/src/theme.ts`)

`createTheme(...)` defines:

- **`primaryColor: 'accent'`** — the Sky blue scale (`#38bdf8` index 4 dark, `#0284c7`
  index 6 light). **`primaryShade: { light: 6, dark: 4 }`** — brighter in dark mode,
  deeper in light mode for contrast on white.
- **Custom color scales** (all Tailwind-seeded):
  - `accent` — Sky: the brand/interaction color.
  - `dark` — Slate: the surface ladder for the dark scheme (index 0 = text, 8 = bg).
  - `green` — Emerald: OK / live / growing / write / success.
  - `orange` — Amber: warning / UPDATE / medium severity.
  - `red` — Rose: error / DELETE / critical severity.
  - `grape` — Violet: QUERY / DDL.
  - `indigo` — Indigo: TABLE_MAP events (distinct from WRITE's green; teal sat too close).
  - `teal` — Teal: available semantic scale (no current kind mapping).
- **`autoContrast: true`** — auto-picks legible text on filled colors.
- **`white: '#ffffff'`** — used for light-scheme paper surfaces.
- **Font stacks**: `fontFamily` (sans: `-apple-system, "Segoe UI"`) and
  `fontFamilyMonospace` (SF Mono stack).
- **`fontSizes`**: `xs=11px sm=12px md=13px lg=16px xl=20px`.
- **`defaultRadius: 'sm'`**.
- **Dense defaults** via `components`: `Button`, `TextInput`, `NumberInput`, `Select`,
  `MultiSelect` all default to `size="xs"`.
- **Tooltip/TooltipFloating** `defaultProps`/`styles`: `multiline: true`, max-width
  capped at `min(440px, 60vw)` with `word-break: break-word`.

### 3.3 `cssVariablesResolver` (the bespoke var layer)

`cssVariablesResolver` (exported from `theme.ts`, passed to `MantineProvider`) emits
variables in three buckets:

| Bucket      | Variables                                                | When they apply             |
| ----------- | -------------------------------------------------------- | --------------------------- |
| `variables` | `--mono`, `--fs-sm`, `--fs-base`, `--fs-lg`, `--fs-xl`   | Always (scheme-independent) |
| `dark`      | See table below                                          | dark scheme                 |
| `light`     | Same keys, Sky+slate light values, `color-scheme: light` | light scheme                |

**Bespoke CSS vars emitted per scheme:**

| Variable                                                        | Purpose                         |
| --------------------------------------------------------------- | ------------------------------- |
| `--bg --panel --panel2 --elev`                                  | Surface ladder (4 levels)       |
| `--border --border-subtle`                                      | Border hierarchy                |
| `--text --text2 --muted`                                        | 3-tier text                     |
| `--accent --accent-hi --accent-soft`                            | Sky interaction tints           |
| `--surface-active`                                              | Selected-row / active-file tint |
| `--green --orange --red --grape --teal --indigo`                | Semantic data colors            |
| `--sev-critical-text` … `--sev-low-text`                        | Severity text colors            |
| `--warn --warn-bg --warn-row-bg --warn-row-hover --warn-border` | Pos-wrap / anomaly amber family |
| `--diff-ok --diff-dis-bg --diff-dis-bar`                        | Diff view agree/disagree colors |

Components reference these via `var(--bg)`, `var(--accent)`, `var(--diff-ok)`, etc.,
so they flip with the scheme automatically. Where a Mantine semantic var fits
(`--mantine-color-text`, `--mantine-color-dimmed`, `--mantine-color-default-border`),
prefer it. Avoid referencing a fixed shade of the `dark` tuple directly (e.g.
`--mantine-color-dark-7`): those shades do not flip in light scheme.

There is **no exported `tokens` const** — the old `tokens` JS export is gone.
The resolver's internal `darkTokens`/`lightTokens` objects are private to `theme.ts`.

### 3.4 Global CSS (`web/src/global.css`) — the complete list

`global.css` is intentionally tiny. It contains exactly:

- Universal `box-sizing: border-box; margin: 0; padding: 0` reset.
- `body` flex-column layout (`height: 100vh; overflow: hidden`), background/color/font-size
  reading the resolver vars.
- Themed scrollbars (`scrollbar-width/color` for Firefox; `::-webkit-scrollbar*` for WebKit).
- `:focus-visible` ring using `var(--accent)` (the Sky interaction color).
- `prefers-reduced-motion` block disabling all transitions and animations.

Nothing else is global. All view/component styling lives in CSS Modules.

---

## 4. The 3 non-pure-Mantine pieces (and why)

Mantine handles all layout, badges, inputs, tabs, and typography. Three subsystems need
extra CSS or non-Mantine rendering primitives:

### 4.1 EventsTable (virtualized)

`components/EventsTable.tsx` uses Mantine `Table.Thead/Tbody/Tr/Th/Td` primitives but
requires `@tanstack/react-virtual` (`useVirtualizer`) to window million-row binlogs.
Mantine `Table` has no built-in virtualization. Co-located CSS:

- `EventsTable.module.css`: scroll container (`.tableWrap`), fixed `table-layout`
  (`.eventsTable`), virtual spacer rows (`.vSpacer`), loading skeleton shimmer.
  Global (`:global`) rules for row semantics applied as plain classNames by the row
  renderer: zebra striping (`.zebra-odd` keyed off absolute index not `:nth-child`),
  selected row (`tr.selected` → `var(--surface-active)`), pos-wrap amber tint
  (`tr.pos-wrap-row` → `var(--warn-row-bg)` + amber inset border), txn group-header
  row (`.txn-hdr`), summary/tbl ellipsis columns.
- `table-utils.module.css`: shared `:global` rules consumed across views — sortable
  column headers, `.num` right-align + tabular-nums, `.sev-*`/`.warn` severity classes,
  `.anom-marker`, `.statusbar`, `.load-more`, `.empty-state`.

### 4.2 MetricsCharts (Recharts)

`components/MetricsCharts.tsx` uses Recharts `BarChart`s because Recharts renders SVG
and there is no Mantine chart component for these layouts. Colors are read from
Mantine CSS vars (`var(--mantine-color-<name>-6)`) so they remain scheme-aware.
Chrome (axis, grid, tooltip) uses Mantine semantic vars. Layout lives in
`MetricsCharts.module.css` (`.charts`, `.chartRow`, `.panel`, `.widePanel`, `.skeleton`).

### 4.3 Drawer hex/diff panes

`Drawer.tsx` uses Mantine `Tabs`/`Table`/`SimpleGrid`/`Code` where they fit. The hex
dump (`HexView.tsx`) and diff renderer (`DiffView.tsx`) each have their own CSS Modules
for the monospace grid layout, byte-class tints, and agree/disagree row colors:
`HexView.module.css`, `DiffView.module.css`, `Drawer.module.css`.

---

## 5. Status & semantic colors

All semantic mappings live in `KIND_COLOR` / `severityColor()` in
`components/icons.ts` as Mantine **scale names**; badges render `color={name} variant="light"`.

| Concept                            | Mantine scale / token   | Notes                                                                  |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| OK / WRITE / success               | `green` (Emerald)       | WRITE badge green; Emerald `#34d399` dark / `#059669` light            |
| Live / growing file dot            | `accent` (Sky)          | growing-file state dot; interactive because file is actively streaming |
| Warning / UPDATE / medium-sev      | `orange` (Amber)        | UPDATE badge, amber surfaces, medium severity                          |
| Error / DELETE / high+critical-sev | `red` (Rose)            | error text, DELETE badge                                               |
| QUERY / DDL                        | `grape` (Violet)        | QUERY + DDL badges                                                     |
| TABLE_MAP events                   | `indigo` (Indigo)       | TABLE_MAP kind badge (chart series too)                                |
| XID / interactive / focus          | `accent` (Sky)          | XID badge, focus ring, active left-border, active tab underline        |
| Neutral / low-sev / unknown        | `gray`                  | low severity, detector tags, default badge                             |
| Selected event row                 | `var(--surface-active)` | slate-sky tint (dark) / sky tint (light)                               |

**Pos-wrap (4 GiB) amber convention.** When `end_log_pos` wraps past the 4 GiB
boundary (see `CLAUDE.md` gotcha §1), the row gets amber background (`var(--warn-row-bg)`),
amber inset left border (`var(--warn)`), an `↩` marker (`WrapArrow` from `icons.ts`)
in the marker column, and an explainer panel in the Drawer. The severity detector
`pos_wrap` also fires a medium-severity anomaly on any file ≥ 4 GiB.

**Color-not-only rule**: every status (severity, wrap, stream state, chart series) must
carry a non-color signal — text, `aria-label`, shape, or pattern.

---

## 6. Icons

`components/icons.ts` is a `.ts` file (not `.tsx`) that wraps `@tabler/icons-react`
via `createElement` to avoid JSX syntax. The `inlineIcon()` helper sets a default
`size=16`, `stroke=1.75`, and `verticalAlign: 'middle'` — overridable per call site.
All named exports (`Close`, `Warning`, `WrapArrow`, `Check`, `Cross`) follow this
convention. No other icon library is used.

---

## 7. Carried-over data layer (`lib/`)

These files are **unchanged** from before the rewrite and own the Go-API contract:

| File              | Responsibility                                              |
| ----------------- | ----------------------------------------------------------- |
| `api.ts`          | fetch client for all HTTP endpoints                         |
| `sse.ts`          | `useIndexEvent` + `SSEContext` for live tail                |
| `types.ts`        | API shape types (`BinlogFile`, `EventRow`, `Filters`, etc.) |
| `url.ts`          | URL state encode/decode                                     |
| `format.ts`       | byte/time/pos formatters                                    |
| `a11y.ts`         | `clickable`/`clickableRow` keyboard helpers                 |
| `sidebarPrefs.ts` | sidebar width/collapse persistence                          |

---

## 8. Do / Don't

**Do**

- Use Mantine components for new views and UI chrome.
- Source semantic colors from `theme.ts` (`KIND_COLOR`/`severityColor()`) — never
  introduce raw hex in component code.
- Use `var(--mantine-color-*)` for inline styles where a semantic var exists; use
  resolver vars (`var(--bg/--panel/--border/--text/--warn*/--sev-*)`) in CSS Modules
  for the bespoke data-table and chart CSS.
- Right-align + `tabular-nums` numeric columns; monospace (`var(--mono)`) for all data.
- Pair every status color with a non-color signal and an `aria-label`.
- Keep keyboard nav (`j/k/t//`) and the `:focus-visible` ring.
- Keep `prefers-reduced-motion` coverage for any new animation (add it to the component's
  own CSS Module, not to `global.css`).

**Don't**

- Don't add global CSS to `global.css` — only resets, scrollbar, and the focus ring live
  there. New styling goes in a co-located CSS Module.
- Don't add a monolithic stylesheet; the old `styles.css` is gone and must not return.
- Don't introduce a light-scheme surface as a hardcoded hex; use resolver vars or
  Mantine semantic vars so it flips correctly.
- Don't use emoji/dingbat glyphs as icons — use `@tabler/icons-react` via `icons.ts`.
- Don't grow the events DOM unbounded — the virtualizer in `EventsTable.tsx` is the
  correct pattern; do not bypass it with a plain `Table`.
- Don't export a `tokens` const from `theme.ts` — that pattern is intentionally removed.
- Don't reference `--mantine-color-dark-N` directly in components; those shades don't
  flip in light scheme.
