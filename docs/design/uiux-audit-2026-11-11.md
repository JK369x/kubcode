# UI/UX audit — kubcode.dev, 2026-11-11

Audit pass with the `ui-ux-pro-max` skill, used as a checklist only (its priority list, `quick-reference.md`, `pro-rules.md`, and `--domain ux` / `--stack nextjs` searches). We kept none of its generic palette or font advice. The brand is still [DESIGN.md](../../DESIGN.md) + [tokens.json](../../tokens.json), and the rules that came out of this audit are in [design-system/kubcode/MASTER.md](../../design-system/kubcode/MASTER.md).

**Scope change during the pass (owner, same day):** the site is moving to shadcn/ui + Tailwind v4, which rewrites most components. So this PR fixes only Critical and High issues that would otherwise stay live until then: contrast failures, focus problems, keyboard traps, plus the route loading UI. Small-text and touch-target issues inside the old CSS modules are written down here and in MASTER.md as **build requirements** for the migration instead of being patched rule by rule.

## How it was checked

- **Harness:** [scripts/uiux/audit.ts](../../scripts/uiux/audit.ts) runs against the production build with a throwaway local Postgres (`kubcode-pub-test`). It signs in a fixture owner with an Instagram channel (active) and a YouTube channel (needs reconnect) for `/account/*`.
  - Pages: 10 page types × 390 / 768 / 1280 × dark / light = **60 combinations**.
  - Each one gets a full-page screenshot, axe-core 4.x (WCAG 2.0/2.1/2.2 A+AA plus best-practice), a horizontal-overflow check, visible text under 12px, pointer targets under 24px, and a Tab walk that checks for a focus ring and whether the focused element is covered.
- **Screenshots:** the 60 full-page shots are in `.qa/uiux/before/shots/` and `.qa/uiux/after/shots/`. They are local, as `.qa/` is gitignored. The evidence used below is committed in [uiux-2026-11-11/](uiux-2026-11-11/).
- **Contrast:** ratios were computed with the WCAG relative-luminance formula from the token hex values, not sampled from screenshots.
- **Focus re-check:** after the harness run I repeated the focus walk with `scroll-behavior: auto`. Smooth scrolling had produced false "offscreen/covered" readings; only issues that survive the instant-scroll walk are listed.
- **axe tag set:** the harness's first run left out the `wcag21a` tag, which hides `label-content-name-mismatch`. A separate full-tag sweep (8 public pages × 390/1280 × both themes) found the two violations listed below. The harness is fixed.
- **Lighthouse 13.6:** 3 runs per page and form factor, median shown, `next start` on loopback.

## Findings

Severity: **Critical** = blocks a user or fails WCAG AA on a primary path. **High** = fails WCAG AA or the skill's HIGH rules on a secondary path. **Medium** = falls short of the skill's recommendations or our own spec. **Low** = polish.

