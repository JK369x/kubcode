# Beat director brief (shared by every beat agent)

You direct ONE comedy beat of a 60 s Blender 5.2 EEVEE Short: 2D-looking bean characters in a painted 3D world, Ricks Clips style. An independent critic scored the film 6.0/10. Your beat is one of the reasons: its gag isn't readable on screen. Your job is to make your beat read instantly on a phone and be funny.

## Read first (all under D:\claude\videos\03-claude-animated-shorts\4-short-v3\)
- `LESSONS.md`: 30 lessons, all binding.
- `critic\critique-r3.md` and `critic\cmp3_*.png` (the reference is on top, ours below): what is wrong with your frames.
- `scene.py`: READ ONLY. Learn how a shot works: `camera`, `subj`, `camrel` (camera override relative to the subject), `actions`, `props`, `fx`, `mood`, `transition_in`. Also learn the auto-framing in `frame_cam`, and see how props are keyed (`P`, `HOME`).
- `shots.json`: READ ONLY. Find the shots that overlap your frame range.
- `lib\chars.py`: READ ONLY. Use `react`, `squash`, `lean`, `talk`, `pose`, `face`, `hold`, `place`.
- `acting.json`: READ ONLY. See the existing beats in your range.
- The story is `..\4-short-v2\story.md`. The word timings are in `..\4-short-v2\voice\voice-final-timing.json` (frame = round(sec*30)).
- The reference is `..\1-planning\research\reference-video\ricks-7xS87iActkU\ref.mp4`. Pull frames of its gags: how wide, how long the holds last, where the camera sits.

## You may write ONLY
`beats\<your-name>.json` and files under `beats\<your-name>\` (tests). Never edit scene.py, shots.json, acting.json or lib\*. Other agents work in parallel on other frame ranges.

Format of `beats\<your-name>.json`:
```json
{"range":[F0,F1],
 "shots":[ full shot objects copied from shots.json, same "id", same "f_in"/"f_out", edited ],
 "acting":[ acting beats for frames inside F0..F1 (they replace ALL acting.json beats in that range) ]}
```
- Keep each shot's `id`, `f_in` and `f_out` unchanged: the timeline and the voice are locked.
- You may change camera, subj, camrel, actions, props, fx and transition_in.
- Copy over the existing acting.json beats in your range that you still want, because the whole range gets replaced.

## The bar for your beat
- **The gag object and the action are visible and big enough at the SFX frame** (a phone-size read). Use a medium shot for the action and a close-up for the reaction.
- **Anticipation before the action** (wind-up with stretch), **squash on impact**, then a **reaction hold of 12–24 frames** on the face, with the camera still. Comedy lives in the hold.
- **The face is always visible:** eye-level or slightly low camera, on the face side. Never above the hat, never a back view.
- **No blur on the impact frame,** and no puff covering the face or the object at the impact.
- Characters are full-body or medium, never tiny: face height at least 10% of the frame (15% or more in a medium).

## How to test
- Render your range: `& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P scene.py -- frames <OUTDIR> F0 F1 12`. Run it from the 4-short-v3 folder, with OUTDIR under beats\<your-name>\.
- scene.py picks up every `beats\*.json`, so your file is live as soon as you save it. If another agent's file has an error, scene.py asserts. Then just tell me; don't edit theirs.
- Make a contact strip at 6 fps of your range (ffmpeg tile) at `beats\<your-name>\strip.png`, and LOOK at it. Iterate at least twice. Ask yourself: would this make someone laugh on a phone? Does it match the reference's clarity?
- Each render loads the scene in about 40 s, then about 1 s per frame. Keep test ranges short.

## Report
In under 200 words:
- what the beat now shows, frame by frame;
- the exact IMPACT frame for the SFX;
- the path to the strip;
- anything you couldn't do.
