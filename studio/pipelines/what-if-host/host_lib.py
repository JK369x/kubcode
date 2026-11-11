"""Shared helpers for the What If host pipeline (no hard-coded machine paths).

Paths
  WHATIF_STUDIO     Remotion project (default: studio/styles/freshstack-what-if/source/studio)
  WHATIF_WORK       where deliverables/ and covers/ go (default: <repo>/media/work/what-if)
  WHATIF_VOICE_DIR  root of per-episode narration: <dir>/<slug>/voice/audio_meta.json + l1.wav ...
                    (or pass --voice-dir). Default: <repo>/media/work/what-if/voice
  CHROME            a Chrome / chrome-headless-shell binary for the cover screenshot (optional; found automatically)

Episodes come from the folders in src/episodes/ that have an index.tsx, filtered by the READY file
(one slug per line) next to the Remotion project. Nothing is listed by hand.
"""
from __future__ import annotations

import glob
import os
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
STUDIO_ROOT = HERE.parents[1]  # studio/
REPO_ROOT = STUDIO_ROOT.parent


def env_path(name: str, default: Path) -> Path:
    v = os.environ.get(name)
    return Path(v).expanduser().resolve() if v else default


def studio_dir() -> Path:
    return env_path("WHATIF_STUDIO", STUDIO_ROOT / "styles/freshstack-what-if/source/studio")


def work_dir() -> Path:
    media = env_path("STUDIO_MEDIA_ROOT", REPO_ROOT / "media")
    return env_path("WHATIF_WORK", media / "work/what-if")


def voice_dir(arg: str | None = None) -> Path:
    if arg:
        return Path(arg).expanduser().resolve()
    return env_path("WHATIF_VOICE_DIR", work_dir() / "voice")


def comp_id(slug: str) -> str:
    """Composition id from the slug: ice-melts-overnight -> IceMeltsOvernight."""
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        raise ValueError(f"bad episode slug: {slug!r}")
    return "".join(p[:1].upper() + p[1:] for p in slug.split("-"))


def read_ready(studio: Path) -> list[str]:
    p = studio / "READY"
    if not p.exists():
        return []
    return [s.strip() for s in p.read_text(encoding="utf-8").splitlines() if s.strip() and not s.startswith("#")]


def ready_episodes(studio: Path) -> list[tuple[str, str]]:
    """(slug, CompositionId) for every READY slug whose folder has index.tsx exporting Episode and TOTAL."""
    out = []
    for slug in read_ready(studio):
        index = studio / "src/episodes" / slug / "index.tsx"
        if not index.exists():
            continue
        src = index.read_text(encoding="utf-8")
        if "export const Episode" in src and "export const TOTAL" in src:
            out.append((slug, comp_id(slug)))
    return out


def find_chrome() -> str:
    """A headless-capable Chrome for any platform: $CHROME, the HyperFrames / Remotion / Puppeteer
    downloads, then a system Chrome/Chromium. Raises with a setup hint when none is found."""
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    home = Path.home()
    patterns = [
        ".cache/hyperframes/chrome/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell*",
        ".cache/puppeteer/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell*",
        ".cache/puppeteer/chrome/*/chrome-*/chrome",
    ]
    found: list[str] = []
    for pat in patterns:
        found += [p for p in glob.glob(str(home / pat)) if os.access(p, os.X_OK) and not p.endswith(".zip")]
    remotion = studio_dir() / "node_modules/.remotion/chrome-headless-shell"
    found += [p for p in glob.glob(str(remotion / "*/chrome-headless-shell-*/chrome-headless-shell*")) if os.access(p, os.X_OK)]
    if found:
        return sorted(found)[-1]
    for name in ("chrome-headless-shell", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if os.path.exists(mac):
        return mac
    raise SystemExit(
        "No Chrome found. Run `npx remotion browser ensure` inside the Remotion project, "
        "or `npx hyperframes doctor`, or set CHROME=/path/to/chrome."
    )
