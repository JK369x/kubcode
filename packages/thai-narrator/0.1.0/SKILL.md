---
name: thai-narrator
description: Generate Thai narration in one consistent voice from a short reference recording you supply (VoxCPM2 on Apple Silicon, offline after setup). Use when the user wants Thai voice-over lines for a clip, "Thai Narrator", or real line durations to time captions.
---

# Thai Narrator

One consistent voice across every line and episode: same reference recording, same model revision,
same seed and settings, loudness-normalized output. You bring the voice; this package ships none.

## Requirements
- Apple Silicon Mac (MLX). Windows/Linux/Intel Macs cannot synthesize with this helper.
- Python 3.11+, FFmpeg.
- VoxCPM2 weights `mlx-community/VoxCPM2-4bit` at the revision in `assets/narrator-profile.json`,
  downloaded from Hugging Face under its own terms. Weights are NOT bundled.
- A reference voice you have the right to use: your own recording, or a voice whose owner agreed.
  Never clone a real person without their consent.

## Setup (once)
1. Record 5–15 s of clear Thai speech, mono WAV, quiet room. Save as `assets/voice-reference.wav`
   (or point `NARRATOR_REFERENCE_PATH` at it).
2. Put the exact words you spoke into `reference_text` in `assets/narrator-profile.json`.
   Optional: set `reference_sha256` to the file's SHA-256 to lock the voice against accidental swaps.
3. Install:
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-lock.txt
.venv/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/VoxCPM2-4bit', revision='dc9e5c187858da5f4a13dc4c247e297339216381')"
.venv/bin/python scripts/narrate.py --check
```

## Use
1. Write lines as JSON: `[{"id": "hook", "text": "..."}, {"id": "scene-02", "text": "..."}]`
   (ids: lowercase letters, digits, hyphens). Short natural sentences read best.
2. Dry run: `.venv/bin/python scripts/narrate.py --lines lines.json --out out/voice --dry-run`
3. Generate: `.venv/bin/python scripts/narrate.py --lines lines.json --out out/voice`
4. Use `out/voice/audio_meta.json` for real durations; time captions and scenes to them. Never stretch
   speech to fit visuals.

## Rules
- The script never downloads anything or swaps the voice on its own.
- Keep original speed and pitch.
- Label synthetic narration where the platform asks (e.g. "AI-generated").
