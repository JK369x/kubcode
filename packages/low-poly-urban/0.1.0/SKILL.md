---
name: low-poly-urban
description: Make a vertical 9:16 low-poly 3D city clip (Three.js geometry in code, one seekable timeline, Thai+English keyword captions). Use when the user asks for a low-poly / faceted 3D urban short, a "Low-poly Urban" clip, or wants to remix the bundled 8-second city example.
---

# Low-poly Urban

Grounded, faceted 3D city storytelling rendered from real geometry written in code. No image or video
generation and no paid API are needed.

## Look
- Muted taupe, concrete grey, olive and charcoal; restrained cool reflections and warm window lights.
- One low directional key, soft cool fill, atmospheric depth. The example uses ACES exposure 0.88,
  hemisphere 1.05, key 1.75, fill 0.32. These are scene settings, not a universal grade: relight per shot.
- Adult proportions. Keep readable midtones and material planes; never crush daylight into flat black
  silhouettes. Avoid pastel skies, evenly lit faces and saturated toy cars.
- Exact values: `references/style.json`.

## Motion
- Three.js renders the geometry; GSAP drives ONE paused, seekable timeline (`window.__timelines.main`).
- Build geometry once. Every pose and camera state is derived from time, so any frame renders the same.
- The example: a character turns once, a car rises, the camera pushes in (8 s, 1080×1920, 30 fps).

## Captions (default)
Thai first, short phrases, one highlighted keyword; a smaller uppercase English line under it.
Values: `references/thai-en-keyword-highlight.json` and `references/captions.json`. Amber = key info,
coral = threat/forbidden, cyan = clue/alternative. Restrained 140 ms entrance, 180 ms keyword settle.
Place captions around faces/props instead of reserving a blank band. Align to the actual narration.

## Workflow
1. Copy `example/city` to a new project folder and keep its structure (`index.html`, `scene.js`, `assets/`).
2. Write the beats (hook → 2–4 scenes → payoff) and the Thai caption lines first.
3. Edit `scene.js`: add/replace geometry, keep everything time-driven; edit caption clips in `index.html`
   (`data-start`, `data-duration`).
4. Preview: `npx hyperframes preview <folder>`. Check a few frames for lighting and caption collisions.
5. Render: `npx hyperframes render <folder> --output /absolute/path/clip.mp4`.
6. Optional narration: the companion `thai-narrator` skill; then align caption timings to its
   `audio_meta.json` durations.

## Honesty
This is a procedural interpretation of a low-poly look, not a recreation of any specific film or creator.
Do not claim otherwise in captions or descriptions.
