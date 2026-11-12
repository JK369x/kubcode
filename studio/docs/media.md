# Local media (not in Git)

`studio/` is part of the public kubcode repo. Large or private binaries live in the repo-level, git-ignored
`media/` folder (override with `STUDIO_MEDIA_ROOT`). `npm --prefix studio test` and `npm --prefix studio run check`
pass without it; tests that need a file skip, and `check` warns about absent example videos
(`npm --prefix studio run check -- --strict-media` or `STUDIO_STRICT_MEDIA=1` makes that an error).

| Local path under `media/` | What | Used by |
|---|---|---|
| `studio-examples/<style>/examples/<id>/demo.mp4` | style example videos (jk-soft-story, low-poly-urban, freshstack-what-if) | `style.json` `video`/`examples[].video` (resolved style dir → here), kubcode `npm run showcase` |
| `studio-examples/freshstack-what-if/source/studio/public/mute-touch/*.wav` | Mute Touch ElevenLabs voice/music/SFX (private study) | copy into the Remotion `public/` to re-render that episode |
| `voice/narrator-reference.wav` | approved narrator reference (checksum in `shared/voice/assets/narrator-profile.json`) | `shared/voice/scripts/narrate.py` (`NARRATOR_REFERENCE_PATH` overrides) |
| `voice/narrator-sample.wav`, `voice/voice-jk-example.wav` | listening samples | — |
| `studio-sfx/low-poly-beats-v1/*.mp3` | Pixabay SFX (licence forbids standalone redistribution) | copy into a plan's `assets/` |
| `work/what-if/` | narration, deliverables, covers of What If episodes | `pipelines/what-if-host` |
| `private-kits/deep-sea-docs/` | members-only Deep Sea Docs kit + ep01 project (canonical copy: private repo `JK369x/jk-animation-studio`) | owner package build |
| `archive/reference-kits/{growkaz-stickman,thai-survival,tool-reel-system}/` | unlicensed upstream kits, private reference only | `visual/*` notes |
| `archive/reference-frames/`, `archive/studio-design/`, `archive/docs/` | third-party screenshots, design screenshots, internal handoff notes | — |

Never commit anything from `media/`. Model weights (VoxCPM2) stay in the Hugging Face cache (`NARRATOR_MODEL_PATH`).
Creator media will move to Cloudflare R2 later (ADR 0002 D1/D5); until then the owner's copy is the only copy.
