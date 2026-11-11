---
name: jk-animation-studio
description: Browse and extend this repository's JK visual styles and produce code-based videos using its shared voice and caption workflow.
---
# JK Animation Studio

Repository root is three levels above this skill. Read README.md, DIRECTOR.md and TECHNIQUE.md. List available styles with npm run styles; read the chosen styles/<id>/STYLE.md and inspect its selected preview before drawing. The catalog includes JK Soft Story v2 and the independently selected Low-poly Urban v0.3 (original 8-second visual/motion example; bilingual highlighted captions separately approved on 2026-10-29; no blanket audio approval). If unspecified, show the available styles and ask the user to choose. Read the selected captions.json too; the approved shared bilingual caption default overrides earlier plain Robot Terminal captions without merging visual styles.

Use npm run new-style -- <id> for another style. New styles stay draft until the user selects the actual image. Do not infer animation/audio approval from a selected still. Keep independent source and rendered evidence for each style.

Preserve the approved Thai narrator voice through shared/voice/scripts/narrate.py. Read the bundled thai-narrator skill for setup. Do not silently switch engines or replace the reference. Use audio-first production and HyperFrames' paused seekable timeline as described in TECHNIQUE.md.

Run npm test, npm run check and relevant HyperFrames checks after changes. Inspect actual encoded output. Publishing or inviting collaborators requires the user's request.

## Approved caption default

For the user’s next Thai-narrated videos, use **Thai key phrase highlights + smaller English translation below** by default. This treatment was explicitly selected on 2026-10-29, replacing the plain white caption default. Read [the shared caption guide](../../../shared/captions/STYLE.md) and its JSON preset; inspect its approved frame. Keep Thai primary, highlight only meaningful words, and retain scene-aware positioning with no reserved band or decorative bounce. Voice selection stays independent. A direct user request for another caption treatment or no captions takes precedence.

## Approved cover default

For future narrative video covers, use **ChatGPT image generation with actual episode characters/scenes as references**, as selected on 2026-10-29. Read [the cover guide](../../../shared/covers/STYLE.md) and inspect its approved example. Use strong visual hierarchy and readable, intentionally placed Thai text. For interactive episodes, make the comment-vote instruction and fully named choices unmistakable; numbers alone are insufficient. This applies to covers only; retain the chosen HyperFrames video workflow. Explicit user changes override the default.

## Narrated low-poly mall episodes

Use [jk-low-poly-beats](../jk-low-poly-beats/SKILL.md) and the actual [low-poly-beats-v1 entrypoint](../../../pipelines/low-poly-beats-v1/README.md) for these episodes. Shared named speech anchors must drive camera/reveal/caption/SFX together. Verify the built renderer and final export; editing instructions or rendering JK Window does not update a low-poly episode. Preserve prior versions and do not silently return to the standalone old compose.py path.
