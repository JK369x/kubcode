# satellite-map — แผนที่ดาวเทียม 3D (Satellite Map)

**แผนที่ดาวเทียม 3D · English: Satellite Map** (key `satellite-map`)

Look only. First paired with `formats/map-fact`.
Kit: `styles/genhaha-map-story/` is a **wrapper only**. Original kit outside the repo
(`~/Downloads/genhaha-map-story`); per project copies in
`outputs/shorts-2026-11-01/genhaha-map-story/*/` (`map-kit.mjs`, `layers.json`, `look.css`, `motion.js`).
Starter: `node scripts/genhaha-scaffold.mjs map <slug>`. Status: **draft**.

## Look
- Vertical 9:16 satellite imagery (Sentinel-2 cloudless) on a Three.js plane; country fill draws on, mask dims
  everything outside the subject.
- Pins with names, routes drawn as lines, rulers with measured distance, chips with numbers, big slam titles.
- Palette (`look.css`): ink `#0e0d0b`, paper `#f4efe6`, gold accent `#ffcf3f`, olive `#a9b86e`, red `#ff6b5e`,
  moon blue `#9fc3ff`; Kanit font.

## Camera
Fly-to moves between zoom levels (wide ≈ z2 → detail ≈ z5), slow push-ins on holds, return wide for the payoff.

## Renderer
Three.js map kit inside HyperFrames.

## Provenance
Upstream kit by Genhaha (credit only), personal/team use, not redistributed. Imagery: EOX Sentinel-2
cloudless (CC BY 4.0, attribution required). Borders: geoBoundaries / Natural Earth.
