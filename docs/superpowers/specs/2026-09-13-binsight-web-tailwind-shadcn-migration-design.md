# Architecture Design Spec: Binsight Web App Migration to Tailwind CSS & Shadcn UI

**Date:** 2026-09-13  
**Status:** Validated / Ready for Planning  
**Target:** `web/` (Binsight Local Desktop & Binlog Inspector Web Application)  
**Author:** AI Pair Programmer & Adrij Shikhar  

---

## 1. Executive Summary & Intent

Binsight's web application (`web/`) is a high-performance, read-only MySQL & MariaDB binlog visualizer served directly from a compiled Go binary (`embed.FS`) on `http://localhost:8080`. 

Currently, the web application relies on **Mantine 9**, `@tabler/icons-react`, and custom CSS Modules (`*.module.css`). While functional, its design language does not match the sleek, dark dev-tool aesthetic of the new marketing site (`website/`). Overriding Mantine's styles is cumbersome, its runtime styling introduces unnecessary abstraction, and the UI lacks the dense, polished terminal-like feel of tools like Zed, TablePlus, and Supabase Studio.

This specification defines the complete architectural migration of `web/` to **Tailwind CSS v3 + Shadcn UI (built on Radix UI Primitives) + Lucide React**, unifying the entire product ecosystem under a single, cohesive design language.

---

## 2. Core Architecture & Stack Comparison

| Layer | Existing Stack | New Target Stack | Rationale |
|---|---|---|---|
| **Build & Bundler** | Vite 5 + React 19 + TypeScript | Vite 5 + React 19 + TypeScript | Preserved. Ultra-fast HMR and produces static `dist/` embedded into Go binary. |
| **Styling Engine** | Mantine 9 Styles API + CSS Modules | **Tailwind CSS v3 + PostCSS + Autoprefixer** | Zero runtime CSS overhead, collocated classes, 100% token parity with website. |
| **UI Components** | `@mantine/core`, `@mantine/form`, `@mantine/hooks`, `@mantine/notifications` | **Shadcn UI (Radix UI Primitives)** | Headless WAI-ARIA accessibility, zero package lock-in, components owned in `src/components/ui/`. |
| **Icons** | `@tabler/icons-react` | **Lucide React** (`lucide-react`) | Standard icon library for Shadcn UI, cleaner SVG footprints, consistent stroke weights. |
| **Virtualization** | `@tanstack/react-virtual` v3 | `@tanstack/react-virtual` v3 | Preserved. Required for high-throughput 100k+ row virtualized event streams. |
| **Charts** | `recharts` v3 | `recharts` v3 | Preserved. Re-styled with Tailwind design tokens. |
| **Core Business Logic** | `web/src/lib/*` (API, SSE, URL state, preferences) | `web/src/lib/*` | Preserved 100% without breaking changes. |

---

## 3. Design System & Token Specifications

The application will operate in a **Dark-Native Developer Console Mode** matching the marketing site's high-contrast technical palette:

### 3.1 Color Palette

```css
:root {
  /* Canvas & Background Surfaces */
  --bg-canvas: #0b0f14;       /* Main window & table background */
  --bg-surface: #11161d;      /* Cards, toolbars, sidebar background */
  --bg-elevated: #161f2c;     /* Modals, drawers, dropdowns, hovered rows */
  --bg-subtle: #1e293b;       /* Active tabs, selected rows */

  /* Technical Borders */
  --border-muted: #212c3d;    /* Grid lines, card borders, table dividers */
  --border-active: #2d3b4f;   /* Hovered borders, active input outlines */
  --border-focus: #38bdf8;    /* Keyboard focus ring */

  /* Typography */
  --text-primary: #f0f6fc;    /* Primary headers, active values */
  --text-secondary: #c9d1d9;  /* Standard labels, body text */
  --text-muted: #8b949e;      /* Metadata, timestamps, helper text */
  --text-dim: #6e7681;        /* Inactive icons, subtle table borders */

  /* Semantic Accents & Binlog Mutation Kinds */
  --accent-cyan: #38bdf8;     /* Primary brand, active tab, stream LIVE indicator */
  --accent-blue: #58a6ff;     /* Links, queries, schema mutations */
  --status-insert: #3fb950;   /* INSERT events, successful txns, green */
  --status-update: #a78bfa;   /* UPDATE events, schema alterations, purple */
  --status-delete: #f87171;   /* DELETE events, rollback, anomalies, red/rose */
  --status-warn: #e3b341;     /* High memory, connection delays, amber/yellow */
}
```

### 3.2 Typography & Information Density