| # | Severity | Page(s) | Rule | Evidence | Status |
|---|---|---|---|---|---|
| 1 | High | `/tools/*`, `/skills/*`, `/articles/*` at < 1180px | `focus-not-obscured` (WCAG 2.4.11). The floating comments bar (`PageInteractions .mobileBar`, fixed, z 40) partly covered keyboard-focused controls near the viewport bottom and fully covered the last footer link, which cannot scroll higher. | [focus-under-mobile-bar-dark](uiux-2026-11-11/focus-under-mobile-bar-dark-before-after.png), [light](uiux-2026-11-11/focus-under-mobile-bar-light-before-after.png) (left before, right after) | **Fixed**: `scroll-padding-bottom: 88px` on `html` and `padding-bottom: 80px` on `body` while the bar exists (`:has(.mobileBar)`, < 1180px). Instant-scroll focus walk now reports 0 covered elements on all 8 public pages at 390 and 1280. |
| 2 | High | all pages with form controls: home search, comment composer, automations form, keys form, account form, TikTok studio | `color-contrast` for non-text UI (WCAG 1.4.11). Input, select and textarea outlines used `--line`: dark `#38303f` on bg 1.52:1, light `#e0d9e9` on bg 1.30:1. Below 3:1, the field edge is barely visible in either theme. | [search-field-dark](uiux-2026-11-11/search-field-dark-before-after.png), [light](uiux-2026-11-11/search-field-light-before-after.png) (top before, bottom after) | **Fixed**: new token `--field-line`. Dark `#807394`: 4.38 / 4.02 / 3.73:1 on bg / surface / surface-soft. Light `#857896`: 3.89 / 4.10 / 3.45:1. Applied to `.search`, `.account-form input`, and the form controls in AutomationsPanel, KeysSettings, PageInteractions and studio.css. `--line` stays the divider color. |
| 3 | High | every page (header) | `label-content-name-mismatch` (WCAG 2.5.3). The theme toggle shows "Light"/"Dark" but its accessible name was only "เปลี่ยนเป็นธีมสว่าง", so a voice-control user saying "click Light" missed it. | axe, all 60 combinations | **Fixed**: name is now "Light: เปลี่ยนเป็นธีมสว่าง" / "Dark: เปลี่ยนเป็นธีมมืด". Existing tests match the Thai part. |
| 4 | High | `/` (catalog cards) | `label-content-name-mismatch` (WCAG 2.5.3). The card link labelled "เงื่อนไข" has the name "ดูเงื่อนไขการดาวน์โหลด <name>"; axe flags it because the visible word is not at the start. | axe full-tag sweep, 3 nodes per theme and width | **Deferred to the migration** (the card is rewritten there). The visible word is contained in the name, so speech input still works. Proposal: put the visible text first, e.g. "เงื่อนไข: ดาวน์โหลด <name>". Tests in `card-download.test.ts` and `media-skill-card.test.ts` pin the current name. |
| 5 | High | `/articles/*`, `/tools/*`, `/skills/*`, `/articles`, `/community` | Next.js `loading.tsx` (skill nextjs: "Handle loading states"). There was no route-level loading UI. | [loading-skeletons-390-light](uiux-2026-11-11/loading-skeletons-390-light.png), [1280-dark](uiux-2026-11-11/loading-skeletons-1280-dark.png) | **Fixed**: `components/RouteSkeleton.tsx` with four variants (reading, article index, skill detail, community), each reusing the page's own outer box and the shared shimmer from PR #73. One polite `role=status`, `aria-busy` on `main`, still under reduced motion. |
| 6 | Medium | `/account/*` | Loading UI. A `loading.tsx` under `/account` starts the stream before the page decides its status, which turned 404 (feature off / not allowed) into 200 for `/account/channels`, `/account/keys` and `/account/channels/[id]/automations`. This was measured, see `.qa/uiux/status-*.txt`. | `curl` status before/after | **Not added, on purpose.** Status codes are unchanged for all 12 probed routes. Proposal: move the account gate into `proxy.ts`, or into a layout that resolves before the boundary, then add the skeleton. |
| 7 | High (deferred, build requirement) | `/` facet chips, `/` shelf story/model badges, catalog cards, `/tools` step numbers, `/skills/*` rights panel | `readable-font-size` / Thai legibility. 30 CSS rules render text under 12px. Measured live: `.chip-en` 7.9–8.6px; facet buttons and counts 11px (≤560px); `.result-line` 11px; VisualShelf `.story` 11.5px and `.model` 10.5px; CardDownloadAction `.state` 10.5px and `.conditions` 10px; ToolIndex `.step` 11px; skill panel `dt`/`dd`/`summary`/`p` 11px; `.rights-code` 10px; `.tool-chip` 10px; `.card-bottom` 10px. Full rule list in the appendix. | [audit-home-390-light](uiux-2026-11-11/audit-home-390-light.png), [audit-skill-390-dark](uiux-2026-11-11/audit-skill-390-dark.png), [audit-tools-390-dark](uiux-2026-11-11/audit-tools-390-dark.png) | **Deferred (owner).** MASTER.md §Typography: minimum 12px for any text; 13px for Thai meta. The only allowed exception is the decorative English sub-label under a Thai chip (`chip-en`), at ≥ 10px, because the Thai label carries the meaning. |
| 8 | High (deferred, build requirement) | `/articles/*`, `/tools/*`, `/skills/*`, `/`, comments | `web-target-size` (WCAG 2.5.8, 24px) and `touch-target-size` (44px for primary mobile actions). Measured at 390px: A−/A+ 38×32; tag chips 32 tall; rail copy-link 62×29; mobile TOC `summary` 26 tall; card "เงื่อนไข" 40 tall; comment actions (ตอบกลับ/แก้ไข/ลบ) are unpadded 13px text, about 22 tall with a 12px gap; breadcrumb and `a.back` links 17 tall; automations radio inputs 20×20. Footer links are 22 tall but full-width and stacked, which meets 2.5.8 through the spacing exception. Theme toggle, facet chips, shelf pause, avatar and FAB are already 44. | harness `targets` list per page in `results.json`; [audit-account-automations-390-dark](uiux-2026-11-11/audit-account-automations-390-dark.png) | **Deferred (owner).** MASTER.md §Touch: every pointer target at least 24×24 with 8px spacing; primary mobile actions at least 44 tall; use a `::before` hit area or padding when the look must not change. |
| 9 | Medium | all form inputs | `readable-font-size` / iOS zoom. Inputs inherit the 15px body, so iOS Safari zooms in on focus. | computed style | Deferred. Proposal: inputs 16px on mobile (shadcn `Input` uses `text-base md:text-sm`). |
| 10 | Medium | automations, comment composer | `error-placement` / `aria-live-errors`. Fields have visible `<label>`s and hints (`aria-describedby`), but errors appear in one `role=status` line at the top of the panel; fields never get `aria-invalid` and no inline message is linked to the field. | code: `AutomationsPanel.tsx:216`, `PageInteractions.tsx:179` | Deferred. Proposal: shadcn `Form` pattern: error under the field, `aria-invalid` + `aria-describedby`, focus the first invalid field on submit. |
| 11 | Medium | header (all pages) | `nav-state-active`. Header nav links do not set `aria-current="page"` and have no visible current-section style. Category chips and breadcrumbs already do this. | code: `app/layout.tsx` | Deferred. Proposal: client `NavLink` sets `aria-current` from `usePathname()`, with a `--selected` underline. |
| 12 | Medium | dark + light, dividers | `--line` vs bg is 1.52:1 (dark) and 1.30:1 (light). That is fine for decorative dividers, but some cards rely on it as their only edge (tool cards, skill panel). | contrast table below | Deferred. Card edges should use `--border` from MASTER.md (dark `#4a4054` = 2.0:1). Not a WCAG failure: the card text is the content, the edge is not needed to understand it. |
| 13 | Medium | `/` | `content-jumping` / LCP. Mobile home LCP is about 3.5s in Lighthouse (performance 91). LCP breakdown: TTFB 27ms, load delay 41ms, load 67ms, render delay 118ms. The time goes to the throttled simulation of the first shelf poster, not to fonts or layout. | `.qa/uiux/lighthouse/*/home-mobile-*.json` | Deferred. Out of scope for a UI pass. Proposal: a smaller first-poster `sizes`, or one eager poster instead of two. |
| 14 | Low | `/skills/*` | `heading-hierarchy` / `content-priority` at 390: the "ไม่มีสื่อพรีวิว" well takes about 450px before any action. | [audit-skill-390-dark](uiux-2026-11-11/audit-skill-390-dark.png) | Deferred. Proposal: collapse the no-media well to about 200px on mobile. |
| 15 | Low | `/account/channels/*/automations` | `touch-friendly-input`. Native radios are 20×20 inside a label whose row is larger, so the effective target passes. | screenshot above | Deferred: shadcn `RadioGroup` with ≥ 24px items. |
| 16 | Low | all | Animation. A global `prefers-reduced-motion` rule already stops all animation and transition, view transitions, and the shelf marquee; the shelf also has a pause button and stops on hover and focus. KineticHero and AccountMenu modules have no local rule, but the global one covers them. | `app/globals.css` reduced-motion block | Pass. Keep the global rule in the migration (`motion-reduce:` variants are not enough on their own). |

