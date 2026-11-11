# Design System Master File — kubcode

> **LOGIC:** When building a specific page, first check `design-system/kubcode/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** kubcode (kubcode.dev)
**Written:** 2026-11-11, by hand in the `ui-ux-pro-max` Master format. The skill's `--persist` flow writes its own generated palette (Inter, a red CTA), not ours, so it was not used.
**Category:** Thai-first content library: AI-video skills, articles, tool pages, community, member account.
**Sources of truth, in order:**
1. [DESIGN.md](../../DESIGN.md) + [tokens.json](../../tokens.json): brand.
2. This file: how the brand maps onto shadcn/ui + Tailwind v4, plus the rules from [the 2026-11-11 audit](../../docs/design/uiux-audit-2026-11-11.md).
3. The current CSS (`app/globals.css`, CSS modules): shipping behaviour until migrated.

**Target stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS-first `@theme`), shadcn/ui (Radix), lucide-react, `next/font/local`. Themes: `data-theme="dark"` (default) / `"light"` on `<html>`, persisted in `localStorage['jk-theme']`. **Keep that attribute.** Map the shadcn `dark:` variant to it, do not switch to `class="dark"`.

---

## Global Rules

### Color Palette: shadcn variables ← brand tokens

The values are our tokens; do not substitute the shadcn defaults. Ratios are WCAG, computed from the hex values. Text pairs need ≥ 4.5:1, UI edges and focus need ≥ 3:1.

| shadcn variable | Role | Dark (default) | Light | Contrast notes |
|---|---|---|---|---|
| `--background` | page | `#100e15` (dark-bg) | `#faf8fd` (light-bg) | |
| `--foreground` | body text | `#f5f1fb` (dark-ink) | `#271c34` (light-ink) | 17.2 / 15.3 on background |
| `--card` | surfaces, panels | `#1b1722` (dark-surface) | `#ffffff` (light-surface) | |
| `--card-foreground` | | `#f5f1fb` | `#271c34` | 15.8 / 16.1 |
| `--popover` / `--popover-foreground` | menus, sheets | same as card | same as card | |
| `--primary` | selected chip, primary CTA fill | `#d1b9ff` (dark-selected) | `#7136b9` (light-field) | |
| `--primary-foreground` | text on primary | `#291640` (dark-selected-ink) | `#ffffff` (on-field) | 9.4 / 7.2 |
| `--secondary` | soft selected, pills | `#231d2d` (dark-surface-soft) | `#e9dbff` (light-selected) | |
| `--secondary-foreground` | | `#f5f1fb` | `#3b1d60` (light-selected-ink) | 14.6 / 10.5 |
| `--muted` | wells, skeleton base | `#231d2d` | `#efe9f8` (light-surface-soft) | |
| `--muted-foreground` | meta text | `#b8adca` (dark-muted) | `#6c5f7d` (light-muted) | 9.0 on bg, 7.7 on muted · 5.6 on bg, 4.95 on muted |
| `--accent` | hover row, ghost hover | `#231d2d` | `#efe9f8` | |
| `--accent-foreground` | | `#f5f1fb` | `#271c34` | |
| `--link` *(ours)* | inline links, breadcrumbs, badges | `#bb98ff` (primary) | `#7136b9` (light-purple) | 8.3 / 6.8 on bg |
| `--destructive` | delete, errors | `#ffb4b4` (text) | `#a3262a` | 11.4 / 6.9 on bg; fill buttons use light `#a3262a` + white (7.3) |
| `--border` | **decorative** dividers only | `#38303f` (dark-line) | `#e0d9e9` (light-line) | 1.5 / 1.3, so never the only edge of a control |
| `--input` | **form-control outline**, meaningful card edges | `#807394` | `#857896` | 4.0 on card, 3.7 on muted · 4.1 on card, 3.45 on muted (≥ 3:1) |
| `--ring` | focus outline | `#bb98ff` | `#7136b9` | 8.3 / 6.8 on bg |
| `--media` *(ours)* | media wells | `#0a090e` | `#18131f` | |
| `--card-media` *(ours)* | catalog / hero media cards (dark in **both** themes) | `#0c0b10`, text `#ffffff` | same | 19.6 |
| `--media-action` *(ours)* | unavailable download on media | bg `#242327`, label `#d7d3dd`, state `#bdb5c8` | detail page: bg `#ecebf0`, label `#5c5566`, state `#655a71`, border `#d5cfdd` | 10.6 / 7.9 · 6.0 / 5.4 |
| `--chart-*` | not used | | | |

