# stickman-canvas — สติกแมน Canvas (Stickman Canvas)

**สติกแมน Canvas · English: Stickman Canvas** (key `stickman-canvas`)

Look only. First paired with `formats/money-tip`.
Kit: `media/archive/reference-kits/growkaz-stickman/` (`kit/` engine, `kit/references/style-bible.md`, sources `source/claude`,
`source/codex`). Status: **draft**.

## Look
- Pure black stick figures (circle head, thick round-capped limbs), thin rim-light edge on the lit side; far
  limbs in dark purple-grey.
- One signature colour per recurring character, identical every shot (e.g. yellow cap `#f2c21a`).
- Low-key cinematic flat-shaded 2.5D sets: 60–75% dark mid-tones, 1–3 bright accents; large windows are the
  signature element; dust/rain/stars for atmosphere. Blueprint/void sets for diagrams; big text cards.
- Expressions change on the beat of the words; `bigFace` close-ups for emotion.

## Lighting / camera
One key light per shot, shown and spilled (glow, pool, cone, god rays). Camera never fully static: slow push
1.0→1.05–1.10, lateral drift, pull-out for reveals, shake for impacts. Median shot 2–3.5 s.

## Renderer
Canvas 2D (+ Three.js) rendered frame by frame in headless Chromium (Playwright) → FFmpeg.

## Provenance
Upstream GrowKaz Stickman Studio plugin source (credit only). No explicit licence found; private study only,
resolve rights before publication. See `media/archive/reference-kits/growkaz-stickman/PROVENANCE.json`.
