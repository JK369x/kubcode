---
name: thai-narrator
description: Generate Thai narration with a fixed, approved synthetic calm male voice (VoxCPM2 on Apple Silicon, offline after setup). Use when the user wants Thai voice-over lines for a clip, "Thai Calm Narrator", or audio durations to time captions.
---

# Thai Calm Narrator (ผู้บรรยายไทย สุขุม)

One fixed synthetic voice, reproduced exactly from its reference: same reference WAV (checksum-locked),
same model revision, same seed and settings, loudness-normalized output.

## Requirements
- Apple Silicon Mac (MLX). Windows/Linux/Intel Macs cannot synthesize with this helper.
- Python 3.11+, FFmpeg.
- VoxCPM2 weights `mlx-community/VoxCPM2-4bit` at the revision in `assets/narrator-profile.json`,
  downloaded from Hugging Face under its own terms. Weights are NOT bundled.

## Setup (once)
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
- The script refuses any other reference file (checksum) and never silently swaps the voice or downloads.
- Keep original speed and pitch. Don't present the voice as a real, identifiable person.
- Disclose synthetic narration where the platform asks (e.g. "AI-generated" labels).