**Color notes:** Purple marks choice and navigation, not every vendor identity. Real tool logos keep their own colors on small neutral discs. There is no purple panel behind the hero; the `hero-*` tokens are retired. No cream, purple or dashed panels for unavailable states.

### Typography

- **Body / headings (Thai-first):** Anuphan 400/500/600, `next/font/local` from `@fontsource/anuphan` files (thai + latin subsets, `display: swap`). Preload Thai 400 and 500. Use `adjustFontFallback: false` for the Thai face (Arial has no Thai glyphs).
- **Brand and compact Latin labels:** Archivo 500/600 (`@fontsource/archivo`, latin). Preload 600 (wordmark).
- **Code:** `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` (`--mono`).
- **Never:** Inter, or any face without Thai glyphs, for body text.
- **Tailwind `@theme`:** `--font-sans: Anuphan, sans-serif; --font-heading: Anuphan, sans-serif; --font-brand: Archivo, Anuphan, sans-serif; --font-mono: var(--mono)`.

**Type scale (px).** Text below 12px is not allowed. The only exception is a decorative English sub-label under a Thai label (e.g. the facet `chip-en`), at ≥ 10px, because the Thai label carries the meaning.

| Role | Size | Weight | Line-height | Tracking | Notes |
|---|---|---|---|---|---|
| hero-display | `clamp(42px, 6vw, 80px)` | 600 | 1.16 | -0.03em | home only |
| reading-headline (h1) | `clamp(32px, 4vw, 48px)` | 500 | 1.3 | -0.025em | articles, tools, index pages |
| headline (h2) | `clamp(27px, 2.35vw, 34px)` | 500 | 1.3 | -0.025em | |
| feature-title | `clamp(24px, 2.1vw, 30px)` | 500 | 1.15 | -0.035em | Archivo + Anuphan |
| card-title | 17–20px | 500–600 | 1.4–1.45 | -0.02em | |
| reading-body | 17px × `--prose-scale` (A−/A+) | 400 | **2.0** | 0 | Thai with tone marks needs the room |
| body | 15px (16px for inputs on mobile) | 400 | **1.7** | 0 | |
| meta / Thai label | **13px minimum** | 400–500 | 1.5–1.6 | 0 | breadcrumbs, timestamps, counts |
| compact Latin label | 12px minimum | 500 | 1.35–1.5 | 0 | tool chip, variant label |
| brand | 29px | 600 | 1 | -0.04em | Archivo |

Thai rules:
- No negative tracking on Thai body text.
- Line-height at least 1.5 for any multi-line Thai, at least 1.7 for body.
- Never set `line-height: 1` on Thai text that can wrap; tone marks clip.

### Spacing Variables

4px base; the tokens.json names are kept.

| Token | Value | Tailwind |
|---|---|---|
| `gap-xs` | 6px | `gap-1.5` |
| `gap-sm` | 8px | `gap-2` (also the minimum gap between touch targets) |
| `gap-md` | 12px | `gap-3` |
| `inset-sm` / `inset-md` | 18 / 20px | `p-[18px]` / `p-5` |
| `gap-lg` | 24px | `gap-6` |
| `section-sm` / `section-md` | 30 / 32px | `py-8` |
| `detail-gap` | 55px | `gap-[55px]` |
| page inset | `4.5%` desktop, `5%` (≈ 20px) mobile | |
| containers | 1440 (site), 1380 (detail), 1200 (index / reading with rail), 1120 (reading), 960 (community) | `max-w-[…]` |

### Radius

Set `--radius: 12px` (control), so shadcn's `rounded-md` / `rounded-lg` stay on brand.

| Token | Value | Use |
|---|---|---|
| control | 12px | buttons, inputs, unavailable / conditions actions |
| compact-stage | 14px | menus, sheets |
| article cover | 16px | article / index cards |
| compact-surface | 19px | |
| surface | 22px | catalog and media cards, reading hero, panels |
| hero-stage | 24px | |
| pill | 999px | navigation, category chips, author switches, badges |

### Shadow Depths

Flat by default; edges come from `--input` / `--border`. Only three shadows exist:

| Level | Value | Use |
|---|---|---|
| floating | `0 8px 24px rgb(0 0 0 / .25)` | mobile comments bar |
| popover | `0 12px 32px rgb(0 0 0 / .25)` | account menu, dropdowns |
| badge | `0 2px 8px rgb(0 0 0 / .35)` | small badges over media |

### Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | enters, card → page morph |
| fast | 160–200ms | hover, press, menu open |
| base | 220–260ms | image fade-in, composer open |
| page | 700ms | view-transition morph (title / logo) |
| shimmer | 1.4s ease-in-out infinite | skeleton |

