# JK motion comparison — 2026-10-29

## Evidence and comparison boundaries

- JK Soft Story original: `styles/jk-soft-story/examples/motion/demo.mp4`, 8 s, 1920×1080, silent; one scene, blinking, a head movement, the hand and latch, then the figure's hand. It is a motion study, not an edited narrative episode. Its selected image approval does not approve motion or sound.
- JK Low-poly Urban original: `styles/low-poly-urban/examples/city/demo.mp4`, 8 s, 1080×1920, silent; city, moving car and character, historical plain caption. Its style-specific current caption preset was approved separately.
- Genhaha horror/map: locally scaffolded silent 5 s samples at `outputs/genhaha-previews/`. Horror uses a dark SVG scene, limited palette, light, fog and subtitle beats. Map uses satellite texture, animated geographic composition, labels and subtitles. These are different subjects and lengths; they cannot prove their full stories are better than JK's.
- Source `SKILL.md` files specify story hooks, line/shot-based timings, spoken audio, scene/camera choices; horror also specifies silence and timed sound cues. Those are documented capabilities; no full original Genhaha render with voice was available in the supplied source folders for this comparison, so voice, effects mix and full-episode delivery have not been evaluated. Our five-second renders are silent.

Potential causes of the difference are the more explicit hook, frequent changes in visual focus, tied caption/shot structure and, in map, imagery detail. These are hypotheses rather than an objective quality measurement. Different assets, genre and aspect ratio confound comparison. JK's original has richer character shapes and an established selected still direction; keep these strengths.

## Controlled local pilot

The two `outputs/comparison-20261029/` videos share the exact JK scene and eight-second duration, 1920×1080 and no audio. Original is byte-identical to the historical MP4 (SHA-256 `87f1148dc5415f688463022e1f998f2fec7f845a641dcb739b23ed2ddf9b2535`). The opt-in `styles/jk-soft-story-motion-v2/` pilot retains the original editable scene and animation, adding three caption beats (question, latch, other hand) and gentle reframing. It uses the selected Thai emphasis plus smaller English direction, adapted to this landscape pilot. Captions demonstrate editorial pacing only; absent voice means they are not aligned to narration. No actual cuts, new acting, generated audio or sound effects were added. The source script and rendering quality differ from the old encoded file; this is a creative A/B, not a codec-controlled benchmark. Visual review of frames at 1, 3.5 and 6.5 s showed readable text and retained subject framing. A human creative preference has not yet been recorded.

High-value follow-up: script a complete hook → setup → turn → payoff, generate the already-selected JK voice first and time cues to measured narration, plan individual shots around the voice and motivated physical action, and add sparse contact-specific sound after separate listening review. For map stories, independently verify geographic coordinates and imagery credits. These improvements require separate production, testing, and creative approval.

## Preservation and validation

Full pre-experiment local working-tree archive (excluding `.git`) and SHA-256 are recorded in `outputs/version-baselines/BASELINE-20261029.txt`; the archive includes ignored and potentially private files, so keep it local. Original source and output were not changed. The new style stays `draft` and the web selection is mock-only. Both MP4 files decode without errors and are 8.000 s. `npm test`, `npm run check`, and React build passed; gallery generated in a temporary copy to avoid replacing the pre-existing modified `gallery/index.html`. No upload, publishing, paid generation, or credentials were used.

HyperFrames check reports a nested SVG / subcomposition structure recommendation inherited from the original motion scene. It also flagged 22 px English text in the first pilot, so the separate readable revision increases it to 30 px; this warning cleared on recheck. The first pilot remains saved. The check could not write its history under the protected user cache (EPERM), but it returned its report.
