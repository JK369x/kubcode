---
name: "kubcode"
description: "Living library: kinetic work stage, full-cover media cards, neutral unavailable downloads, purple dark/light navigation."
colors:
  dark-bg: "#100e15"
  dark-surface: "#1b1722"
  dark-surface-soft: "#231d2d"
  dark-ink: "#f5f1fb"
  dark-muted: "#b8adca"
  dark-line: "#38303f"
  primary: "#bb98ff"
  dark-field: "#6c38b6"
  on-field: "#fff"
  dark-selected: "#d1b9ff"
  dark-selected-ink: "#291640"
  dark-media: "#0a090e"
  light-bg: "#faf8fd"
  light-surface: "#ffffff"
  light-surface-soft: "#efe9f8"
  light-ink: "#271c34"
  light-muted: "#6c5f7d"
  light-line: "#e0d9e9"
  light-purple: "#7136b9"
  light-field: "#7136b9"
  light-selected: "#e9dbff"
  light-selected-ink: "#3b1d60"
  light-media: "#18131f"
  hero-dark: "#2c1549"
  hero-dark-ink: "#f5f1fb"
  hero-dark-muted: "#d6c6e9"
  hero-light: "#ebe0fa"
  hero-light-ink: "#2a1241"
  hero-light-muted: "#59416c"
  card-media-bg: "#0c0b10"
  card-media-ink: "#ffffff"
  media-action-bg: "#242327"
  media-action-ink: "#d7d3dd"
  media-action-state: "#bdb5c8"
  media-action-light-bg: "#ecebf0"
  media-action-light-ink: "#5c5566"
typography:
  body:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  hero-display:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "80px"
    fontWeight: 600
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  brand:
    fontFamily: "Archivo, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
  feature-title:
    fontFamily: "Archivo, Anuphan, sans-serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  card-title:
    fontFamily: "Archivo, Anuphan, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  tool-label:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "12px"
    lineHeight: 1.35
  variant-label:
    fontFamily: "Archivo, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
  action:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.7
  reading-headline:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "48px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  reading-body:
    fontFamily: "Anuphan, sans-serif"
    fontSize: "17px"
    lineHeight: 2
rounded:
  surface: "22px"
  hero-stage: "24px"
  media-action: "12px"
  compact-surface: "19px"
  compact-stage: "14px"
  control: "12px"
  pill: "999px"
spacing:
  gap-xs: "6px"
  gap-sm: "8px"
  gap-md: "12px"
  inset-sm: "18px"
  inset-md: "20px"
  gap-lg: "24px"
  section-sm: "30px"
  section-md: "32px"
  detail-gap: "55px"
  page-inset: "4.5%"
  mobile-inset: "5%"
components:
  button-primary:
    backgroundColor: "{colors.dark-selected}"
    textColor: "{colors.dark-selected-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "12px 18px"
    width: "100%"
  button-primary-light:
    backgroundColor: "{colors.light-selected}"
    textColor: "{colors.light-selected-ink}"
    rounded: "{rounded.control}"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.dark-selected-ink}"
  button-primary-hover-light:
    backgroundColor: "{colors.light-purple}"
    textColor: "{colors.on-field}"
  button-feature:
    backgroundColor: "{colors.dark-selected}"
    textColor: "{colors.dark-selected-ink}"
    rounded: "{rounded.pill}"
    padding: "10px 16px 10px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.control}"
    padding: "12px"
  card-download-unavailable:
    backgroundColor: "{colors.media-action-bg}"
    textColor: "{colors.media-action-ink}"
    rounded: "{rounded.media-action}"
    padding: "5px 10px"
    width: "100%"
  card-download-unavailable-light:
    backgroundColor: "{colors.media-action-light-bg}"
    textColor: "{colors.media-action-light-ink}"
    rounded: "{rounded.media-action}"
    padding: "5px 10px"
  search:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.pill}"
    padding: "11px 17px"
    width: "300px"
  header-navigation:
    textColor: "{colors.dark-ink}"
    height: "82px"
    padding: "0 4.5%"
  category:
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  category-selected:
    backgroundColor: "{colors.dark-selected}"
    textColor: "{colors.dark-selected-ink}"
    rounded: "{rounded.pill}"
  tool-chip:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.tool-label}"
    rounded: "{rounded.pill}"
    padding: "4px 11px 4px 6px"
  media-card:
    backgroundColor: "{colors.card-media-bg}"
    textColor: "{colors.card-media-ink}"
    rounded: "{rounded.surface}"
  variant:
    textColor: "{colors.dark-ink}"
    typography: "{typography.variant-label}"
    rounded: "{rounded.pill}"
    padding: "6px 14px 6px 10px"
    height: "44px"
  variant-selected:
    backgroundColor: "{colors.dark-surface-soft}"
    textColor: "{colors.dark-ink}"
  style-register:
    textColor: "{colors.dark-muted}"
