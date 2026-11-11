---
name: thai-narrator
description: Generate the saved calm male Thai narrator ("ผู้บรรยายไทย สุขุม", formerly "Thai JK") using this repository's reference audio and pinned local VoxCPM2 workflow.
---
# ผู้บรรยายไทย สุขุม

Repository root is three levels above this skill. Read shared/voice/README.md. The approved synthetic male voice is approved-calm-male-v1; it is not a recording of the user or another identified person. Preserve the bundled reference WAV, transcript, checksum, model revision and generation parameters.

On Apple Silicon macOS, npm run setup:voice prepares .venv and downloads the pinned model. Production helper: .venv/bin/python shared/voice/scripts/narrate.py. Use --check before generating, --dry-run to inspect a plan, and audio_meta.json for actual durations. Other operating systems can use the gallery and supplied audio; this MLX helper cannot synthesize there.

Generate only changed narration chunks where possible. Keep original speed/pitch and natural pauses. Do not route through VoiceStudio generation or substitute another voice. New text can change delivery even with the same reference.
