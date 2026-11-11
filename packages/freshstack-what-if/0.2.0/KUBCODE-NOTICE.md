# About this package

What If Lab 0.2.0 is the What If animation skill by FreshStack (https://freshstack.ai), redistributed by kubcode.dev
under its MIT licence (see `LICENSE`), with additions by kubcode.dev under the same MIT licence.

- Upstream: `kelano86/what-if-animation`, commit `8092fb5e825e55456d1d47fec0ebf595cb93cc0d` (`SKILL.md`,
  `README-upstream.md`, `references/`, `scripts/`, the Remotion engine in `studio/src/engine/`).
- kubcode.dev additions: the vertical 9:16 Thai format and the `bees-vanish` sample episode code (`studio/src/episodes/`),
  `studio/render.mjs`, `stills.mjs`, `cover_still.mjs`, `host/`, `voice/`, `check.sh`, `README.md`.
- Changed from upstream: `scripts/voice.py` no longer carries a default voice id; it looks up your own voice by name
  (`ELEVENLABS_VOICE_NAME`, `scripts/elevenlabs_voice.py`).
- Not included: audio, music, sound effects, rendered videos, model weights, keys.
- Remotion, fonts and ElevenLabs have their own terms. Check them before commercial use.