- **UI & Chrome Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- **Data & Numeric Font:** `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- **Rules:**
  - All event positions (`4194304`), timestamps (`14:35:10`), event sizes (`76 B`), table IDs, hex dumps, and queries MUST use monospace font.
  - Table row height: Compact 32px (default) for maximum information density per viewport.

---

## 4. Component Replacement Mapping

| Existing Mantine Component | Replacement Shadcn / Radix Primitive | File Path in `web/` |
|---|---|---|
| `AppShell` | Custom Tailwind layout grid with resizable splitter | `src/components/layout/AppShell.tsx` |
| `Button`, `ActionIcon` | `Button` (with `variants: default, secondary, ghost, outline`) | `src/components/ui/button.tsx` |
| `Badge` | `Badge` (with `variants: default, secondary, destructive, outline`) | `src/components/ui/badge.tsx` |
| `TextInput`, `PasswordInput` | `Input` | `src/components/ui/input.tsx` |
| `Table` | High-density Tailwind `Table`, `TableHeader`, `TableRow`, `TableCell` | `src/components/ui/table.tsx` |
| `Tabs` | Radix `@radix-ui/react-tabs` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) | `src/components/ui/tabs.tsx` |
| `Drawer` / Aside | Radix `@radix-ui/react-dialog` / Sheet or custom resizable inspection pane | `src/components/ui/sheet.tsx` |
| `Tooltip` | Radix `@radix-ui/react-tooltip` (`Tooltip`, `TooltipTrigger`, `TooltipContent`) | `src/components/ui/tooltip.tsx` |
| `Select`, `MultiSelect` | Radix `@radix-ui/react-popover` + Command / Combobox multi-select | `src/components/ui/popover.tsx`, `src/components/ui/command.tsx` |
| `Card` | `Card`, `CardHeader`, `CardTitle`, `CardContent` | `src/components/ui/card.tsx` |
| `Switch` | Radix `@radix-ui/react-switch` | `src/components/ui/switch.tsx` |
| `ScrollArea` | Radix `@radix-ui/react-scroll-area` / native Tailwind custom scrollbar | `src/components/ui/scroll-area.tsx` |

---

## 5. View-by-View Implementation Blueprint

### 5.1 AppShell & Workspace Layout (`src/App.tsx`)
- Resizable Left Sidebar (persists width to localStorage).
- Top Header Bar:
  - Binsight brand wordmark + current active file selector (`mysql-bin.000142`).
  - Real-time SSE Live indicator (pulse green for streaming, gray for static).
  - Anomaly alert pill counter.
  - Command palette search trigger (`⌘K`).
- Center Main View: Clean tabbed workspace for the 8 primary views.
- Right Inspection Pane: Resizable split-view drawer for active event forensics.

### 5.2 Core Data Views
1. **`EventsView` & `EventsTable`:**
   - TanStack Virtual v3 rendering over thousands of events.
   - High-density Tailwind rows with subtle zebra striping.
   - Instant visual distinction between `WRITE_ROWS` (green indicator), `UPDATE_ROWS` (purple indicator), `DELETE_ROWS` (rose indicator), and `QUERY` (blue indicator).
   - Monotonic 64-bit position accumulation display (`pos` & `end_pos`).
   - Keyboard shortcuts: `j`/`k` for row navigation, `Enter` to open drawer.

2. **`FilterBar`:**
   - Multi-select popover for Event Types (`WRITE_ROWS`, `UPDATE_ROWS`, `DELETE_ROWS`, `XID`, etc.).
   - Database and Table autocomplete dropdowns.
   - Quick search input for matching query strings or table names.
   - Segmented toggle for Flat Events vs. Transaction Grouped view.

3. **`Drawer` (Inspection Pane):**
   - Radix Tabs: `[Diff]`, `[Rows]`, `[Hex]`, `[JSON]`, `[SQL Metadata]`.
   - **`DiffView`:** Unified or side-by-side Before/After row changes with color-coded syntax highlights.
   - **`HexView`:** Fixed-pitch byte offset gutter, 16-byte hex dump columns, and printable ASCII representation.

4. **`OverviewView`:**
   - Metric summary cards: Total Events, Total Transactions, Bytes Processed, File Size, Time Span.
   - Recharts throughput timeline graphs styled with Tailwind CSS variables.
   - Top-10 mutated tables distribution breakdown.

5. **`TxnsView`, `TablesView`, `AnomaliesView`, `SchemaView`, `SettingsView`, `ArchitectureView`:**
   - Migrated to Tailwind cards, badges, and forms, preserving existing business logic and mutation APIs.

---

## 6. Migration Phasing & Safety Strategy

To eliminate risk and avoid breaking changes:

1. **Phase 1: Foundation Scaffolding**
   - Install Tailwind CSS v3, PostCSS, Autoprefixer, Radix UI primitives, Lucide React, and class utilities (`clsx`, `tailwind-merge`).
   - Configure `tailwind.config.js` and `global.css` with dark dev-tool design tokens.
   - Scaffold Shadcn UI primitives in `web/src/components/ui/`.

2. **Phase 2: App Shell & Workspace**
   - Rewrite `App.tsx` and `Sidebar.tsx` into Tailwind CSS.
   - Remove Mantine `AppShell`.

3. **Phase 3: Events Table & FilterBar**
   - Rewrite `FilterBar.tsx` using Radix Popovers/Commands.
   - Rewrite `EventsTable.tsx` using Tailwind Table + TanStack Virtual.

4. **Phase 4: Inspection Drawer & Forensics**
   - Rewrite `Drawer.tsx`, `DiffView.tsx`, and `HexView.tsx` into Radix Tabs + Tailwind.

5. **Phase 5: Remaining Views**
   - Rewrite `OverviewView`, `TxnsView`, `TablesView`, `AnomaliesView`, `SchemaView`, `SettingsView`, `ArchitectureView`.

6. **Phase 6: Cleanup & Test Verification**
   - Uninstall all `@mantine/*` and `@tabler/icons-react` dependencies.
   - Remove dead `*.module.css` files and old `theme.ts`.
   - Run `bun run build` and `bun run test` to verify 100% green status.

---

## 7. Success Criteria

1. **Zero Runtime CSS:** All styling compiled through Tailwind CSS at build time.
2. **Design Parity:** Binsight Web App visually matches the landing page's dark dev-tool palette (`#0b0f14`, `#212c3d`, `#38bdf8`).
3. **Build & Bundle:** Static build compiles cleanly into `web/dist/` and embeds seamlessly into the Go binary.
4. **Performance:** Virtualized event table scrolls at 60fps across 100,000+ events with zero frame lag.
5. **Testing:** All Vitest unit and component tests pass without errors.
