# Visual styles — how the clip looks

Owner decision 2026-11-10: a clip is **one visual style + one story format**. This folder is the *look* axis:
palette, characters/rigs, lighting, camera, renderer. Story rules live in [`../formats/`](../formats/README.md).
Keys come from `~/Studio/taxonomy.json` (`visual_styles`).

Each `visual/<key>/` holds only `VISUAL.md` + `visual.json`. **The kits are not moved or copied**: they stay
under `styles/` so existing projects, `scripts/library.mjs`, the gallery and tests keep working. Upstream kit
authors appear only in the credit/provenance column, never as a style name.

| visual style | ไทย | English | kit path (in repo) | renderer | status | licence / provenance (credit) |
|---|---|---|---|---|---|---|
| [flat-room](flat-room/VISUAL.md) | ห้องเวกเตอร์แสงอุ่น | Warm Room | `media/archive/reference-kits/thai-survival/` | Python SVG + GSAP / HyperFrames | draft | no top-level licence, private study; upstream thai-survival-clip kit — `PROVENANCE.json`. **Khanun cat banned.** |
| [night-vector](night-vector/VISUAL.md) | เวกเตอร์มืด หมอก แสงไฟดวงเดียว | Night Vector | `styles/genhaha-horror-story/` (wrapper; kit external) | HyperFrames | draft | Genhaha kit, personal/team use, not redistributed |
| [satellite-map](satellite-map/VISUAL.md) | แผนที่ดาวเทียม 3D | Satellite Map | `styles/genhaha-map-story/` (wrapper; kit external) | Three.js / HyperFrames | draft | Genhaha kit; EOX Sentinel-2 CC BY 4.0; geoBoundaries / Natural Earth |
| [soft-2d](soft-2d/VISUAL.md) | 2D นุ่ม ตัวละครหัวกลม | Soft 2D | `styles/jk-soft-story/`, `styles/jk-soft-story-motion-v2/` | HyperFrames | selected (still v2) / draft (motion) | own art |
| [low-poly](low-poly/VISUAL.md) | 3D โลว์โพลี | Low Poly 3D | `styles/low-poly-urban/` | Three.js / HyperFrames | selected v0.3 | own procedural build |
| [stick-svg](stick-svg/VISUAL.md) | ตัวละครเส้น SVG | Stick SVG | `styles/freshstack-what-if/` | React SVG / Remotion | draft | MIT, FreshStack what-if-animation @8092fb5e — `PROVENANCE.json` |
| [stickman-canvas](stickman-canvas/VISUAL.md) | สติกแมน Canvas | Stickman Canvas | `media/archive/reference-kits/growkaz-stickman/` | Canvas 2D + Chromium + FFmpeg | draft | no explicit licence, private study; GrowKaz plugin source — `PROVENANCE.json` |


> **2026-11-11 (owner):** `media/archive/reference-kits/growkaz-stickman` and `media/archive/reference-kits/thai-survival` are **reference-only** upstream kits (no licence). `stickman-canvas` and `flat-room` are our own looks that were informed by them; build them with our own code and cast. Never ship or package those two kits.

## Visual styles in the taxonomy without a kit in this repo
| visual style | where the kit is | renderer |
|---|---|---|
| sitcom-toon | `~/Studio/clips/*zombie-condo*/source/*/engine/toon.js` (lemo-opuscar toon.js, MIT) | Sitcom Toon | Playwright/Chromium + FFmpeg |
| deep-sea | private repo `JK369x/jk-animation-studio` `styles/deep-sea-docs/` (kubcode members-only kit 0.1; not in this public repo) | Deep Sea Doc | HyperFrames |
| footage-reframe | no kit (real footage reframed 9:16 + Thai captions) | Real Footage | HyperFrames |

These have no `visual/<key>/` folder yet because there is no kit in this repo to point at.

## Shared across all looks
Caption look (font, size, outline, highlight colours): `shared/captions/STYLE.md` — independent of the visual
style. Voice: `shared/voice/` — independent of both axes.
