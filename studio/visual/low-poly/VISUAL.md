# low-poly — 3D โลว์โพลี (Low-poly 3D)

**3D โลว์โพลี · English: Low Poly 3D** (key `low-poly`)

Look only. First paired with `formats/behind-the-city`; also used for `outbreak-drama` and `satire`.
Kit: `styles/low-poly-urban/` (**selected v0.3**; look/motion approved from the 8 s study 2026-10-28).
Full rules: `styles/low-poly-urban/STYLE.md`. Narrated mall build path: `pipelines/low-poly-beats-v1/`.

## Look
- Grounded faceted 3D city, adult proportions; muted taupe, concrete grey, olive, charcoal; restrained cool
  reflections and warm window lights. Keep readable midtones; no flat black daylight silhouettes.
- Avoid bright pastel skies, uniformly lit faces, saturated toy cars and Soft-2D round-head characters.
- Interfaces/overlays must be in-world and share the scene's material/light (the bright popup card was rejected).

## Lighting / camera
One low directional key, soft cool fill, atmospheric depth. Demo: ACES exposure 0.88, hemisphere 1.05,
key 1.75, fill 0.32 (per-scene settings, not a global grade). Camera pushes, top views for routes.

## Renderer
Three.js 0.170.0 geometry + one paused GSAP timeline in HyperFrames; deterministic seeded geometry.

## Provenance
Our own procedural build; reference article (Higgsfield) observed only. No paid generation.
