# Sources and third-party material

- Style inspiration supplied by the user: https://www.youtube.com/watch?v=XbXiFizyGko (Awaken). The user-supplied screenshots are kept outside Git (local `media/archive/reference-frames/jk-soft-story/`) for private visual study only. They are not production assets and no license to redistribute them publicly is granted.
- JK Soft Story scene SVG and PNG are original project artwork selected by the user on 2026-10-28. No third-party character, footage or soundtrack is copied into them.
- GSAP 3.14.2 is copied from the existing HyperFrames sample, retaining the copyright/license header in assets/gsap.min.js. License link from that header: https://gsap.com/standard-license/. No broader license is granted by this repository.
- HyperFrames is invoked separately through its CLI; its implementation is not vendored.

This repository does not assign an open-source license to the user's original artwork. Decide licensing before external distribution.

- Thai narrator reference WAV is the original synthetic voice reference approved by the user, not an identified person’s recording. VoxCPM2 weights are downloaded separately from Hugging Face, subject to their upstream terms.

- Low-poly Urban is an original procedural Three.js study inspired by the sanitized Higgsfield article linked in its STYLE.md. No source video or access token is bundled.
- Three.js 0.170.0: MIT, retained in examples/city/assets/THREE-LICENSE.txt.
- VT323 and Chakra Petch fonts: SIL Open Font License, retained alongside the font files in examples/city/assets/fonts/.

## Public-repo boundary (2026-11-11)

This tree lives at `studio/` in the public kubcode repo. The following are deliberately **not** in Git and live in the
git-ignored `media/` folder (see docs/media.md): example MP4s, the narrator reference WAV and samples, ElevenLabs
episode audio, Pixabay SFX files, third-party screenshots, and the reference-only upstream kits `growkaz-stickman`,
`thai-survival` and `tool-reel-system` (no upstream licence). FreshStack What If kit code is MIT (kit/LICENSE).
Genhaha kits are not included; only our own notes about them.
