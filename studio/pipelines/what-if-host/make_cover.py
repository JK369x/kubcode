"""Build a designed Shorts cover (1080x1920 JPG): an episode still, a bottom fade and Thai headline text.

Usage: python3 make_cover.py <slug> <frame> "<kicker>" "<headline 1>" "<headline 2 (orange)>" "<question>" <out.jpg>

The background is a full-size still from the episode; the bottom fade turns solid above the caption band, so
burned-in captions never show on the cover. The screenshot uses any headless Chrome (host_lib.find_chrome: $CHROME,
the HyperFrames/Remotion/Puppeteer downloads, or a system Chrome/Chromium). Fonts: IBM Plex Sans Thai (OFL, fonts/).
"""
from __future__ import annotations

import html
import shutil
import subprocess
import sys

from host_lib import HERE, comp_id, find_chrome, studio_dir, work_dir


def cover_html(kicker: str, h1: str, h2: str, question: str) -> str:
    e = html.escape
    return f"""<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:P;src:url(fonts/ibm-plex-thai-bold.ttf);font-weight:700}}
@font-face{{font-family:P;src:url(fonts/ibm-plex-thai-semibold.ttf);font-weight:600}}
html,body{{margin:0;width:1080px;height:1920px;overflow:hidden;background:#000}}
.bg{{position:absolute;inset:0;background:url("bg.png") center/cover}}
.shade{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,8,14,0) 50%,rgba(6,8,14,.85) 62%,#06080e 69%,#06080e 100%)}}
.t{{position:absolute;left:76px;right:60px;bottom:150px;font-family:P;color:#FFF6E6;text-shadow:0 6px 24px rgba(0,0,0,.55)}}
.k{{font-weight:600;font-size:58px;line-height:1.35;opacity:.92}}
.h{{font-weight:700;font-size:132px;line-height:1.22;letter-spacing:-1px}}
.a{{color:#FF8A3D}}
.s{{font-weight:600;font-size:50px;line-height:1.4;margin-top:22px;color:#E9E2D4;opacity:.9}}
</style><div class="bg"></div><div class="shade"></div>
<div class="t"><div class="k">{e(kicker)}</div><div class="h">{e(h1)}</div><div class="h a">{e(h2)}</div><div class="s">{e(question)}</div></div>"""


def main(slug: str, frame: str, kicker: str, h1: str, h2: str, question: str, out: str) -> None:
    work = work_dir() / "covers" / slug
    (work / "fonts").mkdir(parents=True, exist_ok=True)
    for f in ("ibm-plex-thai-bold.ttf", "ibm-plex-thai-semibold.ttf"):
        shutil.copyfile(HERE / "fonts" / f, work / "fonts" / f)
    bg = work / "bg.png"
    subprocess.run(["node", "cover_still.mjs", comp_id(slug), frame, str(bg)], cwd=studio_dir(), check=True)
    (work / "cover.html").write_text(cover_html(kicker, h1, h2, question), encoding="utf-8")
    png = work / "cover.png"
    subprocess.run([find_chrome(), "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                    "--allow-file-access-from-files", "--window-size=1080,1920", f"--screenshot={png}",
                    (work / "cover.html").as_uri()], check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(png), "-q:v", "2", out], check=True)
    print("cover", out)


if __name__ == "__main__":
    if len(sys.argv) != 8:
        raise SystemExit(__doc__)
    main(*sys.argv[1:8])
