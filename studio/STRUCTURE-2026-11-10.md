# Structure update 2026-11-10 — visual style × story format

Owner decision 2026-11-10. Extends [STRUCTURE.md](STRUCTURE.md) (which is otherwise still valid).

`styles/<name>/` used to mix two things: how a clip **looks** and how its **story is told**
(e.g. `styles/thai-survival` = flat vector kit + survival script rules). They are now two independent axes:

| axis | question | folder | file |
|---|---|---|---|
| visual style | how does it look? kit, renderer, palette, characters, light, camera | [`visual/<key>/`](visual/README.md) | `VISUAL.md`, `visual.json` |
| story format | how is the story told? formula, beats, length, tone, fact vs fiction, caption content, voice | [`formats/<key>/`](formats/README.md) | `FORMAT.md` |

Keys are exactly those in `~/Studio/taxonomy.json`. Upstream kit authors (genhaha, growkaz,
freshstack, …) are credits in provenance/`made_with`, never style or format names.

**A new clip = pick one visual style + one story format.** Any pair is allowed (e.g. `ghost-story` in
`soft-2d`, `money-tip` in `low-poly`). Read the VISUAL.md for the look and the FORMAT.md for the script.

`styles/` stays where it is: it still holds the kits, examples and provenance, and existing projects,
`scripts/library.mjs` and tests keep reading it. `visual/*/visual.json` only points at it.
Nothing under `outputs/` was changed.

## Pairs that exist today (taxonomy `map_from_series`)

| legacy series | visual style | story format |
|---|---|---|
| thai-survival | flat-room | know-to-survive |
| genhaha-horror-story | night-vector | ghost-story |
| genhaha-map-story | satellite-map | map-fact |
| jk-soft-story | soft-2d | life-story |
| jk-soft-story-motion-v2 | soft-2d | life-story |
| low-poly-urban | low-poly | behind-the-city |
| mall-infection | low-poly | outbreak-drama |
| satire-stories | low-poly | satire |
| freshstack-what-if | stick-svg | what-if |
| what-if-studio | stick-svg | what-if |
| growkaz-stickman | stickman-canvas | money-tip |
| zombie-condo | sitcom-toon | zombie-sitcom |
| deep-sea-docs | deep-sea | deep-dive-doc |
| tech-podcast | footage-reframe | tool-from-podcast |
| celebrity-shorts | footage-reframe | celebrity-quote |
| us-antarctica | footage-reframe | mystery |

## Rules that moved with the split
- flat-room: the orange cat **Khanun is an upstream kit character and must not be used any more**.
- Voice (every format): local VoxCPM2 JK narrator `approved-calm-male-v1` by default; ElevenLabs Thai only with
  the owner's own voice `jk` and explicit spend approval. Footage formats keep the original speaker audio.
- Caption *look* stays in `shared/captions/STYLE.md`; caption *content* rules are in each FORMAT.md.
