---
name: Binsight Design System
description: A dense forensic workbench with neutral surfaces, blue interaction, and compact rounded-rectangle data pills.
---

# Binsight Design System

## Current Phase Override - 2026-09-14

2026-09-15 update: Colors-only implementation is approved after checkpoint `1437a7a`. `web/src/styles/ui.css` is the sole executable theme source for this phase, including semantic data colors and state colors. Stock Coss component source remains pinned. All non-color design changes remain paused. The archived neutral palette remains in the stock lockfile as checkpoint evidence, not as the current theme.

The verified source checkpoint is pinned in `web/coss-stock-lock.json`. It uses upstream Coss components, neutral colors, built-in semantic variants, and stock table padding. No custom mutation badge variants, success-token override, forced 32px row height, or application tab animations remain. The 32px target and final palettes below are explicitly deferred.

Custom design implementation is paused by explicit user instruction. The current checkpoint uses stock Coss UI and removes all application CSS Modules and the bespoke theme. Only Tailwind/Coss foundation CSS remains in `web/src/styles/ui.css`; application layout utilities, dynamic geometry, and forensic data semantics remain. This desktop web app has no mobile acceptance target. The specifications below are future work, not current acceptance criteria. Codex now owns implementation. Apply these design changes incrementally only after user review of the stock baseline.

## Overview

This root document is the canonical visual contract for the application in `web/`. It replaces the previous marketing-site analysis and private companion design reference. The Astro marketing website is outside this document's migration scope.

Status: target specification, not a claim that the current partially migrated UI conforms. The user approved native stock Coss UI on 2026-09-14. Coss is the component source, Base UI supplies its behavior, and Tailwind supplies its styling. This supersedes both the earlier Radix-first direction and generic shadcn-as-foundation instructions. Codex maintains the design with user review; AntiGravity implements it. Do not silently change this contract to justify implementation drift.

Binsight is an operational tool for inspecting binlog events, transactions, schema changes, anomalies, and decoder differences. Prioritize scanning, comparison, keyboard operation, and accurate data. Preserve API/SSE behavior, URL navigation, persisted preferences, virtualized rendering, and forensic identifiers.

### Stock-first implementation

