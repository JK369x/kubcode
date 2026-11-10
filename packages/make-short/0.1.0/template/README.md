# How a Short is laid out

`new-short.mjs` copies the engine and the example story into a project folder **P**. You rewrite two story files and nothing else:

```
P\
  timeline.json              story name (= the slug), frames, which style when     (new-short writes it)
  core\scene.js              THE STORY: every beat, the hero's acting, all world state    <- you write
  core\kit-defaults.js       stage constants some kits import (do not edit)
  scenes\<slug>\<style>.js   draws scene(f) in one style, with that style's kit           <- you write
  story.md                   the beat sheet (gate 1)
  short.json  receipt.json   for the scripts (do not edit)
  review\  out\  stills\     sheets and QA, videos, single frames
  engine files               index.html render.mjs chrome.mjs core\*.js styles\ transitions\ three\ fonts\   (never edit)
  scenes\door\<style>.js     a full working scene for every style: read it to learn a kit
```

## core/scene.js: one file times everything
It is a plain ES module with no DOM. The engine, the storyboard and QA all read it. It **must** export these names; the example has all of them:

| export | read by | what |
|---|---|---|
| `FLOOR` | pose.js, hero2d, kits | floor line y (1350); the hero's soles stand on it |
| `export * from './kit-defaults.js'` | some kits | DOOR, HEARTS, HOME...: keep the line even if the story has no door |
| `beats(tl)` | pose.js, QA | `{ N, <beat>: frame, ..., hits: [impact frames], pops: [planned sudden changes] }` |
| `acting(B, S)` | pose.js | `{ body, face, props }`, see below |
| `scene(f, tl)` | compose -> `s.sc` | all world state at frame f, plain numbers/strings, **including `cam: {x, y, zoom}`** |
| `punch(f, tl)` | compose | camera kick `{zoom, dx, dy}` on impacts (copy the example's) |
| `keyframes(tl)` | sheet.mjs storyboard | `[{ f, label }]`, 6–10 panels that tell the story |

```js
// acting: key poses, faces and props. bake() eases between keys; the hero is drawn on twos.
body:  [[frame, 'POSE', { x, g: 'ground', turn: 1, scale: 1 }, 'io'], ...]   // g 'ground' = feet on FLOOR; 'free' + y = in the air
face:  [[frame, 'expression', [lookX, lookY]], ...]                         // look +x = forward, [-.5, 0] = at the camera
props: [[frame, 'near-hand prop', 'far-hand prop'], ...]                     // the rig draws '' pencil mallet chisel; draw other props yourself
```
- **Poses** (`POSES` in core/pose.js): STAND SIT STARE WIND RUN1 RUN2 JUMP SPLAT RECOIL SITBUMP DAZE HANDS DRAW_HI DRAW_LO DRAW_MID SMUG WALK1 WALK2 PICK PLACE PLACE_HI CLIMB TOP BONKED READ OFFENDED FISTS HEADBUTT STAGGER CROUCH DIVE POP TOOLS STRIKE UNEASY STUB SAD SLUMP SIT_SAD SOB RAGE CHARGE_A CHARGE_B LIE FLINCH REALIZE FACEPALM SHEEPISH GRIP PULL OPEN_JOY TRIUMPH, and more.
  - A missing pose? Add it inside `acting()`. Start from a near one and change channels in radians (arm 0 = down, + = forward): `POSES.HOLD_UP ||= { ...POSES.PLACE, armR: 1.75, elbowR: .25 }`.
- **Expressions** (`EX`): det effort ouch stun daze curious idea focus smug hope proud panic read offended angry surprise frustr shock uhoh uneasy pain sad cry rage yell wonder realize palm sheepish joy triumph.
- **Props in hand.** Draw them at `heroPoints(pose(f, tl)).hand.R` (the near mitten). `heroPoints` also gives head, top, front (the face), eyes, mouth, feet and knot.
- **Impacts** sit on odd frames, listed in `hits`. The hero shows the hit exactly and holds it 3 frames.
- **A good loop** settles into frame 0's pose 10–15 frames before the end.

## scenes/<slug>/<style>.js: draws, never times
```js
export default {
  async init(api, kit) {},                    // build or cache things once (3D styles build their scene objects here)
  render(out, s, kit) {                       // s = { f, u, fl, dur, p (hero pose at f), tl, sc (= scene(f)), cam }
    const g = out.getContext('2d'), sc = s.sc;
    // 1 world: kit background or your own props drawn with the kit's shapes and palette
    // 2 hero: kit.hero(...)   3 props in hand / flying   4 text: kit.text(...)   5 the kit's finish/grain
  },
};
```
Each kit's functions are listed in the skill's `references/style-catalogue.md`.

## Rules the engine relies on
- **The frame.** The master is 1920x1920, and the safe square is x/y 420–1500.
  - The 9:16 Short shows x 420–1500 at full height; the 16:9 shows y 420–1500 at full width.
  - The camera (`scene().cam`) puts world point (x, y) at the centre, zoomed. Place text so it lands inside the safe square **after** the camera.
- **The hero.** About 554 px tall at scale 1, with the pelvis at (x, y). Standing, the pelvis is at y 1192 and the face is about 130 px in front of x. He faces right when turn > 0.
- **Deterministic.** Any frame must render alone, in any order:
  - no `Math.random()` (use `rng(seed)` or `noise()` from `core/util.js`);
  - no `Date`;
  - no state carried from the previous frame.
- **Timing lives only in scene.js.**
- **Text.** At most 3 words per line, at least 54 px cap height, drawn with `kit.text` (QA can see it).

## Look while you build
In P:
- `node render.mjs --stills f0,f120 --clean` saves `stills\f0.png` (the 16:9 crop next to the 9:16 crop). `--debug` instead of `--clean` draws the safe square and the Shorts button zones.
- `node render.mjs --from 0 --to 60` renders `out\part-0-60-*.mp4` for a short motion check.

## The example
`example\` is a complete 9-second Short in the flat style, "Why ice floats". It has:
- `story.md`, `timeline.json`, `core\`, `scenes\example\flat.js`;
- its videos, sheets, QA report and receipt.

The videos in `example\out\` are 5 MB preview copies. A real render is about 50 MB per 9 s, at the engine's CRF 18 with paper grain.

Copy its patterns, never its story.
