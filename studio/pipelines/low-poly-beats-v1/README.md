# Low-poly mall beat plans v1

This is the actual plan-driven low-poly mall episode path. It is separate from `shot-plan-v1`, whose JK Window renderer remains limited to its original demo. Current adapter: `mall-v1`, six existing sets (stairs, landing/control room, corridor, phone, close-up, shoe insert). It is reusable for different episodes/short fixtures in these sets, not an arbitrary scene generator.

## Use

Write a UTF-8 plan conforming to `schema.json` and the stricter cross-field checks in `core.mjs`. Put owned narration/bed/custom SFX in the plan directory's `assets/`. The pipeline does no synthesis, transcription, downloads, posting or paid calls.

```
node pipelines/low-poly-beats-v1/cli.mjs check /absolute/path/episode-plan.json
node pipelines/low-poly-beats-v1/cli.mjs build /absolute/path/episode-plan.json /absolute/path/new-film-directory
hyperframes check /absolute/path/new-film-directory --json
hyperframes snapshot /absolute/path/new-film-directory --at 1,5,10 --describe false
hyperframes render /absolute/path/new-film-directory --quality delivery -o /absolute/path/new-output.mp4
```

Build refuses an existing output directory. Use a new version/slug, including when correcting an earlier build. Preserve the old MP4/source. Media paths are confined to the plan directory, checked for symlink escape and probed for actual audio duration. Generated output records the source-plan SHA256 in BUILD.json. Fonts, rig and geometry are local; no third-party reference screenshots enter the film.

## Plan → actual behavior

- `anchors`: named measured speech/event times. All time fields accept an anchor name or seconds. One anchor can drive the camera cut, reveal channel, subtitle and SFX.
- `beats`: contiguous full-duration set/camera/purpose records. Camera endpoints are world-space vectors, with hold/linear/smooth movement. The renderer does not select behavior by beat name.
- `channels`: only names exported in `core.mjs` defaults. Ordered keyframes control hero step/walk, hidden hand, infected visibility/head/reach/turn/descent, torch/fill, pipe/drips, PA, seated-figure reveal, hero reaction, lower threat and route labels. Values are sampled by shared `stateAt()` in the actual renderer and in tests.
- `captions`: short Thai/English editorial phrases, one exact in-text highlight, start/end/keywordAt references, accent and safe y. No length-weighted timing. Preserve the approved Thai65px/English30px identity unless explicitly changed. Use scene-aware placement, a dark outline/backing and no reserved subtitle band. Inspect real phone-size/encoded frames: numeric bounds alone do not prove readability.
- `audio` and `sounds`: explicit files/levels/durations and times/anchors. Sound follows visible causes; do not add sound to every cut.
- `holds`: document purposeful quiet intervals; also dip the supplied bed there and measure the rendered mix. Metadata alone does not create silence.

The episode adapter binds sampled channel values to geometry. It has no per-shot-name switch, no fetch/random clock, and no hardcoded episode speech times. Caption HTML/audio tags are generated from the same normalized plan. This is the integration missing in EP2's earlier standalone compose.py path.

### Progressive Thai subtitles

For the user's clarified mall-episode treatment, set `captionTreatment: "original-thai-pop"`. Retain the original Chakra Petch 65px, 1.28 line height, palette, 5px outline and y1165; Thai has no background panel. Secondary English keeps the original smaller treatment. Existing plans without this option retain their historical phrase treatment.

Each caption then requires `reveal: [{text, at}, ...]`. Obtain coherent units with `thaiUnits()` in `subtitles.mjs`; never split Thai combining marks or leave a preposed vowel alone. Map actual spoken words/syllables and reviewed ASR token starts, interpolating only inside those spans where needed. Explicitly label edited semantic wording and approximate interpolation. The schema rejects missing, split, reordered or out-of-cue units. Allow a reading hold after the final reveal.

The real `captionMarkup()` path calls `popMarkup()`: all units reserve their full layout from the start; opacity/y/scale animate independently with a restrained 160ms pop. Previously revealed text stays still. English remains readable as a smaller stable line. `captionUnitState()` exposes the same reveal times for tests/QA. Validate multi-frame sequences and the final encoded film, not just a completed static line. These changes do not alter the scene sampler, camera or audio.

## Timing and review

Use actual narration boundaries and reviewed ASR/word anchors, not Thai character counts. ASR token timestamps are evidence to review, not guaranteed forced alignment. Verify phrase starts, reveal/light events, camera cuts and subtitle ends in the exported file; check the opening, each set change, and ending. Keep the vote undecided. Run fresh ASR/full decode/loudness on the final render and distinguish machine measurements from human listening.

## Tests and fixtures

`npm test` includes `tests/low-poly-beats-v1.test.mjs`. The real full EP2 plan is mirrored in `fixtures/ep02-full.json` as timing/story data only (its audio is intentionally not bundled); the independent `rail-test.json` is silent. Both use the same normalizer/sampler. Tests move the hand anchor and confirm camera beat, reveal and subtitle move together, change camera coordinates, reject unsafe/invalid inputs, and verify generated runtime wiring/overwrite protection. Render and inspect the tiny fixture too; unit tests alone do not establish visual behavior.

Limits: existing mall geometry and simple rigs; no IK, generated environments, arbitrary new action code, automatic script writing or guaranteed alignment. Extend and test the adapter for a genuinely new set/action before promising it. The social scheduler is unrelated and unchanged.
