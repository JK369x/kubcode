# Tools and render contract

## Runtime responsibilities

- Node.js 22+: catalog, scaffold, checks and HyperFrames CLI.
- SVG/HTML + GSAP: editable geometry and motion. The still example includes the selected original scene and named groups.
- Python 3.11+: local Thai narrator voice through VoxCPM2/MLX, currently Apple Silicon macOS only.
- FFmpeg/FFprobe: encode/mix/export, convert audio and inspect duration/streams. Install the system binaries for voice normalization and manual checks; HyperFrames also manages its media pipeline.

HyperFrames is pinned in package-lock.json; use npm ci on a new clone. The sample is a still scene, not a complete reusable animation engine.

## Minimum HyperFrames contract

- Root has explicit width/height, data-composition-id, data-start=0, data-duration and data-fps. Duration defines the rendered window.
- Timed elements have class=clip, data-start and data-duration. The framework manages their lifecycle and audio/video seeking.
- Register one paused GSAP timeline per composition in window.__timelines, keyed to its composition id. No running clock, random render state, timer-driven visuals or endless repeats.
- Do not tween display/visibility on clips. Animate child transforms/opacity; do not animate CSS layout dimensions. Avoid CSS initial transforms on GSAP-controlled elements.
- Keep reusable SVG defs and groups. Prefix ids and url(#...) when inserting multiple instances; static SVG ids are not safe to duplicate.
- For multi-scene productions, use sub-compositions. Everything in a sub-composition goes inside template, including style/script, and host id, internal composition id and timeline key match.
- Audio needs an id and explicit timing. A video's original audio must be declared; do not call media play/pause/seek in author code.
- Local assets and fonts are explicit files. Outputs and machine caches are ignored by Git.

## Commands

Run npm run hf:check and npm run hf:snapshot to verify the bundled still. For a new HyperFrames project:

```bash
npx hyperframes init outputs/my-film
npx hyperframes preview outputs/my-film --background
npx hyperframes check outputs/my-film --json
npx hyperframes snapshot outputs/my-film --at 1,3,5 --output .qa/my-film
npx hyperframes render outputs/my-film --quality looks --output outputs/my-film.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height outputs/my-film.mp4
```

Use CLI --help for version-specific options. For the full optional official skill set, run npx hyperframes skills and select the intended project/tool locations in its installer; this repository's essential guides do not depend on a global skill install.

## Voice

See shared/voice/README.md. The model is downloaded explicitly by npm run setup:voice, never bundled in Git. Generation runs offline after setup. NARRATOR_MODEL_PATH (legacy JK_MODEL_PATH still works) can override the pinned cache location for an existing compatible download; HF_HOME/HF_HUB_CACHE are respected. Reference audio is checksum verified before planning/generation.

## Limits

Pinned versions, saved assets and a seed improve repeatability, but an agent writing a new scene or new TTS text can produce a different result. The same visual identity is supported; identical creative output across agents/hardware is not guaranteed. Windows/Linux can use the style library and supplied audio but not this MLX synthesis helper. A different backend needs an explicit, separately reviewed implementation.

## Social API runtime

Use Bun + Elysia for YouTube/Instagram HTTP operations. Node remains the video/catalog runtime; Python remains the voice/media runtime. See social-api/README.md for exact implemented endpoints and private account setup. Skill workflows do not imply all routes are implemented.
