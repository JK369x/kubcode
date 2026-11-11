#!/usr/bin/env python3
"""Install the saved Thai narrator voice runtime and pinned model inside a fresh clone."""
import argparse
import json
from pathlib import Path
import platform
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()
profile = json.loads((ROOT / "shared/voice/assets/narrator-profile.json").read_text())
if args.dry_run:
    print(json.dumps({"runtime": str(ROOT / ".venv"), "model": profile["model_repository"], "revision": profile["model_revision"]}, indent=2))
    sys.exit(0)
if platform.system() != "Darwin" or platform.machine() != "arm64":
    sys.exit("The Thai narrator uses MLX and currently needs an Apple Silicon Mac. Gallery and visuals remain usable on other systems.")
if sys.version_info < (3, 11):
    sys.exit("Python 3.11+ is required.")
subprocess.run([sys.executable, "-m", "venv", str(ROOT / ".venv")], check=True)
python = ROOT / ".venv/bin/python"
subprocess.run([str(python), "-m", "pip", "install", "-r", str(ROOT / "shared/voice/requirements-lock.txt")], check=True)
code = "from huggingface_hub import snapshot_download; snapshot_download(repo_id=" + repr(profile["model_repository"]) + ", revision=" + repr(profile["model_revision"]) + ")"
subprocess.run([str(python), "-c", code], check=True)
subprocess.run([str(python), str(ROOT / "shared/voice/scripts/narrate.py"), "--check"], check=True)
