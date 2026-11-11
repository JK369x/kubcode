#!/usr/bin/env python3
"""Generate Thai narration with the bundled, approved synthetic voice."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

SKILL = Path(__file__).resolve().parents[1]


def reference_path(profile):
    """The approved reference WAV is not tracked in Git (public repo).

    Lookup order: NARRATOR_REFERENCE_PATH, the bundle's assets/ folder, then
    $STUDIO_MEDIA_ROOT/voice/ (default: <repo>/media/voice/). The checksum in
    narrator-profile.json is always enforced by the caller.
    """
    name = profile["reference"]
    candidates = []
    if os.environ.get("NARRATOR_REFERENCE_PATH"):
        candidates.append(Path(os.environ["NARRATOR_REFERENCE_PATH"]).expanduser())
    candidates.append(SKILL / "assets" / name)
    media = os.environ.get("STUDIO_MEDIA_ROOT")
    if media:
        candidates.append(Path(media).expanduser() / "voice" / name)
    else:
        # studio/shared/voice -> <repo>/media/voice
        candidates.append(SKILL.parents[2] / "media" / "voice" / name)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "Approved narrator reference WAV not found. Copy it from the private media store to "
        "media/voice/" + name + " or set NARRATOR_REFERENCE_PATH. See studio/docs/media.md."
    )


def profile_plan():
    profile = json.loads((SKILL / "assets/narrator-profile.json").read_text())
    reference = reference_path(profile)
    digest = hashlib.sha256(reference.read_bytes()).hexdigest()
    if digest != profile["reference_sha256"]:
        raise ValueError("Approved voice reference checksum mismatch; do not substitute a voice.")
    hub = Path(os.environ.get("HF_HUB_CACHE", str(Path(os.environ.get("HF_HOME", str(Path.home() / ".cache/huggingface"))) / "hub")))
    default_model = hub / ("models--" + profile["model_repository"].replace("/", "--")) / "snapshots" / profile["model_revision"]
    model = Path(os.environ.get("NARRATOR_MODEL_PATH") or os.environ.get("JK_MODEL_PATH") or str(default_model)).expanduser()
    return profile, {
        "voice_profile": profile["id"],
        "reference_path": str(reference),
        "reference_sha256": digest,
        "model_repository": profile["model_repository"],
        "model_revision": profile["model_revision"],
        "model_path": str(model),
        "parameters": profile["parameters"],
        "offline": True,
    }


def runtime_missing(plan):
    missing = [name for name in ("mlx", "mlx_audio", "numpy", "soundfile")
               if importlib.util.find_spec(name) is None]
    if not Path(plan["model_path"]).is_dir():
        missing.append("pinned local VoxCPM2 model")
    if not shutil.which("ffmpeg"):
        missing.append("ffmpeg")
    return missing


def read_lines(path):
    lines = json.loads(Path(path).read_text())
    if not isinstance(lines, list) or not lines:
        raise ValueError("--lines must contain a nonempty JSON array of {id, text}.")
    seen = set()
    for item in lines:
        if not isinstance(item, dict):
            raise ValueError("Each narration line must be an object.")
        name, text = item.get("id"), item.get("text")
        if not isinstance(name, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", name):
            raise ValueError("Line IDs must be safe lowercase names, e.g. hook or scene-02.")
        if name in seen or not isinstance(text, str) or not text.strip():
            raise ValueError("Line IDs must be unique and spoken text must be nonempty.")
        seen.add(name)
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lines", help="UTF-8 JSON array of {id, text}")
    parser.add_argument("--out", help="Project-local output directory")
    parser.add_argument("--dry-run", action="store_true", help="Show the fixed voice plan without generating files")
    parser.add_argument("--check", action="store_true", help="Check the existing local runtime without loading weights")
    args = parser.parse_args()
    profile, plan = profile_plan()
    if args.check:
        missing = runtime_missing(plan)
        print(json.dumps(dict(plan, ok=not missing, missing=missing), ensure_ascii=False, indent=2))
        return 2 if missing else 0
    if not args.lines or not args.out:
        parser.error("--lines and --out are required unless --check is used")
    lines = read_lines(args.lines)
    plan["lines"] = lines
    if args.dry_run:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0
    missing = runtime_missing(plan)
    if missing:
        raise RuntimeError("Unavailable locally: " + ", ".join(missing) + ". No download or voice fallback attempted.")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    model = load_model(Path(plan["model_path"]))
    params = profile["parameters"]
    norm = profile["normalization"]
    manifest = {key: value for key, value in plan.items() if key != "lines"}
    manifest["voices"] = []
    for index, line in enumerate(lines):
        started = time.monotonic()
        print("Generating " + line["id"], file=sys.stderr, flush=True)
        mx.random.seed(params["seed_base"] + index)
        chunks = []
        for result in model.generate(
            text=line["text"],
            ref_audio=plan["reference_path"],
            prompt_audio=plan["reference_path"],
            prompt_text=profile["reference_text"],
            max_tokens=params["max_tokens"],
            inference_timesteps=params["inference_timesteps"],
            cfg_value=params["cfg_value"],
        ):
            chunks.append(np.asarray(result.audio).reshape(-1))
            sample_rate = result.sample_rate
        if not chunks:
            raise RuntimeError("No voice audio returned for " + line["id"])
        raw = output / (line["id"] + "-raw.wav")
        target = output / (line["id"] + ".wav")
        sf.write(str(raw), np.concatenate(chunks), sample_rate, subtype="PCM_16")
        audio_filter = "loudnorm=I={}:TP={}:LRA={}".format(
            norm["integrated_lufs"], norm["true_peak_dbfs"], norm["loudness_range"])
        subprocess.run([
            shutil.which("ffmpeg"), "-hide_banner", "-loglevel", "error",
            "-i", str(raw), "-af", audio_filter, "-ar", str(norm["sample_rate"]),
            "-ac", str(norm["channels"]), "-c:a", "pcm_s16le", "-y", str(target),
        ], check=True)
        info = sf.info(str(target))
        manifest["voices"].append({
            "id": line["id"], "text": line["text"], "path": str(target),
            "raw_path": str(raw), "duration_s": info.duration,
            "sample_rate": info.samplerate, "channels": info.channels,
            "elapsed_s": round(time.monotonic() - started, 3),
        })
        manifest["total_voice_duration_s"] = sum(v["duration_s"] for v in manifest["voices"])
        (output / "audio_meta.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps({"ok": True, "metadata": str(output / "audio_meta.json"),
                      "voice_profile": profile["id"], "lines": len(lines)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print("Error: " + str(error), file=sys.stderr)
        sys.exit(2)
