# Opt-in shot-plan pipeline v1

This is a working local vertical slice: a human or agent writes data; Node validates it; one fixed runtime uses the plan to drive camera, caption timing and supported actions in the existing `jk-window` scene. HyperFrames renders it. No LLM is called and no story is automatically reasoned about. The two fixtures are different short narratives over the same existing scene, not proof that it supports arbitrary subjects or production-quality storytelling. The selected original and previous motion pilot remain unchanged.

## Contract

See `schema.json` for the JSON shape and `plan.mjs` for authoritative validation. Cross-field rules beyond JSON Schema: contiguous shots cover the whole duration; each lasts at least 0.8 s; each highlight appears in the Thai caption. Duration is 2–60 s, 1–20 shots. Captions forbid markup/control characters and are inserted as text nodes. Cameras: `wide`, `hero`, `window`. Effects: `none`, `blink`, `latch`, `hand`; only these fixed runtime actions are available. Scene: `jk-window`. No arbitrary code, paths, CSS, commands or effect expressions are accepted.

Optional `audio` is `{ "file": "assets/voice.wav", "start": 0, "volume": 0.8 }`: WAV or MP3 in the plan directory's `assets/`, filename limited to letters/digits/underscore/hyphen, real path confined there, checked by ffprobe; actual audio duration plus start cannot exceed the plan. It is copied to the isolated composition and mixed by HyperFrames. Shot times must be manually provided from reviewed audio cues; this tool does not do speech transcription, timing inference or forced alignment. Without audio the output is explicitly silent. One audio file only. Preserve the selected Thai narrator voice and rights; no provider call or TTS is made by this pipeline.

## Commands

From the repository root:

```sh
node pipelines/shot-plan-v1/cli.mjs check pipelines/shot-plan-v1/fixtures/window-choice.json
node pipelines/shot-plan-v1/cli.mjs build pipelines/shot-plan-v1/fixtures/window-choice.json my-unique-slug
node_modules/.bin/hyperframes render outputs/shot-plan-v1/my-unique-slug --fps 30 --quality draft --workers 1 -o "$PWD/outputs/shot-plan-v1/my-unique-slug.mp4"
```

Choose a new slug; `build` refuses to replace an existing project. Check output destination before rendering: HyperFrames may overwrite an existing video if explicitly pointed there. `window-choice.json` and `radio-warning.json` use the same renderer, shot contract and scene but different text, framing and effect order. Inspect source `runtime.js` to see exact behavior. Templates use the user's existing SVG scene and local GSAP asset; no Genhaha kit is redistributed.

## Verification and limits

Run `npm test` and `npm run check`; review actual frames, text and playback, and use `ffprobe`/full decode. The renderer is a single landscape scene and only four actions: no shot-to-shot location changes, realistic acting, audio generation, transition library, or automatic audio alignment. Supported caption lengths cannot guarantee readability in every language or frame: inspect and refine. No public app generation or scheduler is wired to it; the React site remains a mock. An audio smoke test with a synthetic tone checks offset/mixing, not speech or artistic quality.

Idea and provenance: local Genhaha Horror and Map skill instructions provide general hook, shot/caption timing and camera planning guidance. Their kits/licenses remain at the user-provided `genhaha-horror-story` and `genhaha-map-story` directories; consult their licenses if using their separate renderers. Original JK art/voice permissions and approval boundaries remain unchanged.
