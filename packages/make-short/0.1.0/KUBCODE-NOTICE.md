# About this package

This is make-short by NoCodeHack (https://github.com/nocodehack/make-short),
redistributed by kubcode.dev under its MIT licence (see `LICENSE` and
`THIRD-PARTY.md`).

- Upstream: `nocodehack/make-short`, commit `5a17d351343c2b5422d3ebda244c349c98ea9397` (2026-11-05)
- Left out to keep the download small: the README pictures in `assets/`
  (so the images in README.md do not show; see them on GitHub), and the
  template example's rendered videos and review PNGs (they are outputs the
  skill makes again). Nothing the skill runs is removed.
- Added by kubcode.dev: `kubcode/mac-patch.sh` (below). Upstream files are unchanged.
- Blender, ElevenLabs and Blotato have their own terms. The Blender name and
  logo are trademarks of the Blender Foundation.

## Run it on a Mac (tested by kubcode.dev, 2026-11-10)

Upstream is built for Windows + Git Bash. On macOS (Apple M5, Blender 5.3,
Node 24, ffmpeg 9) the v3 engine ran after one patch of the project copy:

```bash
brew install --cask blender && brew install ffmpeg node
python3 -m pip install --user pillow numpy
cp -R ~/.claude/skills/make-short/v3 ~/shorts/my-short
bash ~/.claude/skills/make-short/kubcode/mac-patch.sh ~/shorts/my-short
```

The patch replaces `pwd -W` with `pwd`, `python` with `python3`, finds
`/Applications/Blender.app` and makes the scripts executable. Our results:
`gate.sh s01 s05` gave PASS 2/2 in 38 s; `FRAMES=450 bash go.sh t1` rendered
the example's first 15 s at 1080×1920 in 437 s (about 7.3 min).
Not tested by us on a Mac: the voice step, `finish.mjs`, the critic loop and
posting.
