# What If host pipeline (vertical Thai shorts)

Turns a What If episode (written in `styles/freshstack-what-if/source/studio/src/episodes/<slug>/`) plus per-line
narration into a 1080×1920 MP4, QA stills, a contact sheet and a designed cover. Runs on macOS, Linux and
Windows (WSL2 Ubuntu; see `docs/pc-setup.md`). No machine-specific paths: everything comes from env or arguments.

| Env | Default | What |
|---|---|---|
| `WHATIF_STUDIO` | `studio/styles/freshstack-what-if/source/studio` | Remotion project |
| `STUDIO_MEDIA_ROOT` | `<repo>/media` | git-ignored local media |
| `WHATIF_WORK` | `$STUDIO_MEDIA_ROOT/work/what-if` | `deliverables/`, `covers/` |
| `WHATIF_VOICE_DIR` (or `--voice-dir`) | `$WHATIF_WORK/voice` | `<dir>/<slug>/voice/{audio_meta.json,l1.wav…}` |
| `CHROME` | auto | headless Chrome for the cover (HyperFrames/Remotion/Puppeteer download or system Chrome) |

Episodes = folders in `src/episodes/` with an `index.tsx` exporting `Episode` and `TOTAL`, listed in the project's
`READY` file. `host_root.py` regenerates `src/episodes/vertical.generated.tsx`; the composition id is the slug in
PascalCase (`ice-melts-overnight` → `IceMeltsOvernight`).

```bash
# 1. narration, one wav per line (ElevenLabs, your own voice by name; or shared/voice/scripts/narrate.py on Apple Silicon)
export ELEVENLABS_VOICE_NAME="<your voice name>"      # the key goes in .env as ELEVENLABS_API_KEY, never in chat
python3 studio/shared/voice/scripts/narrate_elevenlabs.py --lines lines.json --out media/work/what-if/voice/bees-vanish/voice --dry-run
python3 studio/shared/voice/scripts/narrate_elevenlabs.py --lines lines.json --out media/work/what-if/voice/bees-vanish/voice
# 2. timing + register + typecheck + QA stills
sh studio/pipelines/what-if-host/host_integrate.sh bees-vanish
# 3. render, QA, cover
(cd studio/styles/freshstack-what-if/source/studio && npm ci && node render.mjs BeesVanish ../../../../../media/work/what-if/deliverables/bees-vanish.mp4)
sh studio/pipelines/what-if-host/host_qa.sh bees-vanish
python3 studio/pipelines/what-if-host/make_cover.py bees-vanish 240 "ถ้า..." "ผึ้ง" "หายไป" "จะเกิดอะไรขึ้น?" media/work/what-if/deliverables/bees-vanish-cover.jpg
```

`lines.json` for an episode is the `l1`…`lN` Thai lines of its `SCRIPT.md` (the same text as `cues.json` spoken
chunks; `host_integrate.sh` refuses a mismatch). Generated audio (`public/<slug>/voice.wav`) and MP4s are never
committed. Fonts: IBM Plex Sans Thai (OFL, `fonts/IBM-Plex-OFL.txt`); Chakra Petch (OFL) in the Remotion `public/fonts/`.

Tests (offline): `python3 -m unittest discover -s tests` (also run by `npm --prefix studio test`).