---


## Overview

Implementation rules (shadcn/Tailwind mapping, minimum text size, touch targets, focus, contrast pairs) live in [design-system/kubcode/MASTER.md](design-system/kubcode/MASTER.md).

**Creative North Star: Living library / kinetic work stage.** Real work leads; browsing and operational states stay precise. Purple/black dark and purple/white light themes persist across catalog, detail, article and account routes. Actual authors, tools, source credits and stable slugs are not renamed with public display names.

This is a local preview, not a production membership, generation or download service. Ignored private media is not part of source-only CI or cleared for redistribution. Technical checks and reviewer verdicts do not establish user creative acceptance. Earlier rejected showcases/specimens are archived evidence, not designs to restore.

Current sources are `Library`, `KineticHero`/module, `MediaSkillCard`/module, shared `CardDownloadAction`/module, `DownloadAction`, `Preview`, `app/globals.css`, `lib/catalog.ts`, `lib/media-covers.ts` and shared `lib/status-labels.ts`. Canonical brand-mark attribution is `public/tool-icons/PROVENANCE.json`. No provider credential belongs here.

## Colors

Page surfaces use the declared dark/light ink, muted, line and selected pairs. Purple marks choices and navigation, not every vendor identity. The homepage hero sits on the page background with the global ink/muted/line pairs; there is no enclosing purple hero panel (owner, 2026-11-04). The `hero-*` colour tokens above are retired.

Media cards remain dark objects (`#0c0b10`, white text) in both page themes. Their bottom scrim is solely for legibility. Real tool marks retain original colors on small neutral discs; legitimately monochrome marks are theme-safe.

Unavailable download is one shared primitive on catalog and detail. On dark media objects it uses `#242327` background, `#d7d3dd` label, `#bdb5c8` sublabel/lock, solid border. On light detail pages it recedes into `#ecebf0` with `#5c5566` text, `#655a71` state and `#d5cfdd` border; media-card objects stay dark in both themes. No cream, purple or dashed panel. The working conditions link is a separate sibling. Native no-media wells use `#f0e9f8` / `#c6b8d9` text even on a light page.

## Typography

Self-hosted Anuphan is Thai-first body/display; Archivo remains in existing compact labels. Reading body is at least15px with open line height. Smaller action/status metadata is not a prose scale.

Machine-readable heading sizes above represent CSS upper bounds because the Google Dimension schema rejects `clamp()`. Shipping CSS is unchanged: hero `clamp(42px, 6vw, 80px)`, headline `clamp(27px, 2.35vw, 34px)`, selected-work title `clamp(24px, 2.1vw, 30px)`, reading heading `clamp(32px, 4vw, 48px)`. Exact expressions are also source metadata in the sidecar.

Visible statuses are Thai: ฉบับทดลอง, เลือกแนวภาพแล้ว, เวิร์กโฟลว์ร่วม. Technical names and data enums remain genuine. Public catalog names and original source/model credits remain distinct.

## Layout

Pages share centered1440px content and responsive insets/header. Home has a heading/action band above one full-width authored work collage, not text-left/product-right or a sparse portrait/facts slab. Mobile has steady readable type and a touch-scroll artwork rail with no document overflow.

