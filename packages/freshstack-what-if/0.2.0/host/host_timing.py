"""Host integration: build voice.wav and timing.json for one episode from real per-line narration.

Usage: python3 host_timing.py <slug> [--voice-dir DIR]

Narration comes from a per-line voice folder holding audio_meta.json ({"voices": [{"id", "text", "duration_s"}]})
and <id>.wav files, as written by shared/voice/scripts/narrate.py (local VoxCPM) or narrate_elevenlabs.py.
The folder is found under the voice root (--voice-dir, else $WHATIF_VOICE_DIR, else media/work/what-if/voice) as
<root>/<slug>/voice/, <root>/<slug>/ or <root>/ itself.

Shot boundaries come from the measured line durations; caption cues come from the episode's cues.json and are timed
by splitting each line's real duration in proportion to spoken text length. The line order is the order in
audio_meta.json; nothing is hard-coded per episode.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from host_lib import studio_dir, voice_dir

FPS = 30
LEAD = 0.15
# Pause after each line, by position; lines beyond the table use DEFAULT_GAP, the last line LAST_GAP.
GAPS = [0.35, 0.3, 0.4, 0.45, 0.35, 0.45]
DEFAULT_GAP = 0.4
LAST_GAP = 1.3


def weight(s: str) -> int:
    # Thai combining marks barely change spoken length; count spacing characters only.
    return sum(1 for ch in s if not ("ั" == ch or "ิ" <= ch <= "ฺ" or "็" <= ch <= "๎" or ch == " "))


def find_voice_folder(root: Path, slug: str) -> Path:
    for cand in (root / slug / "voice", root / slug, root):
        if (cand / "audio_meta.json").is_file():
            return cand
    raise SystemExit(f"No audio_meta.json for {slug} under {root} (tried <root>/{slug}/voice, <root>/{slug}, <root>).")


def gap_for(i: int, n: int) -> float:
    if i == n - 1:
        return LAST_GAP
    return GAPS[i] if i < len(GAPS) else DEFAULT_GAP


def plan(voices: list[dict], cues_src: list[dict]) -> dict:
    """Pure timing plan (frames) from line durations and cues; no I/O."""
    t, shot_start = LEAD, 0.0
    segments, lines, cues, starts = [], [], [], []
    n = len(voices)
    for i, v in enumerate(voices):
        lid, dur = v["id"], float(v["duration_s"])
        starts.append(t)
        chunks = [c for c in cues_src if c["line"] == lid]
        total_w = sum(weight(c["spoken"]) for c in chunks) or 1
        ct = t
        for j, c in enumerate(chunks):
            cd = dur * weight(c["spoken"]) / total_w
            end = ct + cd + (0.25 if j == len(chunks) - 1 else 0)
            cues.append({"a": round(ct * FPS), "b": round(end * FPS), "pre": c.get("pre", ""), "key": c["key"],
                         "post": c.get("post", ""), "color": c["color"], "en": c["en"]})
            ct += cd
        line_end = t + dur + gap_for(i, n)
        segments.append({"shot": f"S{i + 1}", "a": round(shot_start * FPS), "b": round(line_end * FPS),
                         "line_start": round(t * FPS), "line_end": round((t + dur) * FPS)})
        lines.append({"id": lid, "a": round(t * FPS), "b": round((t + dur) * FPS), "text": v["text"]})
        shot_start = t = line_end
    total = round(t * FPS)
    segments[-1]["b"] = total
    for k in range(len(cues) - 1):
        cues[k]["b"] = min(cues[k]["b"], cues[k + 1]["a"])
    return {"total": total, "seconds": t, "starts": starts, "segments": segments, "lines": lines, "cues": cues,
            "flashes": [segments[0]["a"] + 20]}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("slug")
    ap.add_argument("--voice-dir", help="voice root or the episode's voice folder")
    args = ap.parse_args()
    studio = studio_dir()
    ep = studio / "src/episodes" / args.slug
    vdir = find_voice_folder(voice_dir(args.voice_dir), args.slug)
    voices = json.loads((vdir / "audio_meta.json").read_text(encoding="utf-8"))["voices"]
    cues_src = json.loads((ep / "cues.json").read_text(encoding="utf-8")) if (ep / "cues.json").exists() else []
    p = plan(voices, cues_src)
    (ep / "timing.json").write_text(json.dumps({k: p[k] for k in ("total", "segments", "lines", "cues", "flashes")},
                                               ensure_ascii=False, indent=1), encoding="utf-8")
    out = studio / "public" / args.slug
    out.mkdir(parents=True, exist_ok=True)
    inputs, filters = [], []
    for i, (v, start) in enumerate(zip(voices, p["starts"])):
        inputs += ["-i", str(vdir / f"{v['id']}.wav")]
        d = int(round(start * 1000))
        filters.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,adelay={d}|{d}[a{i}]")
    n = len(voices)
    mix = ";".join(filters) + ";" + "".join(f"[a{i}]" for i in range(n)) + \
        f"amix=inputs={n}:normalize=0,apad=whole_dur={p['seconds']:.3f}[out]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", mix, "-map", "[out]",
                    "-t", f"{p['seconds']:.3f}", "-ar", "48000", "-ac", "2", str(out / "voice.wav")], check=True)
    print(json.dumps({"slug": args.slug, "seconds": round(p["seconds"], 2), "frames": p["total"], "cues": len(p["cues"])}))


if __name__ == "__main__":
    main()
