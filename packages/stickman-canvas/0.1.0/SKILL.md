---
name: stickman-canvas
description: Make a vertical 9:16 cinematic stick-figure clip drawn entirely in code (Canvas 2D): rim-lit black figures, one strong key light, moody stage sets, giant face close-ups, freeze frames, counters, bar charts, blueprint diagrams and Thai+English keyword captions. Use when the user wants a "stickman" / stick-figure explainer or story clip, or wants to remix the bundled example.
---

# Stickman Canvas

Every frame is a pure function of time, drawn by code, captured in headless Chromium and encoded with FFmpeg.
No image or video generation models, so characters stay consistent and text stays crisp.

## Files
- `engine/core.js` — size (1080×1920), easing/keys, deterministic `hash`/`noise`, moods (`stage`, `night`, `dusk`,
  `blueprint`), the colour grade + grain + vignette (`finish`), camera `layer`/`blurLayer`, `shake`, `glow`.
- `engine/rig.js` — `drawFigure` (poses, outfit, expression, talk, blink, look, rim light, contact shadow, name tag),
  `POSES` (stand, talk, explain, point, pointUp, wave, cheer, think, shrug, handsOnHead, sad, phone, crossArms, ready,
  jump), `posesAt`, `breathe`, `walkPose`, `bigFace`, `talkAmount`.
- `engine/fx.js` — `backdrop`, `stageWall`, `stageFloor`, `beam`, `godRays`, `dust`, `fog`, `rings`, `sparkles`,
  `screen` (typed lines), `fgHead` (soft foreground silhouette).
- `engine/ui.js` — `title`, `bigLine`, `chapter`, `counter`, `bars`, `blueprintGrid`, `bubble`, `caption`, `flash`.
- `example/scene.js` — an 8-shot, 16 s example. Copy it to start a new clip.

## The look (keep these)
1. Pure black figures, round head, thick round-capped limbs; far limbs dark purple-grey.
2. **Rim light on every lit figure** (`rim: { color: M.rim, dir: [dx, dy] }`, dir points toward the light). It is what
   makes black-on-dark readable.
3. **One signature colour per character** (cap, hoodie, headband), identical in every shot.
4. **One key light per shot**, shown and spilled: `beam`, `godRays`, a floor pool. 60–75% of the frame stays dark.
   Stage figures in front of the brightest area.
5. **Camera never static**: push 1.0→1.05–1.10 with `keys`, lateral drift, `shake` on impacts. Use `layer` depths
   (wall 0.5, floor 0.85, characters 1, soft foreground 1.6 with `blurLayer`).
6. **Atmosphere in nearly every shot**: dust, fog, sparkles.
7. Faces act on the beat of the words (`expr`): neutral, smile, happy, surprised, shocked, worried, sad, angry,
   determined, thinking, smirk, confused. Blink every ~3 s. `talk` only for quoted lines.
8. Shot variety: wide → medium two-shot → insert (screen/phone) → data card (counter) → giant face → freeze frame
   (flash + cool tint + rings) → blueprint (bars) → resolution. Median shot 2–3 s.
9. Text: one short line at a time; numbers the narrator says appear on screen. Captions Thai first with one
   highlighted keyword, small uppercase English under, at ~79% of the height.
10. Never `Math.random()`/`Date.now()` in scenes (use `hash`/`noise` and `t`) so every render is identical.

## Workflow
1. Write the beats and the Thai lines first (hook → problem → numbers → turn → explanation → payoff).
2. Copy `example/` to a new folder; define your cast (one signature colour each) and edit the `shots` array:
   each shot has a duration `d` and `draw(g, t, k)` (t = seconds into the shot, k = 0..1).
3. Check a contact sheet before rendering:
   `SHEET_AT=1,3,5,7 node render.mjs <folder> out/sheet.mp4 --sheet` → open the PNGs, fix composition.
4. Render: `node render.mjs <folder> out/clip.mp4` (≈ 20 s of render time per 1 s of video on a laptop).
5. Add narration and music afterwards with FFmpeg (e.g. the `thai-narrator` and `captions-overlay` skills).

## Honesty
The look is inspired by cinematic stick-figure YouTube explainers. This kit is an independent implementation by
kubcode.dev: no third-party kit code, characters or assets are included. Don't present it as anyone else's tool.