No work is initially preselected. The selected native preview is closed until explicit selection, and closing restores focus. The catalog follows without a solitary auto-open Stickman player. A work appearing in both the collage and its catalog entry is not a second automatic player.

Catalog cards prefer9:16, cap at780px (`min(780px,88svh)` on phones), and allow content growth rather than clipping. Real cover media fills the whole card. A compact title and44px action pair overlay the bottom; longer descriptions/credits stay accessible and available on detail routes, not as a tall visible facts body. Preview button and navigation/actions are siblings, never nested interactive controls.

Covers may crop; native playback preserves the complete frame. Two local covers are genuine source-video frames at4s, with numbered intro plates cropped away; original media and detail attribution remain intact. Source narrative subtitles remain artwork, not invented UI. Soft Story uses25% horizontal focal positioning to retain the character. Native landscape/square height derives from intrinsic media size, not a tall black well. No-media workflows show actual requirements, never unrelated art.

## Elevation & Depth

Hero work is a style shelf: one 9:16 card per style (`lib/showcase-allowlist.ts` `style` + `cover`), titled by the style with its clip count below the media, never over it. Catalog scrims protect text; tiny top badge backdrops are bounded. No GPU shader is mounted.

The style shelf runs edge to edge and slides slowly in a seamless loop (owner, 2026-11-04); hover, focus and the "หยุดเลื่อน" toggle pause it, and reduced motion shows a static scrollable row. A muted preview plays only while a card is hovered or focused (never on touch, reduced motion or Save-Data). No JavaScript frame loop drives ambient animation. Native scrolling and video controls remain intact.

## Shapes

Catalog and hero media22px, shared unavailable/conditions controls12px. Controls have at least44px targets. Pills identify navigation, categories and genuine author switches; do not make every content group a nested card.

## Components

### Hero, search and selection

`KineticHero` + `VisualShelf` display only genuine known-size artwork; a clip in a new visual style adds a card. Homepage filters: use case, แนวภาพ (visual style) and แนวเรื่อง (story format), combined with AND (lib/facets.ts). Search intersects real metadata/category and has a truthful empty state. Selection opens the real `Preview`; pause, reduced-motion, offscreen and document visibility are distinct states. No playback or download success is synthesized.

### Cards and native preview

`MediaSkillCard` uses actual cover posters; first-row images load eagerly. An image-sized rectangle is not proof of painted media: after the final scroll, require image decoding and nonzero natural dimensions before capture. Native media is tested through actual muted play, seeking and pause; a still-only example is not counted as a video. Initial and after-play captures are explicitly different states.

### Shared unavailable download

`CardDownloadAction` is truly disabled and explicitly says ยังไม่เปิดดาวน์โหลด. `DownloadAction` reuses it, retaining focusable `#download` and a real membership-information link. Neither unavailable state nor the conditions link establishes approved membership, a source kit or ZIP. Backend downloads fail closed; these controls trigger no paid provider generation.

### Shared identity and evidence

Catalog, detail, articles and account retain navigation, persistent themes, Anuphan and focus treatment. Pinned licensed geometry stays in `public/tool-icons/`; unbranded functional fallbacks are not official logos. Source-only Node22 CI, strict local/private-media checks, rendered-route checks, native playback evidence and creative judgment are distinct gates. Superseded card/download specimens are retired rather than claimed current.

## Do's and Don'ts

- **Do** let genuine work dominate; inspect actual desktop/tablet/mobile pixels in both themes and verify decoding before review.
- **Do** preserve source credits, stable routes, original playback framing, keyboard focus and reduced-motion behavior.
- **Do** distinguish technical checks, actual playback, independent review and user approval.
- **Don't** restore the solitary auto-open player, purple matte thumbnails, tall facts bodies, purple dashed controls or generic purple vendor marks.
- **Don't** copy competitor artwork, prices, counts or claims; borrow layout principles only.
- **Don't** fabricate media, login, approval, downloads, provider verification, distribution rights or hosted-CI success.
