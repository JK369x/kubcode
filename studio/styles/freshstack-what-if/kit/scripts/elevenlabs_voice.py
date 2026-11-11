"""Resolve the ElevenLabs narrator voice by NAME, never by a hard-coded id.

The voice name comes from ELEVENLABS_VOICE_NAME (each member sets their own voice; the owner sets "jk").
There is no default and no fallback: a missing name, no match, an ambiguous match or a stock "premade" voice is an
error. Pure helpers; the caller passes a `get(path) -> bytes` function, so this module never handles the API key.
This file is shared by shared/voice/scripts/narrate_elevenlabs.py and the What If kit's voice.py (keep them equal;
studio/tests/elevenlabs-voice.test.mjs checks that).
"""
from __future__ import annotations

import json
import os

ENV_NAME = "ELEVENLABS_VOICE_NAME"


class VoiceError(SystemExit):
    pass


def voice_name(explicit: str | None = None, env=os.environ) -> str:
    name = (explicit or env.get(ENV_NAME) or "").strip()
    if not name:
        raise VoiceError(
            f"Set {ENV_NAME} to the name of YOUR ElevenLabs voice (as shown in your Voices list). "
            "There is no default voice and no fallback."
        )
    return name


def pick_voice(voices: list[dict], name: str) -> dict:
    """Exactly one voice whose name equals `name` (case-insensitive, trimmed); never a stock premade voice."""
    want = name.strip().casefold()
    matches = [v for v in voices if str(v.get("name", "")).strip().casefold() == want]
    if not matches:
        raise VoiceError(f'No ElevenLabs voice named "{name}" in this account. Not falling back to another voice.')
    if len(matches) > 1:
        raise VoiceError(f'{len(matches)} ElevenLabs voices are named "{name}". Rename them so the name is unique.')
    voice = matches[0]
    if voice.get("category") == "premade":
        raise VoiceError(f'"{name}" is a stock premade voice. Use your own cloned or designed voice.')
    if not voice.get("voice_id"):
        raise VoiceError(f'Voice "{name}" has no voice_id in the API response.')
    return voice


def resolve_voice(get, name: str) -> dict:
    """GET /v1/voices and pick the named voice. Returns {"voice_id", "name", "category"}."""
    data = json.loads(get("/v1/voices"))
    v = pick_voice(data.get("voices", []), name)
    return {"voice_id": v["voice_id"], "name": v["name"], "category": v.get("category")}
