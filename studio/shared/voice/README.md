# ผู้บรรยายไทย สุขุม (Thai Calm Narrator) — portable bundle

The approved synthetic calm male narrator, legacy id approved-calm-male-v1, is described here by its exact reference transcript, checksum, model revision and generation settings. The reference WAV itself is **not in Git** (kubcode is a public repo); it lives in the git-ignored media store. It is not a recording of the user or another identified person.

## Setup on Apple Silicon macOS

Install Python 3.11+ and FFmpeg; for Homebrew: brew install python@3.12 ffmpeg. From the repository root:

```bash
npm run setup:voice
.venv/bin/python shared/voice/scripts/narrate.py --check
.venv/bin/python shared/voice/scripts/narrate.py --lines shared/voice/example-lines.json --out outputs/voice --dry-run
.venv/bin/python shared/voice/scripts/narrate.py --lines shared/voice/example-lines.json --out outputs/voice
```

Setup installs the full pinned dependency lock in the repo-local .venv and downloads mlx-community/VoxCPM2-4bit at revision dc9e5c187858da5f4a13dc4c247e297339216381. Network/disk space are required for initial setup. Review the model's upstream terms on Hugging Face; weights are not redistributed here.

Generation uses the original direct workflow, both ref_audio and prompt_audio, preserved prompt text/parameters and FFmpeg loudness normalization. It runs offline once installed. The helper never downloads or silently chooses another narrator. Set NARRATOR_MODEL_PATH (legacy JK_MODEL_PATH still works) to an existing compatible snapshot if needed; HF_HOME/HF_HUB_CACHE also work. Use audio_meta.json for actual durations and paths.

Windows/Linux/Intel Macs can use the supplied reference and visuals, but this MLX helper cannot synthesize on those systems. Keep original speed/pitch and natural breathing. VoiceStudio is not part of this production path. New text/hardware may change delivery despite identical voice conditioning.

A generated narrator sample (`media/voice/narrator-sample.wav`, local only) can be played without installing the model. See examples/sample.json for provenance. Generation was smoke-tested in a new dedicated environment; no perceptual match certification is claimed.

## Where the voice files live (not in Git)

| File | Local path | Override |
|---|---|---|
| Approved reference WAV (`narrator-reference.wav`, sha256 in `assets/narrator-profile.json`) | `<repo>/media/voice/narrator-reference.wav` | `NARRATOR_REFERENCE_PATH`, or `STUDIO_MEDIA_ROOT` (looks in `$STUDIO_MEDIA_ROOT/voice/`) |
| Listening sample | `<repo>/media/voice/narrator-sample.wav` | — |
| VoxCPM2 weights | Hugging Face cache | `NARRATOR_MODEL_PATH` (legacy `JK_MODEL_PATH`), `HF_HOME`, `HF_HUB_CACHE` |

`narrate.py` checks the reference checksum before every run and refuses any other file. Get the WAV from the owner's private media store; never commit it.
