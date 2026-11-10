# v3 build contract: four parallel agents, one integrator

Goal: a 60.5 s (1815 f @ 30 fps) 9:16 story Short that matches the reference look. Blender 5.2 headless, EEVEE, GPU, Python modules. CC0 assets only.
The **numbers to hit** (ffmpeg signalstats on the final 1080x1920 frames):
- saturation ≥ 38 (ref 41.9);
- average luma 95–115 (ref 105);
- luma 10–90% spread ≥ 115;
- nothing blown to pure white;
- no key character cut by the frame.

Read the reference notes first: `D:\claude\videos\03-claude-animated-shorts\1-planning\research\reference-video\ricks-7xS87iActkU\BREAKDOWN.md` and its `sheet-1fps-01.jpg` / `sheet-1fps-02.jpg` (the target), plus `ref.mp4` in the same folder (extract any frames you need with ffmpeg).

Inputs (read-only):
- Story, shots, cast: `D:\claude\videos\03-claude-animated-shorts\4-short-v2\story.md`. The narration is final. The new set list is below.
- Voice timings, final: `<project>\voice\voice-final-timing.json` (lines + words, seconds).
- Prior engines to START FROM. They hold the look the user liked: `D:\claude\videos\03-claude-animated-shorts\1-planning\research\engines\bakeoff\G-bean-refined\` and `...\bakeoff\F-bean-in-blender\` (materials, toon ramp, hull ink, grade_all.py, measure). `...\engines\max\G-max\` has a riverside, a bridge and the soldier/chef beans plus a compositor, but its look drifted: use it for parts only. Gotchas are in `...\engines\bakeoff\RECIPE.md`.

Workspace: `D:\claude\videos\03-claude-animated-shorts\4-short-v3\`. **Each agent writes ONLY its own files.**

## Sets (all in one .blend world, spaced apart on X so one scene holds them)
| id | origin | what | used for (narration lines) |
|---|---|---|---|
| `camp` | (0,0,0) | riverside army camp by day: tents, crates, barrels, a tree, river edge, warm key light | 1–11, 19–22 |
| `insert` | (300,0,0) | a tabletop for macro shots: the can, the label card ("Cut round the top with a chisel and hammer"), chisel, hammer, the 1858 sickle-shaped opener | 1, 14–16, 17 clang, 19 |
| `night` | (600,0,0) | the same camp at night: campfire, deep royal-blue/purple sky, god rays, fire glow | 12–16 |
| `tent` | (900,0,0) | the cook tent interior, lantern-warm: table, pot, the can | 17–18 |

## Module API (Python, `import` from 4-short-v3\lib\)
**look.py** (agent LOOK)
- `setup_render(scene)`: EEVEE settings, 720x1280, colour management.
- `toon_mat(name, rgb, tex=None, ink=True)` returns a Material: the painted toon ramp with warm light and cool purple shadows; `tex` is a path to a painted texture.
- `ink_hull(obj, width=0.02)`: inverted-hull outline.
- `apply_mood(scene, mood, f_start, f_end)`, where mood ∈ {'day','night','interior'}: world, sun or lamp, fog, keyed per frame range.
- `setup_compositor(scene)`: depth-based ink, bloom, grade to the target numbers, vignette, grain.
- `fx_puff(at, f)`, `fx_speedlines(at, f, dir)`, `fx_sparkle(at, f)`, `fx_godrays(set_id)`: stylised FX objects keyed in time.

**chars.py** (agent CHARS)
- `make_char(kind, name)` with kind ∈ {'marcel','gaston','soldier'} returns `Char`. The look follows the reference: white bean head, thick black outline, dot eyes, big expressive brows, moustache or mouth, costume read by the hat. Marcel: soldier cap and a blue coat. Gaston: tall chef hat, white jacket, big moustache.
- `Char.root`: the object to place.
- `Char.place(f, loc, rot_z)`: keys the location.
- `Char.pose(f, name)`, name ∈ {idle, walk, point, stab, kick, smash_down, throw, sit, recoil, shock, sigh, chew, bite, peer, eyes_closed, smug, march}.
- `Char.face(f, name)`, name ∈ {neutral, hungry, determined, pain, smug, shock, betrayed, chewing, eyes_shut}.
- `Char.hold(f, prop_obj)`: parents a prop to the hand.
- Poses are on twos, with anticipation and overshoot, and blinks are automatic.
- Also render `chars\model_sheet.png` showing all poses and faces.

**sets.py** (agent SETS)
- `build_sets()` returns a dict `{set_id: {'collection': c, 'anchors': {name: Empty}}}` for the four sets above. Anchors are named spots: `marcel_spot`, `gaston_spot`, `crate`, `tree`, `fire`, `table`, `cam_hint_*`.
- `build_props()` returns a dict of prop objects: can (dented later via shape key `dent`), lid (separate, for the pop), crate, label_card, chisel, hammer, opener_1858, knife (shape key `bend`), boot, rock, pan.
- Painted textures go in `tex\`, generated with numpy or Pillow (wood grain and plank gaps, canvas, stone).
- Uses `look.toon_mat` and `look.ink_hull`. Until look.py exists, put a local stub with the same signatures in your own file.

**shots.json** (agent SHOTS, a data file, no Blender)
- An array of shots `{id, set, f_in, f_out, transition_in: 'travel'|'whip'|'dissolve', camera:[{f, pos:[x,y,z], target:[x,y,z] or anchor, lens, roll_deg}], actions:[{f, char, place|pose|face|hold, args}], props:[{f, prop, action:'appear'|'dent'|'pop'|'bend', args}], fx:[{f, type, at}], mood}`.
- Positions are in set-local metres from the set origin.
- The shot size changes every 2–3 s: extreme wide, then medium, then close-up with faces at 30–40% of the frame, then macro inserts. Use tilts, crane and low angles. Moves are eased over 20+ frames.
- No hard cuts. Use travel, whip or dissolve.
- The word syncs come from the timing json.

**integrator** (later): `scene.py` builds everything from the four modules and shots.json, then runs the stills gate and the render.
