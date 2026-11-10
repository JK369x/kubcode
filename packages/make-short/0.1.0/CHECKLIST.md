# Static check list: test ONCE after the recording is done (nothing here has been run)

The v3 files were copied and path-fixed by reading and editing only. Run these in order; stop at the first failure.

## A. Smoke test (about 10 min, light)
1. `node --version` (>= 22), `ffmpeg -version`, `python --version`, Blender at the expected path.
2. `Copy-Item -Recurse "$env:USERPROFILE\.claude\skills\make-short\v3" C:\shorts\smoke` ; `cd C:\shorts\smoke`
3. `node --check voice/take.mjs; node --check voice/finish.mjs; node --check voice/sfx.mjs; node --check voice/whisper-to-timing.mjs` : all silent.
4. `node shots/validate.js` : needs a `shots.json`; copy `example-60s/shots.json` to `./shots.json` first. Expect no errors.
5. `bash gate.sh s01 s05` with that example copied in (also copy `example-60s/acting.json`): two stills in `gate/`, `PASS` lines. Confirms: env.sh finds Blender, scene.py finds lib/ and tex/, gate.py runs.
6. Quick-run frames: `bash render.sh 0 12`, then `ls render` shows f0000..f0011.png.

## B. 15 s end-to-end (the live demo)
7. New `story.md` (about 40 words), `voice/voice.mp3` + `voice/voice-timing.json`, `shots.json` ending at f_out 450, `acting.json`, `voice/cues.json`.
8. `bash go.sh t1` : prints `done <s>s, 450 frames`; `out/rounds/t1-silent.mp4` is 15.0 s (ffprobe).
9. `node voice/finish.mjs` : writes `out/short-v3-final.mp4` with audio; ffprobe shows 1080x1920 and audio.

## C. Known risks to verify
- `finish.mjs`: `subtitles=` path on Windows with a drive colon; if ffmpeg errors, run it from the `voice` folder with a relative ass path.
- `go.sh` splits frames into thirds; for N not divisible by 3 check the last frame f0449 exists.
- `gate.py` BAND moods only know day/night/interior; a new mood needs a BAND entry.
- `lib/sets.py` self-regenerates textures with `python` (needs pillow, numpy) only if `tex/` is incomplete.
- `post.mjs` expects the old layout (`out/<slug>-9x16.mp4`, `story.md`); dry run only.
- Story outside the shipped sets/characters needs edits in `lib/sets.py` / `lib/chars.py`; not tested.
- `whisper-to-timing.mjs` assigns lines by word count; a mis-heard word shifts lines.
- The 60 s example's `shots.json` is tied to its story; it is a schema example, not a template.
