#!/usr/bin/env python3
"""Per-line Thai narration with ElevenLabs, in the same shape as narrate.py (local VoxCPM).

    python3 narrate_elevenlabs.py --lines lines.json --out voice/ [--dry-run] [--model eleven_v3] [--language th]

lines.json: [{"id": "l01", "text": "..."}, ...]. Writes <out>/<id>.wav (48 kHz mono, 16-bit) and
<out>/audio_meta.json {"provider": "elevenlabs", "voice_name", "model", "voices": [{id, text, path, file,
duration_s, sample_rate, channels}]} — the shape deep-sea-docs' build.mjs and what-if-host/host_timing.py read.

Voice: resolved by NAME from ELEVENLABS_VOICE_NAME (or --voice-name) via GET /v1/voices. No default voice, no
fallback, no hard-coded voice id; see elevenlabs_voice.py.
Key: ELEVENLABS_API_KEY from the environment or the nearest .env (current dir and its parents). Never printed.
--dry-run makes no network call and needs no key: it prints the character count per line and in total.
A real run prints the credits used (ElevenLabs' subscription counter, which can lag by a minute).
Existing <id>.wav files are reused (no credits) unless --force.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from elevenlabs_voice import resolve_voice, voice_name  # noqa: E402

KEY_NAME = "ELEVENLABS_API_KEY"
SAMPLE_RATE = 48000


def api_base() -> str:
    # Overridable only so tests can point at a loopback fake; never needed in normal use.
    return os.environ.get("ELEVENLABS_API_BASE", "https://api.elevenlabs.io").rstrip("/")


def read_env_file(p: Path) -> str:
    raw = p.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16", errors="ignore")
    return raw.decode("utf-8-sig", errors="ignore")


def api_key() -> str:
    if os.environ.get(KEY_NAME):
        return os.environ[KEY_NAME]
    for d in [Path.cwd(), *Path.cwd().parents]:
        p = d / ".env"
        if p.is_file():
            for line in read_env_file(p).splitlines():
                if line.strip().startswith(KEY_NAME + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"No ElevenLabs key: set {KEY_NAME} in the environment or a .env file (never paste it in chat).")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(path: str, body: dict | None = None, timeout: int = 180) -> bytes:
    req = urllib.request.Request(
        api_base() + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    try:
        with urllib.request.build_opener(_NoRedirect()).open(req, timeout=timeout) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        detail = e.read()[:300].decode("utf-8", errors="replace")
        raise SystemExit(f"ElevenLabs {req.get_method()} {path} failed: HTTP {e.code} {detail}") from None


def load_lines(p: Path) -> list[dict]:
    lines = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(lines, dict):
        lines = lines.get("lines", [])
    seen = set()
    for ln in lines:
        if not isinstance(ln, dict) or not str(ln.get("id", "")).strip() or not str(ln.get("text", "")).strip():
            raise SystemExit("lines.json must be a list of {id, text}")
        if ln["id"] in seen or not all(c.isalnum() or c in "-_" for c in ln["id"]):
            raise SystemExit(f"bad or duplicate line id: {ln['id']!r}")
        seen.add(ln["id"])
    return lines


def write_pcm_wav(path: Path, pcm: bytes, rate: int = SAMPLE_RATE) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


def wav_info(path: Path) -> tuple[float, int, int]:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate(), w.getframerate(), w.getnchannels()


def to_wav(audio: bytes, fmt: str, dest: Path) -> None:
    """pcm_48000 is written directly; any other format is converted to 48 kHz mono by FFmpeg."""
    if fmt == "pcm_48000":
        write_pcm_wav(dest, audio)
        return
    with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
        tmp.write(audio)
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp.name, "-ar", str(SAMPLE_RATE), "-ac", "1",
                        "-c:a", "pcm_s16le", str(dest)], check=True)
    finally:
        os.unlink(tmp.name)


def characters_used() -> int | None:
    try:
        return int(json.loads(request("/v1/user/subscription"))["character_count"])
    except (SystemExit, KeyError, ValueError):
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Per-line ElevenLabs narration (voice by name).")
    ap.add_argument("--lines", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--voice-name", help="overrides ELEVENLABS_VOICE_NAME")
    ap.add_argument("--model", default=os.environ.get("ELEVENLABS_MODEL", "eleven_v3"))
    ap.add_argument("--language", default=os.environ.get("ELEVENLABS_LANGUAGE", "th"))
    ap.add_argument("--format", default=os.environ.get("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128"),
                    help="ElevenLabs output_format; pcm_48000 needs no FFmpeg")
    ap.add_argument("--stability", type=float, default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="regenerate lines whose wav already exists")
    a = ap.parse_args(argv)

    lines = load_lines(a.lines)
    name = voice_name(a.voice_name)
    todo = [ln for ln in lines if a.force or not (a.out / f"{ln['id']}.wav").exists()]
    chars = sum(len(ln["text"]) for ln in todo)
    if a.dry_run:
        print(json.dumps({"dry_run": True, "voice_name": name, "model": a.model, "language": a.language,
                          "lines": [{"id": ln["id"], "chars": len(ln["text"]),
                                     "reuse": ln not in todo} for ln in lines],
                          "characters_to_send": chars}, ensure_ascii=False, indent=1))
        return 0

    a.out.mkdir(parents=True, exist_ok=True)
    voice = resolve_voice(request, name)
    print(f'voice "{voice["name"]}" ({voice["category"]}); {len(todo)} line(s), {chars} characters to send')
    before = characters_used() if todo else None
    for ln in todo:
        body = {"text": ln["text"], "model_id": a.model}
        if a.language and a.model != "eleven_multilingual_v2":
            body["language_code"] = a.language
        if a.stability is not None:
            body["voice_settings"] = {"stability": a.stability}
        audio = request(f"/v1/text-to-speech/{voice['voice_id']}?output_format={a.format}", body)
        to_wav(audio, a.format, a.out / f"{ln['id']}.wav")
        print("line", ln["id"])
    voices = []
    for ln in lines:
        p = (a.out / f"{ln['id']}.wav").resolve()
        dur, rate, ch = wav_info(p)
        voices.append({"id": ln["id"], "text": ln["text"], "path": str(p), "file": p.name,
                       "duration_s": dur, "sample_rate": rate, "channels": ch})
    meta = {"provider": "elevenlabs", "voice_name": voice["name"], "model": a.model, "language": a.language,
            "voices": voices}
    (a.out / "audio_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if todo:
        after = characters_used()
        used = (after - before) if before is not None and after is not None else None
        print(f"credits used: {used if used is not None else 'unknown'} (subscription counter; may lag ~1 min)")
    print("wrote", a.out / "audio_meta.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