Rules:
- Animate `transform` / `opacity` only.
- Exits are shorter than enters.
- The global `@media (prefers-reduced-motion: reduce)` rule that sets `animation: none !important; transition: none !important` and `scroll-behavior: auto` **stays**. Tailwind `motion-reduce:` variants are extra, not a replacement.
- The home style shelf pauses on hover, focus and its "หยุดเลื่อน" button, and is static under reduced motion.
- Previews play only on hover/focus, never on touch, reduced motion or Save-Data.

---

## Component Specs (shadcn mapping)

### Buttons (`Button`)

| Variant | Spec |
|---|---|
| `default` (primary) | `bg-primary text-primary-foreground`, radius 12, padding 12×18, 15px/500, **h-11 (44px) on mobile**. Hover: dark `#bb98ff`, light `#7136b9` + white. One primary CTA per view. |
| feature pill | radius 999, h-11, padding `10px 16px 10px 20px`, trailing lucide icon 16px. |
| `secondary` / `outline` | transparent, `border-input`, `text-foreground`, radius 12. |
| `ghost` | header nav, rail actions; hover `bg-accent`. |
| `destructive` | light: `#a3262a` fill + white; dark: `#ffb4b4` text on transparent with `border-input`. Confirm before delete (the current pattern asks twice: "ลบ" → "ยืนยันลบ"). |
| `size="icon"` | at least 44×44 on mobile and 40×40 on desktop, `aria-label` required, lucide `size={18}` + `aria-hidden`. |
| disabled | `disabled` attribute, opacity 0.6, `cursor-not-allowed`. The unavailable download is a **real** disabled button that names its state ("ยังไม่เปิดดาวน์โหลด"). |

### Chips / Badges (`Badge`, `ToggleGroup`)

- **Category / facet chip:** pill, 13px Thai, `aria-pressed` or `aria-current="page"` (when it is a link). Selected uses `bg-primary text-primary-foreground`. Height 44 on mobile, 40 on desktop; 8px gap; wrap, never shrink the label.
- **Tag / tool chip:** pill, 12–13px, at least 32px visible height with a ≥ 44px hit area via `::before` on mobile; logo disc 20px.
- **Status badge** (channels `.ok` / `.warn`): pale fill + dark text, the same in both themes (6.4:1); always carries a word, never color alone.

### Cards (`Card`)

- **Media card** (catalog / shelf):
  - 9:16, cap `min(780px, 88svh)` on phones; `--card-media` in both themes.
  - Bottom scrim for legibility only. Title plus a 44px action pair overlaid.
  - Preview button and links are siblings, never nested.
- **Article card:** 16:9 cover, radius 16, link covers the card, `outline: 2px solid var(--ring)` on `:has(:focus-visible)`.
- **Panel:** `bg-card`, `border-input` when the edge carries meaning (tool card, skill panel), `border-border` when decorative; radius 22, padding 20.

### Inputs (`Input`, `Textarea`, `Select`, `RadioGroup`, `Checkbox`)

- **Box:** `border-input bg-card` (or `bg-muted` inside panels), radius 12, **16px text on mobile** (no iOS zoom), height ≥ 44.
- **Focus:** `ring-ring` 3px with 4px offset.
- **Labels:** a visible `<Label>` for every field; hints are linked with `aria-describedby`.
- **Errors:** shown **under the field**, `aria-invalid="true"`, linked with `aria-describedby`. On submit, focus the first invalid field. Panel-level status stays `role="status"` (polite).
- **Radio / checkbox:** the item hit area is ≥ 24×24 (the label row counts).

### Modals / Sheets (`Dialog`, `Sheet`, `DropdownMenu`)

- Mobile comments use a bottom `Sheet`: traps focus, Esc and browser Back close it, focus returns to the FAB.
- The account menu is a `DropdownMenu`: opens on click/Enter, Tab enters, Esc returns focus, outside click closes.
- Overlay scrim must leave the foreground ≥ 4.5:1.

### Loading (`Skeleton`)

- **Route level:** `loading.tsx` per segment, reusing the page's outer box (same max-width, padding, media aspect-ratio) so nothing shifts. One `role=status` with a Thai label, `aria-busy` on `main`. Current implementation: `components/RouteSkeleton.tsx`.
- **No `loading.tsx` above a page that decides its own status:** under `/account/*` it turned 404 and redirects into soft 200s. Gate in `proxy.ts` / layout first.
- **Images:** `SkeletonImage` (next/image + shimmer, see `docs/images.md`). Client lists use skeleton rows.

