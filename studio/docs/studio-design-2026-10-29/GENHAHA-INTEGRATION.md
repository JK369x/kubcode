# Genhaha style integration

The `genhaha-horror-story` and `genhaha-map-story` catalog entries are draft directions, not approved production styles. Each references its local source kit without redistributing the kit. See each style's `STYLE.md` and the source `LICENSE.md`. The React interface is a mock: its fields are not connected to a renderer, AI, or publishing service.

Create an editable local source project without calling any provider:

```sh
node scripts/genhaha-scaffold.mjs horror my-story
node scripts/genhaha-scaffold.mjs map my-map
```

Files are produced under ignored `outputs/genhaha-projects/`. Both source packs must remain at their documented Downloads paths. The horror source uses editable SVG and shot-based caption timing; preserve fictional disclosure and readable titles. Map uses longitude,latitude, checked location and route sources, Three.js layers, attribution, and explicit distinction between straight-line and road distance. These are reusable working rules documented in the new style directions; JK voice integration is not implemented.

Two silent visual samples in `outputs/genhaha-previews/` were rendered from temporary scaffolded source projects using the repo's installed HyperFrames v0.8.192 at 24 fps / draft quality. Their text is source-template example text, not a finished fact-checked story. The map uses Sentinel-2 cloudless by EOX (CC BY 4.0, https://s2maps.eu; modified Copernicus Sentinel data 2016) and borders from geoBoundaries / Natural Earth, credited onscreen. Source kit projects for these specific previews are temporary under `/tmp/jk-genhaha-previews/`; they are not permanent deliverables.

Rendering command pattern:

```sh
node_modules/.bin/hyperframes render /tmp/jk-genhaha-previews/PROJECT --fps 24 --quality draft --workers 1 -o "$PWD/outputs/genhaha-previews/NAME.mp4"
```

Voice, complete narration, fact checking, real build queue and actual platform publishing remain separate future work. Gallery generation was verified in a temporary copy because the original `gallery/index.html` already had user modifications; the original was not overwritten.
