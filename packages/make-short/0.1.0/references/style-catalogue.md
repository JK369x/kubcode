# Style catalogue

Every style draws the same hero and the same kind of scene state, so one story can switch styles (the engine's ring seam), and one style can tell any story. Each style is a **kit** (look code in `engine/styles/NN-id.js`) plus one **scene file** per story (`scenes/<story>/<id>.js`) that draws the story with that kit. The kits never time anything; `core/scene.js` does.

## Pick a style
| style | looks like | suits | render |
|---|---|---|---|
| **flat** | warm flat cartoon, pastel fills, boiling ink line, paper grain | everyday science, feelings, "why X" for anyone | 2D, fast |
| **blueprint** | white linework on cyanotype paper, dimension lines, callouts | mechanisms, inventions, "how X works", measurements | 2D, fast |
| **pixel** | chunky 16-bit pixel art, dithering, pixel font | game-like tries, retro, counting lives | 2D, fast |
| **ascii** | amber CRT terminal, characters as pixels, typed lines | computers, code, "the machine says no" | 2D, fast |
| **woodcut** | carved print, black key line, off-register colour | history, folk tales, weather, nature | 2D, medium |
| **watercolor** | wet washes, blooms, cotton paper | quiet or sad beats, nature, gentle stories | 2D, slower |
| **glass** | stained glass, lead lines, backlight glow | light and colour, big dramatic moments | 2D, medium |
| **voxel** | 3D toy blocks and clay, soft shadows | building, stacking, physical cause and effect | 3D (GPU) |
| **lidar** | dense 3D point cloud, teal-to-yellow scan | sensing, mapping, the dark, space | 3D (GPU) |
| **teardown** | grey 3D studio, exploded parts with numbered labels | "what is inside X", parts and mechanisms | 3D (GPU) |

Rules of thumb:
- 2D styles are the safest first run.
- A 3D style needs a GPU (`doctor.mjs` says so) and new props in three.js.
- One style per Short is plenty. A switch between worlds is a story beat, never decoration.

## Cards
The kit functions below are copied from the engine code at sync time. Check `engine/styles/NN-id.js` (the header comment and `export const kit`) when in doubt; `scenes/door/<id>.js` is a full working scene for every style.

Every scene file has the same shape: `export default { async init(api, kit) {...}, render(out, s, kit) {...} }`. `s.sc` is scene(f), `s.p` is the hero's pose, and `s.f` is the frame. The 3D kits (voxel, lidar, teardown) build their objects in `init` and update them in `render`.

### flat (`styles/05-flat.js`): the safest first run
- **Looks like:** a warm flat cartoon. Pastel fills, a tapered ink line drawn as two offset passes, line boil on twos, a violet rim shade, paper grain and a vignette.
- **Suits:** everyday science, feelings, kitchen-table explainers.
- **Kit:**
  - `C` (palette: wall dot wain floor wood woodD cream leaf pot heart ...) and `INK`;
  - `setBoil(f)`: call first, every frame;
  - `shape(g, fill, pathFn, w = 8, shade = false)`: any filled, inked shape (`pathFn = g => { g.beginPath(); ... }`; `rrect(x, y, w, h, r)` makes a rounded-rect pathFn);
  - `line(g, pts, w, col)`;
  - `text(g, str, x, y, size, { align, col, stroke })`;
  - `hero(g, p, f, { scale, at, alpha })`;
  - `bonk(g, impact, age)`: star burst, age 0–10;
  - `poof(g, x, y, t)`;
  - `hearts(g, n, fx)`;
  - `hallway(g, o)` and `door(g, rect, state)`: the door world;
  - `finish(g, f)`: grain and vignette, call last.
- **New props:** `shape()` with palette `C` and the same 5–9 px line width. The example draws a kitchen, a table, a glass, water and an ice cube this way (`template/example/scenes/example/flat.js`).
- **Gotchas:**
  - The boil shifts every line a few px on an 8-frame cycle. That is the look; QA ignores it.
  - Draw the hero before anything he reaches into (water, a box), so his hand reads as inside it.

### blueprint (`styles/02-blueprint.js`)
- **Looks like:** white linework on mottled Prussian-blue cyanotype paper, a 72 px grid, hatching, dimension lines with arrowheads and monospace lettering. One non-blue colour: the scarf red.
- **Suits:** mechanisms, inventions, "how X works", measurements.
- **Kit:**
  - `INK` and `RED`;
  - `wall(g)`: paper, grid and a hallway elevation;
  - `line(g, x0, y0, x1, y1, w, alpha)` and `arrow(g, x, y, angle, len, w)`;
  - `partial(...)`, `pencil(...)` and `rectPts(...)`: draw-on helpers (see the header);
  - `hero(g, p, opts)`: line-art hero;
  - `text(g, str, x, y, size)`: JetBrains Mono; size = cap height;
  - `impact(g, x, y, t)`: drafting ticks;
  - `hearts(g, n, lost)`;
  - `door(g, rect, state)`;
  - `vignette(g)` and `sides(g)` (16:9 margin panels);
  - `heartPath`.
- **New props:** stroke-only shapes in `INK` (2–4 px), dashed centre lines, dimension lines with `arrow()`, and hatching inside a clip. Draw on with `partial()` and `pencil()` when a beat reveals a part.
- **Gotchas:**
  - Keep every number you print true; the style invites fake dimensions.
  - Fills are dark paper blue, never white.

### pixel (`styles/01-pixel.js`)
- **Looks like:** chunky 16-bit pixel art: a 320x320 buffer of a 32-colour palette scaled 6x, dithering and a pixel font.
- **Suits:** game-like tries, lives and levels, retro jokes.
- **Kit:**
  - `begin(cam)` first: the kit applies the camera itself, so pixels stay square;
  - `wall()`, `door(rect, state)`, `hero(p)`, `hearts(n, lost)`;
  - `rect(x, y, w, h, colourIndex)` and `X(x)`/`Y(y)`: master px to buffer px;
  - `text(str, x, y, size, colourIndex, alpha)`: pixel font, CAPS and digits;
  - `present(out)` last.
- **New props:** `rect()` in palette indices at buffer resolution (1 buffer px = 6 master px).
- **Gotchas:**
  - No canvas `ctx` in the kit calls; it draws into its own buffer.
  - The pixel font is drawn as rectangles, so QA's text check cannot see it. Check its text by eye.

### ascii (`styles/04-ascii.js`)
- **Looks like:** an amber-phosphor CRT. Real JetBrains Mono glyphs on a character grid, scanlines, bloom and a barrel warp. The scarf glyphs are red.
- **Suits:** computers, code, "the machine says no", terminals.
- **Kit:** `begin()`, `wall()`, `door(rect, state)`, `hero(p)`, `hearts(n, lost)`, `pane(x, y, w, h)` (a terminal window), `text(str, x, y, size, o)`, `impact(x, y, t)`, `present(out, f)`.
- **New props:** luminance shapes on the background grid (see `scenes/door/ascii.js`), or `pane()` plus `text()` for screens.
- **Gotchas:** fine detail disappears into the character cells; keep props big and simple.

### woodcut (`styles/06-woodcut.js`)
- **Looks like:** a carved print. A bold black key line, flat indigo/cream colour printed 3 px off register, gouge marks that follow each form, paper fibres. One red.
- **Suits:** history, folk tales, weather and nature facts.
- **Kit:**
  - `PAL` and `GEO`;
  - `build()` and `cut()`;
  - `gouge(g, x, y, len, w, ang)`, `hatch(g, rect, o)` and `keyPoly(g, pts, lw)`: carved shapes;
  - `hallway(g)`: static, cache it in `init`;
  - `door(g, rect, state, o)`, `hero(g, p, f, o)`, `hearts(g, n, f, impactF)`, `text(g, str, x, y, size, o)`, `bonk(g, impact, age)`;
  - `overlays(g)` last.
- **New props:** `keyPoly()` for the outline, a flat fill offset by 3 px, `gouge()` marks along the form.
- **Gotchas:** busy carving fights a busy story; keep backgrounds calm.

### watercolor (`styles/08-watercolor.js`)
- **Looks like:** washes on cotton paper. A pencil underdrawing, pooled dark edges, blooms and glazes.
- **Suits:** quiet or sad beats, nature, gentle stories.
- **Kit:**
  - `PAL` and `GEO`;
  - `hallway(g)`: paints the static room once; cache it;
  - `door`, `hero(g, p, f, o)`, `hearts(g, n, f, impactF)`, `text(g, str, x, y, size, o)`;
  - `paintWash(...)`, `maskFrom(...)`, `pen(...)` and `penRect(...)`: new painted shapes;
  - `tearDrop(g, x, y, s)` and `run(g, x, y, len, w, col)`;
  - `finish(g, f)` last.
- **New props:** a mask (`maskFrom`) plus `paintWash`, and a pencil line with `pen()`.
- **Gotchas:** the slowest 2D style (about 0.3–0.5 s per frame). Paint static things once in `init`.

### glass (`styles/09-glass.js`)
- **Looks like:** stained glass. Cut glass pieces in thick lead, grisaille faces, backlight bloom, coloured light on stone.
- **Suits:** light and colour, big dramatic moments, "the reveal".
- **Kit:**
  - `pane(g, pts, col, seed)`: one glass piece;
  - `lattice(...)`, `quarryField(g, rect, scheme, seed)`, `plankField(...)`, `stoneTile(...)` and `voronoi(box, seeds)`;
  - `leadPoly(...)`;
  - `door(g, D, state)`, `hero(g, p, o)`, `hearts(...)`, `text(g, str, x, y, size, o)`;
  - `fracture(cx, cy)` and `crack(g, cx, cy, t)`: a breaking window.
- **New props:** cut each prop into a few `pane()` pieces with lead lines.
- **Gotchas:** the hero shares the palette with the window. Keep the panes behind him darker or cooler.

### voxel (`styles/03-voxel.js`, 3D)
- **Looks like:** 3D toy blocks and clay. Rounded bevelled blocks, soft shadows, a warm studio light. Not a game world.
- **Suits:** building, stacking, physical cause and effect.
- **Kit:**
  - `stage(THREE)`: renderer and camera; the wall plane maps 1:1 to master px;
  - `rbox(THREE, w, h, d, r)`: a rounded block;
  - `clay(THREE, color)`: material;
  - `toyBlock(S, size, color, sym)`;
  - `hallway(S, o)` and `door(S, rect)`;
  - `hearts(g, n, fx)`, `text(g, str, x, y, size, o)` (2D overlays) and `vignette(g)`.
- **New props:** `rbox` plus `clay` meshes added to the stage scene in `init`, moved in `render` from `s.sc`.
- **Gotchas:** needs a GPU (doctor says so). Build every mesh once in `init`; never create meshes per frame.

### lidar (`styles/07-lidar.js`, 3D)
- **Looks like:** a dense point cloud on near-black, a teal-to-yellow height ramp, a scan front sweeping the room.
- **Suits:** sensing, mapping, the dark, space.
- **Kit:**
  - `stage(THREE)`;
  - `cloud(S)`: point builder: planes, floors, edges, cylinders, text as points;
  - `heroCloud(S, rig, pose, o)`;
  - `door(S, B, rect)`;
  - `ramp(t, c)`;
  - `hearts`, `text` and `ringEdge`;
  - `post(g, glCanvas, o)`: bloom and vignette, last.
- **New props:** sample the prop's surfaces into a `cloud()` in `init`.
- **Gotchas:** needs a GPU. Points need a dark background and big shapes to read.

### teardown (`styles/10-teardown.js`, 3D)
- **Looks like:** a grey photo studio, shot straight on. Parts separate along depth with numbered leader labels. One accent colour (#ff5a2e) for measured things.
- **Suits:** "what is inside X", parts and mechanisms, the payoff of a how-it-works story.
- **Kit:**
  - `buildStudio(THREE, o)`;
  - `buildStudioRig(THREE, {...})`: the hero in 3D;
  - `door3d(THREE, D, o)`: an example of a part-built object;
  - `leader(g, pts, prog, o)`: a numbered label line, drawn on with `prog`;
  - `text(g, str, x, y, size, o)` and `hearts(...)`;
  - `ACC` and `INK`.
- **New props:** build each part as its own mesh group with an explode offset. Drive the explode from `s.sc` (0..1) and the labels with `leader()`.
- **Gotchas:**
  - Needs a GPU.
  - Label text must stay inside the safe square.
  - Keep the accent colour only for the one measured thing.