**No finding (pass):**
- Horizontal overflow: 0 of 60 combinations.
- Focus ring present on every Tab stop. The avatar button uses a ring drawn with `box-shadow`, which the harness first misread.
- Skip link "ข้ามไปเนื้อหา" is the first Tab stop.
- No keyboard traps. The mobile comments sheet traps focus on purpose, then releases on Esc and Back (`test:reading-browser`).
- Back and deep links: all key screens have URLs, category chips are links, and back closes the sheet.
- Icon-only buttons have names; decorative lucide icons are `aria-hidden`; images have alt text.
- Lighthouse accessibility 100 on `/` and the article, before and after.

**Counts by severity:** Critical 0 · High 6 (#1, #2, #3, #5 fixed; #4, #7, #8 deferred to the migration on the owner's call; #7 and #8 together are one requirement each) · Medium 6 (#6, #9–#13) · Low 3 (#14–#16, #16 is a pass note). By status: 4 fixed, 1 not added on purpose (#6), 10 deferred with a proposal.

## Contrast (computed from tokens)

| Theme | Pair | FG | BG | Ratio | AA |
|---|---|---|---|---|---|
| dark | ink on bg | `#f5f1fb` | `#100e15` | 17.21 | pass |
| dark | ink on surface | `#f5f1fb` | `#1b1722` | 15.82 | pass |
| dark | muted on bg | `#b8adca` | `#100e15` | 9.01 | pass |
| dark | muted on surface-soft | `#b8adca` | `#231d2d` | 7.68 | pass |
| dark | link (`--purple`) on bg | `#bb98ff` | `#100e15` | 8.26 | pass |
| dark | link on surface | `#bb98ff` | `#1b1722` | 7.59 | pass |
| dark | chip / CTA: selected-ink on selected | `#291640` | `#d1b9ff` | 9.43 | pass |
| dark | on-field on field (avatar) | `#ffffff` | `#6c38b6` | 7.29 | pass |
| dark | focus ring vs bg (3:1) | `#bb98ff` | `#100e15` | 8.26 | pass |
| dark | `chip-en` (ink at 70% opacity) on bg | `#b0adb6` | `#100e15` | 8.67 | pass |
| dark | `chip-en` on selected chip | `#5b4779` | `#d1b9ff` | 4.61 | pass (barely) |
| dark | divider `--line` vs bg (non-text) | `#38303f` | `#100e15` | 1.52 | decorative only |
| dark | **field outline before** (`--line`) | `#38303f` | `#1b1722` | 1.39 | **fail 3:1** |
| dark | **field outline after** (`--field-line`) | `#807394` | `#1b1722` | 4.02 | pass |
| light | ink on bg | `#271c34` | `#faf8fd` | 15.29 | pass |
| light | muted on bg | `#6c5f7d` | `#faf8fd` | 5.58 | pass |
| light | muted on surface-soft | `#6c5f7d` | `#efe9f8` | 4.95 | pass |
| light | link on bg | `#7136b9` | `#faf8fd` | 6.79 | pass |
| light | chip / CTA: selected-ink on selected | `#3b1d60` | `#e9dbff` | 10.48 | pass |
| light | on-field on field (primary button) | `#ffffff` | `#7136b9` | 7.17 | pass |
| light | `chip-en` on selected chip | `#6f5690` | `#e9dbff` | 4.70 | pass |
| light | **field outline before** | `#e0d9e9` | `#faf8fd` | 1.30 | **fail 3:1** |
| light | **field outline after** | `#857896` | `#ffffff` | 4.10 | pass |
| media | card ink on card media | `#ffffff` | `#0c0b10` | 19.61 | pass |
| media | unavailable label / state | `#d7d3dd` / `#bdb5c8` | `#242327` | 10.60 / 7.89 | pass |
| light | unavailable label / state | `#5c5566` / `#655a71` | `#ecebf0` | 6.01 / 5.44 | pass |
| both | channel badges `.ok` / `.warn` (own pale bg) | `#166534` / `#92400e` | `#dcfce7` / `#fef3c7` | 6.49 / 6.37 | pass (same pale chip in both themes) |
| dark | error text | `#ffb4b4` | `#242327` | 9.25 | pass |
| light | error text | `#a3262a` | `#faf8fd` | 6.94 | pass |

## Fonts: next/font/local, evaluated and not adopted (yet)

**Experiment:** I loaded the same @fontsource woff2 files (Anuphan 400/500/600 thai + latin, Archivo 500/600 latin) through `next/font/local`, one call per unicode subset under the existing family names (`declarations: font-family + unicode-range`). It used `display: swap`, generated metric-adjusted fallbacks, and two preload sets: all 8 files, or Thai + Archivo only (5 files). The experiment file is kept locally at `.qa/uiux/fonts.experiment.ts`.

Lighthouse median of 3 runs:

| Page / form factor | Metric | @fontsource (before) | next/font all preload | next/font Thai + Archivo preload |
|---|---|---|---|---|
| `/` mobile | perf · LCP · CLS | 91 · 3522ms · 0.0034 | 91 · 3526ms · 0.0028 | 90 · 3594ms · 0.0028 |
| `/` desktop | perf · LCP · CLS | 100 · 744ms · 0.0012 | 100 · 749ms · 0.0007 | 100 · 769ms · 0.0007 |
| article mobile | perf · LCP · CLS | 100 · 1056ms · 0.0052 | 100 · 1054ms · 0.0015 | 100 · 1055ms · 0.0052 |
| article desktop | perf · LCP · CLS | 100 · 675ms · 0.0010 | 100 · 687ms · 0.0007 | 100 · 705ms · 0.0050 |

**Decision: keep @fontsource in this PR.** The difference is noise: LCP within ±70ms either way, CLS already about 0.005, well under 0.1.

Why it doesn't help here:
- Next already emits the @fontsource CSS in the first stylesheet, so all 8 woff2 files start at 80–190ms with `font-display: swap`.
- `size-adjust` fallbacks are built on local Arial, which has no Thai glyphs, so they cannot steady Thai text, and most of our text is Thai.
- Preloading all subsets competes with the LCP poster on `/`.

**Recommendation for the shadcn migration:** switch to `next/font/local` there anyway. It is the stack-idiomatic way to feed `--font-sans` / `--font-heading` into Tailwind v4's `@theme`, and the experiment shows it costs nothing. Preload only the Thai 400/500 and Archivo 600 files (above the fold), and use `adjustFontFallback: false` for the Thai face, because an Arial-based metric fallback is meaningless for Thai.

## Lighthouse before / after (this PR)

Median of 3, `next start` on loopback, Lighthouse 13.6 default mobile (simulated slow 4G, 4× CPU) and `--preset=desktop`.

| Page | Form factor | Perf | A11y | CLS | LCP |
|---|---|---|---|---|---|
| `/` | mobile | 91 → 91 | 100 → 100 | 0.0034 → 0.0034 | 3522 → 3537ms |
| `/` | desktop | 100 → 100 | 100 → 100 | 0.0012 → 0.0012 | 744 → 754ms |
| `/articles/free-ai-animation-opencode` | mobile | 100 → 100 | 100 → 100 | 0.0052 → 0.0052 | 1056 → 1054ms |
| `/articles/free-ai-animation-opencode` | desktop | 100 → 100 | 100 → 100 | 0.0010 → 0.0010 | 675 → 674ms |

As expected: the fixes are CSS edges, an aria-label, and loading boundaries that only appear during client navigation.

## Appendix: CSS rules below 12px (for the migration)

`app/globals.css`:

| Selector | Size |
|---|---|
| `.feature-tools > span`, `.feature-authors > span` | 11 |
| `.tool-chip` | 10 |
| `.draft-note` | 11 |
| `.artifact-caption` | 10 |
| `.credits` | 11 |
| `.support-caption` | 11 |
| `.media-badge` | 11 |
| `.local-notice` | 11 |
| `.card-bottom` | 10 |
| `.card-bottom a` | 11 |
| `.rights-code` | 10 |
| `.compact-preview .artifact-caption` | 11 |
| `.tool-logo-icon.is-monogram` | 11, decorative monogram, allowed |
| `.categories button .chip-en` | 0.72em, about 8px, decorative English sub-label, allowed at ≥ 10px |

`app/globals.css`, inside `@media (max-width: 560px)`:

| Selector | Size |
|---|---|
| `.browse-link` | 11 |
| `.artifact-caption` | 10 |
| `.support-caption` | 10 |
| `.local-notice` | 10 |
| `.categories button` | 11 |
| `.result-line` | 11 |
| `.tool-chip` | 11 |
| `.card-bottom` | 11 |
| `.register-row` | 11 |

CSS modules:

| File | Selector | Size |
|---|---|---|
| `VisualShelf.module.css` | `.story` | 11.5 |
| `VisualShelf.module.css` | `.more` | 11 |
| `VisualShelf.module.css` | `.model` | 10.5 |
| `CardDownloadAction.module.css` | `.state` | 10.5 |
| `CardDownloadAction.module.css` | `.error` | 11.5 |
| `CardDownloadAction.module.css` | `.conditions` | 10 |
| `ToolIndex.module.css` | `.stage .step` | 11 |
| `ClipResults.module.css` | `.story` | 11.5 |

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