1. Start each replacement with the actual [Coss UI](https://coss.com/ui/docs) source and documented stock composition. Coss is the library, not visual inspiration for homemade components.
2. Preserve stock component sizes, radii, neutral primary, borders, shadows and state recipes during the functional migration. Do not port Mantine appearance overrides or apply final Binsight variants immediately.
3. Preserve domain behavior, accessibility, data semantics, 32px virtual event rows and specialized layout throughout. Stock defaults never excuse lost actions, illegible controls, green operational success, or unbounded rendering.
4. Record a working stock checkpoint across all views before applying the theme. Then apply colors, typography/density, shapes/pills, and elevation/states in separate tested passes.
5. Add custom CSS only for a demonstrated gap that stock composition, tokens, or a shared variant cannot cover. Delete superseded CSS only after its replacement is verified; never strip all styles first.

**Phase precedence:** Until the stock checkpoint, stock Coss appearance is explicitly accepted instead of the final appearance tables below. Neutral operational feedback is accepted; green chrome is not. Accessibility, zero tracking, no em dash copy, correct event semantics, responsive access, and virtual-row geometry apply from the start. Final Binsight values become acceptance requirements in their corresponding theme pass. Existing valid Binsight domain styling may remain; do not restyle retained forensic surfaces simply to make them stock.

### Ownership and executable tokens

- `DESIGN.md` specifies intent; target `web/src/styles/theme.css` is the single executable token source. Do not build a Markdown-to-CSS compiler, runtime theme generator, or duplicate palette file.
- Own Coss source in `web/src/components/ui/` and its documented support files in `web/src/lib/`. Use Coss registry entries through the shadcn CLI, or copy their official source, with the compatible `@base-ui/react` package. Verify actual generated imports and versions; do not infer the primitive layer from a generic preset name or CLI default.
- Base UI is headless behavior, not an additional theme. Coss source owns stock appearance; the single theme file and small shared recipes own later Binsight changes. Native display components and Recharts do not need artificial Base UI wrappers. Use Coss Toast, not Sonner. Do not add Radix primitives, Slot, or a second interactive primitive layer for convenience.
- After the stock checkpoint, Tailwind maps Binsight semantic tokens through CSS variable references and supplies layout utilities. Do not put a second hex palette in Tailwind configuration. Shared components own visual variants. Views must not override shared control colors, radii, or states.
- CSS Modules remain valid for table geometry, virtualization, resizable panes, charts, hex/diff inspectors, and specialized layout. Do not translate working layout CSS merely to reduce the number of CSS files.
- Keep Mantine temporarily while replacing vertical slices. Its theme is a temporary adapter, not a second long-term design system. Remove the provider, styles, hooks, and packages only after all consumers migrate.
- Coexistence exception: freeze the old Mantine internal color ladders for unmigrated controls instead of forcing CSS variables through its color parser. Do not expand those ladders or treat them as target tokens. Remove them at the Mantine-free checkpoint. New primitive tests run without Mantine; legacy test wrappers remain only while their tested subtree still needs them.
- shadcn's conventional `--accent` means a subtle surface, while Binsight's existing `--accent` means solid blue. Do not blindly merge those namespaces: use `--primary` for solid blue, `--accent` for the stock subtle interaction surface, and explicit `--brand` for legacy blue consumers. Rewrite existing solid-blue consumers to `--brand` before switching the meaning of `--accent`.
- Inventory both token definitions and consumers before the namespace change, including tests and charts. Rewrite legacy references and remove resolver declarations that shadow the new roles in one tested step. Keep Tailwind preflight disabled during coexistence; enable it only after legacy components and competing resets are removed.

### Coss installation and coexistence

Follow [Get Started](https://coss.com/ui/docs/get-started) and [Styling](https://coss.com/ui/docs/styling). Inspect generated files in a temporary directory and record source URLs, resolved CLI version, registry entries, dependencies and license. Prefer individual entries such as `@coss/button`, `@coss/tooltip`, `@coss/combobox` and `@coss/toast`. Do not run full `@coss/style` initialization or install all `@coss/ui` components over the existing app. Those presets also install fonts and base styles; Next.js font/layout examples are not Vite instructions.

Keep stock Coss neutral light/dark role values in a clearly labeled temporary section of `theme.css`, never a second competing theme file. Preserve Binsight legacy and domain values in their existing explicit roles. Detach legacy aliases from stock roles where a Coss default would otherwise change an unmigrated surface, and test each affected consumer. Do not let two root declarations silently compete. Portals inherit the same root scheme and Coss roles. At the theme passes, replace temporary values with the target table and reconsolidate aliases; remove the temporary section rather than retaining two palettes. Preserve already completed namespace fixes, not necessarily the early custom appearance of generic shadcn controls.

Keep Tailwind preflight disabled while Mantine remains. Integrate Coss-required base rules deliberately, including app-root isolation and body relative positioning, and check portal stacking. Do not copy a second global reset. Coss docs still label the library early-development; freeze reviewed source and verify upgrades rather than tracking regenerated latest source blindly.

Coss roles differ in details from generic shadcn. Inventory its info, warning, success, destructive, sidebar, font-heading and shadow consumers. Keep needed stock support tokens defined in the stock section; never expose green success variants for operational feedback. Use neutral/default or info notifications. Final mappings belong in the role table below, not in per-view patches.

Rule precedence within this document: explicit role-specific exceptions override the general component rule; the target-token and shape tables define final values. Temporary coexistence rules expire when Mantine is removed. Research values and current-code observations are evidence, not alternative requirements. New deviations require a documented design decision, not a local override.

### Resuming the interrupted migration

Preserve all partial work, tests, tokens, and unrelated changes. Before resuming, inventory installed packages, generated UI files, consumers, and completed task evidence. Existing Radix-backed controls may remain only while their stock Coss replacements are being verified; do not build further on them. Replace their primitive bindings through a tested, component-scoped Coss source change, then remove unused Radix dependencies. This temporary exception does not permit a mixed-primitive final application.

Do not mechanically rename imports. Base UI composition uses its documented `render` API where applicable rather than assuming Radix `asChild`/Slot; ref forwarding, event callback details, controlled state, portal placement, and open/disabled data attributes must match the installed Base UI component. Verify behavior and update shared selectors accordingly. Never introduce a compatibility wrapper that recreates Radix's whole API.

## Colors

### Target tokens

All values are CSS custom properties in the single theme file. Light mode is first-class. Match the scheme on the document root so portals inherit it.

Theme contract: `html[data-theme="dark"]` or `html[data-theme="light"]`, with the `.dark` class synchronized for stock utilities. The saved preference is `dark`, `light`, or `auto`; retain the existing `localStorage["mantine-color-scheme-value"]` key as a compatibility contract, not a package dependency. Missing, invalid, or inaccessible storage defaults to dark. Auto resolves through `prefers-color-scheme`, and follows changes while selected. Apply the resolved scheme before mounting React and test reloads for a wrong-theme flash. The owned provider is the only writer; during coexistence, pass its resolved value to Mantine with `forceColorScheme` rather than maintaining two independent writers. Cross-tab storage updates must synchronize without write loops. Portals inherit the root scheme.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--background` | `#141516` | `#ffffff` | Canvas |
| `--surface-1` | `#1b1c1e` | `#f5f6f6` | Base panels |
| `--surface-2` | `#212224` | `#f6f7f7` | Lifted/hover surfaces |
| `--surface-3` | `#252629` | `#ffffff` | Subnav and popovers |
| `--surface-4` | `#27282b` | `#f1f3f5` | Highest tonal surface |
| `--border` | `#34363b` | `#e1e4ea` | Decorative 1px hairlines |
| `--border-strong` | `#45484f` | `#ced4da` | Strong decorative separators |
| `--input` | `#777c85` | `#7e838c` | Essential control boundaries |
| `--foreground` | `#f7f8f8` | `#000000` | Primary text |
| `--foreground-secondary` | `#d0d6e0` | `#2c313a` | Secondary text |
| `--muted-foreground` | `#8a8f98` | `#62666d` | Supporting text, agreement status |
| `--primary` | `#0075de` | `#0062bd` | Solid blue controls |
| `--primary-hover` | `#2c6bb3` | `#0053ad` | Solid hover/pressed state |
| `--primary-foreground` | `#ffffff` | `#ffffff` | Ink on solid primary |
| `--brand-foreground` | `#7eb8ff` | `#0a67c2` | Links and selected labels |
| `--ring` | `#7eb8ff` | `#0a67c2` | Keyboard focus |
| `--selection` | `#0b2543` | `#ebf3fd` | Selected control/chip wash |
| `--row-selected` | `rgba(0,117,222,.10)` | `rgba(0,98,189,.08)` | Selected event row |

Standard aliases: `--card: var(--surface-1)`, `--card-foreground: var(--foreground)`, `--popover: var(--surface-3)`, `--popover-foreground: var(--foreground)`, `--secondary: var(--surface-2)`, `--secondary-foreground: var(--foreground)`, `--muted: var(--surface-2)`, `--accent: var(--selection)`, `--accent-foreground: var(--brand-foreground)`, and `--brand: var(--primary)`.

Legacy layout aliases may remain in the same file: `--bg` to background, `--panel` to surface-1, `--panel2` to surface-2, `--elev` to surface-3, `--text` to foreground, `--text2` to foreground-secondary, and `--mono` to the mono font token. Existing `--muted` text consumers must migrate to `--muted-foreground` before introducing the stock background meaning. Do not change a token's role under unchanged consumers.

Hairlines organize surfaces; they alone do not provide an accessible essential control boundary. Use `--input` where the boundary carries meaning. Verify rendered contrast.

### Palette evidence

Blue was explored with the [Radix custom palette tool](https://www.radix-ui.com/colors/custom?accent-dark=0075DE&gray-dark=8A8F98&bg-dark=010102&accent-light=0062BD&gray-light=8A8F98). Its gray seed was exploratory; preserve the established surface ladder.

Radix Colors is palette research only and is independent of the chosen Base UI component primitives. It does not require a Radix runtime dependency or change the approved blue tokens.

Generated blue steps 1-12, as reference rather than a second implementation source:

```text
dark:  #000105 #0b1420 #0b2543 #07315e #0f3d70 #1a4a81 #245996 #2b6ab2 #0075de #2c6bb3 #7eb8ff #cee3fe
light: #fcfdfe #f6fafe #ebf3fd #dcebff #cbe2ff #b6d5fd #9dc3f3 #7aabe9 #0062bd #0053ad #0a67c2 #103259
```

Measured white-text contrast: dark primary approximately 4.57:1, dark hover 5.44:1, light primary 6.03:1. The old hover `#388bfd` gives only 3.34:1 with white and is not acceptable for normal-sized white button labels. No whole-control opacity fade on hover. These measurements are not full application accessibility certification.

### Semantic data colors

| Role/token | Dark ink | Light ink | Light wash |
|---|---|---|---|
| Insert / `--data-insert` | `#34d399` | `#047857` | `#ecfdf5` |
| Update/warning / `--data-update` | `#fbbf24` | `#b45309` | `#fffbeb` |
| Delete/error / `--data-delete` | `#fb7185` | `#be123c` | `#fff1f2` |
| Query/schema / `--data-query` | `#c4b5fd` | `#6d28d9` | `#f5f3ff` |

Name paired background tokens `--data-insert-bg`, `--data-update-bg`, `--data-delete-bg`, and `--data-query-bg`. Dark backgrounds mix the corresponding ink at 14% with transparent; light backgrounds use the table. Borders use `--border`. Label text carries the meaning, not the border.

- WRITE_ROWS and `+ins` use insert; UPDATE_ROWS and `~upd` use update; DELETE_ROWS and `-del` use delete. QUERY, CREATE and ALTER use query; DROP uses delete; TRUNCATE uses warning. TABLE_MAP, XID, GTID, and unknown kinds are neutral.
- Green is quarantined to WRITE_ROWS, genuine diff additions, and the sidebar ready dot (`#34d399` dark, `#059669` light). No general green success variant.
- Chrome, save/restart notifications, live-tail controls, brand, navigation, links, and focus are blue or neutral. The live-tail dot is blue; it is not another ready-dot exception.
- Agreement between adapters is neutral `--muted-foreground`, never green. The legacy `diffOk` agreement meaning must be retired.
- A WRITE_ROWS label inside a filter may retain semantic green. Its enclosing control, remove button, hover, and focus stay neutral/blue.
- Aggregate charts use blue. Type-breakdown charts use the same semantic mapping as event badges, not an independent teal/green palette.
- Errors pair an icon or explicit label with semantic color. Preserve actual event names and signs; never rely on color alone.
- For solid destructive actions use `--destructive: #be123c` with white `--destructive-solid-foreground` in both themes; use `#9f1239` for hover. Error text uses the separate data-delete ink, not white-on-pale-rose.

Coss uses `--destructive-foreground` for error ink on subtle surfaces as well as destructive variants. In the final theme, set it to `--data-delete`, and use a separate `--destructive-solid-foreground: #ffffff` for solid destructive actions only. Audit the stock Button recipe so text and solid variants do not share incompatible ink. Define `--info: var(--selection)`, `--info-foreground: var(--brand-foreground)`, `--warning: var(--data-update-bg)`, and `--warning-foreground: var(--data-update)`. If copied Coss source requires `--success` and `--success-foreground`, alias them to neutral surface/text, not green; Binsight additions use explicit data tokens. Define `--font-heading: var(--font-sans)` without a self-alias. Only define sidebar roles if an actual copied consumer requires them.

Name the destructive hover token `--destructive-hover`. Name the permitted ready-dot token `--status-ready`; all other passive operational status labels are neutral. A Coss compatibility `success` token is neutral and never broadens the green exception.

### Legacy consumer completion

Deleting the old theme must not leave retained CSS Modules with unresolved variables. The following compatibility mappings are permitted in the same theme file; new components use the explicit role tokens instead.

| Legacy family | Target |
|---|---|
| `--accent-hi`, `--accent-focus`, `--accent-soft`, `--surface-active` | Primary-hover, ring, selection, row-selected respectively |
| `--green`, `--orange`, `--red`, `--grape` | Data-insert, data-update, data-delete, data-query respectively |
| `--sev-critical-text`, `--sev-high-text` | Data-delete |
| `--sev-medium-text`, `--warn`, `--warn-border` | Data-update |
| `--sev-low-text` | Muted-foreground |
| `--warn-bg`, `--warn-row-bg`, `--warn-row-hover` | Data-update-bg; the persistent rail conveys warning even on selection |
| `--diff-dis-bg`, `--diff-dis-bar` | Data-delete-bg and data-delete |
| `--badge-{green,orange,red,grape}-{bg,text}` | Corresponding data-role background and ink |
| `--badge-*-border` | Border |
| `--badge-accent-{bg,text}` | Selection and brand-foreground |
| `--badge-gray-{bg,text}` | Surface-2 and foreground-secondary |

Remove `--diff-ok` agreement consumers rather than preserving its misleading meaning. Retire teal/indigo event badges: neutral event categories use neutral tokens; schema/query categories use data-query. Any surviving non-event use must be assigned its actual role, not receive a blanket hue alias. `--border-subtle` may alias surface-3 for decorative separators only. Before removing the resolver, inventory every remaining `var()` reference and verify a definition, a valid fallback, or an explicitly identified library-owned runtime variable. No unresolved token is an acceptable migration remainder.

## Typography

System sans: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif`.
Mono: `'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace`. Bundle fonts locally when needed; no remote font dependency.

Expose these stacks as `--font-sans` and `--font-mono`; `--mono` is a compatibility alias to `--font-mono`.

Existing size aliases may remain for retained layouts: `--fs-sm: 11px`, `--fs-base: 13px`, `--fs-lg: 16px`, and `--fs-xl: 20px`. Their values do not authorize making every new label 11px; new components follow the role table below.

| Role | Size / line height | Weight |
|---|---|---|
| View heading | 20px / 26px | 600 |
| Section heading | 16px / 22px | 600 |
| Body/form label | 13px / 20px | 400 / 500 |
| Compact control/supporting text | 12px / 16px | 400 / 500 |
| Data badge | 11px / 14px | 500 |
| Metric value | 24px / 30px | 600 |

All letter spacing is zero. Do not use fluid viewport-scaled type or oversized marketing headings. Numbers, timestamps, offsets, GTIDs, transaction IDs, and metrics use monospace with tabular numerals. Right-align numeric columns. Preserve uppercase event names without uppercasing user identifiers.

Use concise factual copy. No em dash characters in UI copy, placeholders, or authored documentation. Use regular hyphens. No visible styling, framework, or shortcut explanations; accessible names/tooltips may name actions or expose truncated data.

## Layout

- Base spacing: 4, 8, 12, 16, 24, 32px. Specified chip interiors may use 6px padding and 2px optical spacing.
- Preserve the 44px app header, file sidebar, underline tabs, filter ribbon, data surface, and resizable detail aside.
- Desktop controls: 32px height. Dense filter inputs: 28px. Preserve minimum 38px top filter band and 34px filter row; wrap groups when required rather than clipping controls. On coarse pointers, standalone controls and chip remove targets grow to 44px and bands may grow with them.
- Events rows: 32px including the 1px separator. Virtualizer estimates and CSS must agree. Never replace virtualization with a full rendered stock table.
- Sections are unframed or full-width bands. Individual metric/table items may be cards; no cards inside cards.
- At narrow widths, collapse the sidebar behind an accessible control, wrap filter groups, and horizontally scroll the table within its data region. Preserve access to full identifiers.
- Below 768px, detail uses a full-width modal Sheet with managed focus. Desktop detail remains nonmodal and resizable. Do not trap desktop aside focus.
- All interactive targets are at least 24x24px. Dense table rows remain 32px even on coarse pointers; they are the explicit exception to the 44px standalone-control target. A smaller visual chip can have a larger nonoverlapping target outside dense rows. Inside rows, use a 24px action target with the 20px visual badge.
- Validate at 1440x900 and 390x844, both themes, plus 200% zoom. No page-level horizontal overflow or overlapping controls; data-region overflow is intentional.

## Elevation & Depth

Use tonal surfaces and 1px hairlines, not dark drop shadows. Lifted panels receive `inset 0 1px 0 rgba(255,255,255,.05)` in dark mode and no highlight in light mode. Interactive panel hover changes surface without resizing or translation.

Surface levels describe purpose, not a requirement that every light-theme level become brighter. Metric interiors use 12px padding; ordinary framed panels use 16px. These do not apply to table cells or the unframed page shell.

Portalled dropdowns/tooltips use the popover tokens and escape clipping scroll regions. Modal content remains opaque over a black 50% scrim. No blur, glow, gradient borders, or pulsing halos.

Keyboard focus: 2px ring with 2px offset, visibly separated from solid controls by a surface-colored gap. Focus must remain visible in ribbons, tables, and portals.

## Shapes

**Binsight pills are compact rounded rectangles, not oval capsules.** Their name is not a requirement for fully rounded ends.

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | Filter summaries, transaction and jump chips |
| `--radius-sm` | 6px | Event badges, data/status pills, tags |
| `--radius-md` | 8px | Buttons and inputs |
| `--radius-lg` | 12px | Individual cards and framed panels |
| `--radius-pill` | 9999px | Segmented tracks/selected segments only |

Dots and switch thumbs are circles. App regions and table rows do not inherit card rounding. Map the stock radius utilities to these exact tokens, not a default arithmetic scale that shifts all radii together.

Tailwind integration: radius and font names already match Tailwind v4 theme names. Declare their values once in the theme file's `@theme` block; do not create circular aliases such as `--radius-sm: var(--radius-sm)`. Color utilities use distinct names, for example `--color-primary: var(--primary)` in `@theme inline`. Spacing utilities may use the stock 4px base, with shared dense variants for the specified 2px/6px exceptions.

## Components

### Pills and badges

Observed sources: `KindBadge.module.css`, `FilterBar.module.css`, `global.css`, and `theme.ts`. Global 6px overrides conflict with some local 4px declarations. The role assignments below resolve that ambiguity.

| Variant | Geometry, borders included | Appearance |
|---|---|---|
| Event badge | 20px high, 6px radius, 6px horizontal padding | 11px mono, semantic ink/wash, 1px hairline |
| Status pill | 20px high, 6px radius, 8px horizontal padding | Neutral surface and secondary text |
| Filter/summary chip | 20px high, 4px radius, 8px horizontal padding | Neutral surface, 11px mono, hairline |
| Transaction/jump chip | 20px high, 4px radius, 6px horizontal padding | Selection wash, brand foreground |
| Removable chip | Same role-specific geometry, 4px internal gap | Separate neutral remove icon and focus |

Implement these as shared Coss Badge and documented Combobox chip recipes before considering a dedicated CSS Module. Stock composition is preferred; shared variant classes are not a reason to invent a custom chip engine.

Static badges have no pointer cursor or hover. Actionable labels use buttons or links. A removable chip is a noninteractive wrapper with a separate remove button; never nest buttons. Retain the existing accessible removal names such as `Remove txn 42 filter`.

Hover preserves semantic ink; no whole-label opacity fade. Selected controls use selection wash and explicit state. Disabled actions do not activate. Pending actions retain dimensions. Focus uses the standard ring, including on the remove button.

Removal must not navigate or toggle the parent. After removal, focus moves to the next remove control, previous control, or filter input. Long identifiers truncate within available width and expose their full value on keyboard focus as well as hover.

Multi-selects preserve searchable options, multiple controlled values, clear, selected-item removal, and accessible empty results. Preserve compact single-line summaries in the input, with all selections available in the dropdown. Active-filter ribbons can wrap. An interactive `+N` summary must be a keyboard-accessible button.

Use the [Coss Combobox](https://coss.com/ui/docs/components/combobox) multiple-selection composition. Inspect its actual exported names, controlled-value and removal APIs; generic shadcn export names are not a contract. Keep custom logic limited to Binsight options, summaries, and filter callbacks. Do not build a Popover/Command multi-select engine or fall back to a different library. A genuine blocking gap needs a reproduction before proposing an alternative.

### Segmented controls and navigation

Capsules are reserved for segmented tracks: neutral track, 1px border, 2px inset, at least 28px outer height, raised neutral selected segment. Use Coss's [Segmented Control](https://coss.com/ui/docs/components/segmented-control) Radio Group particle for exclusive settings and modes, and Coss Tabs for content. The stock segmented library exports shared recipes in `lib/segmented-control.ts`; it is not a standalone behavior primitive. Reuse that recipe instead of inventing one. The small Radio Group particle is `@coss/p-radio-group-7`; verify generated paths before adoption. Stock rounded rectangles are accepted until the shape pass, which applies the final capsule exception.

Main navigation and inspector tabs use a blue underline, not pills. Active file rail is blue. Brand mark uses solid blue; text-sized blue wordmarks use brand-foreground for readability. Keep selection geometry stable.

### Standard controls and feedback

Use Coss Button, Input, Label/Field, Number Field, Checkbox, Switch, Radio Group, Select, Menu, Popover, Tooltip, Dialog/Sheet, Alert and Toast as applicable. Native elements remain appropriate for simple structure. Do not add every registry component preemptively.

Primary controls use primary/primary-foreground and the explicit primary-hover token, not a stock opacity utility. Buttons and inputs use 8px radius. Input errors have an associated message and visible invalid state. Preserve form values and retry actions after failures.

| Control state | Treatment |
|---|---|
| Default primary | Primary fill, primary foreground |
| Hover/pressed primary | Primary-hover fill; no size, opacity, or text-color change |
| Default secondary | Surface-1 fill, foreground text, essential boundary where needed |
| Hover/pressed secondary | Surface-2 fill, unchanged readable text |
| Selected toggle/option | Selection wash, brand foreground, explicit checked/selected state |
| Focus-visible | Ring and offset independent of hover/selection |
| Disabled | Muted-foreground ink, neutral fill, no activation or hover; no opacity reduction on the whole subtree |
| Loading | Existing label and dimensions retained, busy state announced, duplicate activation prevented |
| Invalid field | Data-delete border and associated error message; retain entered value |

The final capsule Coss Radio Group segment is the explicit neutral-selection exception: surface-2 and foreground, with a raised shape. Main and inspector tabs use underline selection. These variants do not inherit the blue filled-option treatment.

Use Coss ToastProvider and toastManager for ordinary notifications; do not add an anchored provider without an anchored-toast use case or create a custom notification service. Preserve Number Field empty/null editing state and current numeric payload validation.

Reuse the existing Tabler icon family through `components/icons.ts`. Icon-only actions have accessible names. Save/restart notifications are blue operational feedback; failures are rose/red.

### Data views

- Events: 32px virtual rows, blue selected wash, amber position-wrap rail. Selection must not hide warning/error rails. Preserve grouping, filtering, jump-to-position, keyboard selection, and live controls.
- Overview: compact metric cards, 12px radius, top highlight, tabular values and explicit units.
- Charts: retain Recharts directly. Do not add a second component source just for a chart wrapper or rewrite datasets. Shared tokens must update SVG fills/strokes when the scheme changes; expose meaningful data in labels/tables as well.
- Anomalies: rose triage rail, severity label, blue jump action. Tables: consistent insert/update/delete badges.
- Settings: preserve the current settings overlay and sections, using shared controls and unframed form groups. Genuinely framed groups may use a panel; no card nesting.
- Inspector: preserve Details, Diff, Hex, Raw JSON, lazy requests, retry behavior, selection across tabs, copyable data, and resize limits. Agreement is neutral; actual additions/removals are semantic.
- Loading reserves geometry. Empty/error states describe the actual condition and offer applicable actions without tutorial/marketing copy. Do not present a disconnected stream as ready.

Transitions are 120-150ms for color/opacity, with reduced-motion support. No moving data rows, bouncing counters, or entry choreography. Preserve bounded rendering; a high ingestion rate does not mean rendering every event or announcing every SSE message.

## Do's and Don'ts

### Mandatory skills and execution discipline

Read `AGENTS.md`, this document, and applicable skills before design, planning, or UI work. Discover repository skills first, then configured agent skill roots. Required reads: `impeccable`, `design-taste-frontend`, `design-system`, and `ui-styling`. Report loaded paths and relevant applications; explicitly report missing skills.

Use Impeccable's Operate guidance. The installed design-taste-frontend skill excludes dashboards and data tables: apply its brief-reading, incumbent-audit, and anti-template principles, not landing-page density or motion defaults. Skills refine this contract; they cannot replace the approved stack or tokens.

No reusable inline appearance styles, JS hover styling, arbitrary per-view colors/radii, or broad library overrides. Runtime geometry such as virtual offsets is the inline-style exception. Keep a short evidence-backed list of retained custom CSS, not a target CSS line count.

AntiGravity must use a file-specific TDD roadmap and report failing/baseline and passing evidence at each step. Stock-first does not permit deleting tests, weakening behavior assertions, replacing real data with fixtures in the app, or removing an inconvenient workflow.

### Acceptance

- Assert both schemes, token namespace migration, semantic mapping, neutral agreement, green quarantine, and role-specific pill shapes.
- Test keyboard operation, chip removal/focus, search/clear, long identifiers, disabled/loading/error states, navigation, and inspector workflows.
- Inspect rendered geometry and actual composited contrast: 4.5:1 normal text and 3:1 essential non-text. Unit tests alone cannot establish visual conformance.
- For implementation run `rtk bun run test` from `web/`; `rtk go test ./...` and `rtk make build` from the repo root. Record actual counts; 158+ web and 335+ Go are historical baselines, not fixed totals.
- Verify the built app with Playwright at `http://127.0.0.1:8080` in both themes and at desktop/mobile widths. Check existing processes before starting another. All shell commands use `rtk` and tool working-directory parameters.
- Documentation-only work requires punctuation, whitespace, stale-reference, consistency, and scope checks, not runtime test or screenshot claims.

Known migration corrections: old bright hover, conflicting token roles, green adapter agreement/live pulse/CREATE, solid-blue UPDATE badges, radius overrides, and negative tracking. These are drift to correct, not alternate approved styles.