### Navigation

- **Header:** brand, theme toggle (accessible name includes the visible "Light"/"Dark"), คลังทักษะ, บทความ, เครื่องมือ, ชุมชน, account.
- **Current section:** `aria-current="page"` plus a visible indicator.
- **Skip link** "ข้ามไปเนื้อหา" is the first focusable element.
- Every screen is a URL: filters are links, Back is predictable, view transitions are disabled under reduced motion.

---

## Accessibility & Touch Rules (from the 2026-11-11 audit, non-negotiable)

1. **Contrast:** text ≥ 4.5:1 and UI edges / focus ≥ 3:1, checked in **both** themes from the tokens above. `--border` is never the only edge of an interactive control.
2. **Text size:** nothing below 12px; Thai meta ≥ 13px; inputs 16px on mobile. Exception: decorative English sub-labels under a Thai label, ≥ 10px.
3. **Pointer targets:** every target ≥ 24×24 CSS px (WCAG 2.5.8) with ≥ 8px between targets. **Primary mobile actions ≥ 44px tall**: comment/star FAB, CTAs, filter chips, A−/A+, copy, TOC toggle, card actions, comment actions (ตอบกลับ / แก้ไข / ลบ), theme toggle. To keep a compact look, grow the hit area with padding or a `::before { inset: -10px }` overlay instead of resizing the visual.
4. **Focus:** visible ring on every focusable element (`outline: 3px solid var(--ring); outline-offset: 4px`, or a ring via box-shadow), and never under sticky or fixed UI. Anything fixed to the viewport must reserve space: `scroll-padding-top` for a sticky header, and `scroll-padding-bottom` + body padding for a bottom bar (current: 88 / 80px).
5. **Names:** icon-only controls get `aria-label`; when a control shows text, the accessible name **starts with** that text (WCAG 2.5.3); decorative icons get `aria-hidden`.
6. **Keyboard:** Tab order follows visual order. Only modal sheets trap focus, and they release on Esc and Back.
7. **Motion:** reduced motion disables all animation, transitions, view transitions and autoplay; the shelf has a visible pause control.
8. **Layout:** no horizontal scroll at 375–390px; `min-h-dvh`, not `100vh`; long URLs and IDs use `overflow-wrap: anywhere`.
9. **CLS:** every media box has an `aspect-ratio` before load; skeletons match the final box.

---

## Style Guidelines

**Style:** "Living library / kinetic work stage". Real work leads: full-cover media, quiet chrome, purple only for choice and navigation. Flat surfaces with edges, not shadows. Dark is the default theme; both themes are designed together.

**Page pattern (home):** heading and action band → edge-to-edge style shelf (one 9:16 card per style, slow loop) → filters (use case, แนวภาพ, แนวเรื่อง; AND) → catalog. No preselected work and no auto-open player.

## Anti-Patterns (Do NOT Use)

- ❌ The generic shadcn palette (zinc / slate) or any palette other than the tokens above, such as the skill's suggested pink `#EC4899`.
- ❌ Inter, or any body font without Thai glyphs.
- ❌ `--border` as the outline of an input, select or textarea.
- ❌ Text under 12px (except the decorative sub-label rule).
- ❌ Icon buttons under 24px, or primary mobile actions under 44px.
- ❌ A fixed or sticky element without matching `scroll-padding`.
- ❌ `loading.tsx` above a page that returns 404 or redirects.
- ❌ Purple matte thumbnails, purple / dashed / cream unavailable panels, generic purple vendor marks, a tall facts body on cards.
- ❌ Synthesized success: fake downloads, playback, approval or provider verification.
- ❌ Emoji as icons (use lucide); mixed icon sets.
- ❌ Removing focus outlines without an equal ring.

## Pre-Delivery Checklist

- [ ] Both themes inspected at 390, 768 and 1280 (screenshots looked at, not only taken).
- [ ] Token contrast table still holds for any new pair. New pairs are added to this file.
- [ ] `scripts/uiux/audit.ts` shows 0 overflow, no text < 12px outside the exception, no target < 24px outside the inline / spacing exceptions, 0 axe violations (full tag set incl. `wcag21a`), and no covered focus.
- [ ] Reduced motion checked; keyboard-only pass on the changed page.
- [ ] Lighthouse a11y 100 and CLS < 0.1 on `/` and one article, mobile + desktop.
- [ ] `npm test`, `typecheck`, `build`, `test:reading-browser`, `test:interactions-app` pass.
