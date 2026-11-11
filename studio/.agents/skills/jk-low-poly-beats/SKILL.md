---
name: jk-low-poly-beats
description: Build or revise narrated low-poly mall episodes through the reusable plan-driven renderer, with speech-anchored reveals/captions and preserved versions.
---

# Low-poly episode workflow

Read repository AGENTS.md, DIRECTOR.md, TECHNIQUE.md, `styles/low-poly-urban/STYLE.md`, shared caption guidance, and `pipelines/low-poly-beats-v1/README.md`. The executable entrypoint is that pipeline's `cli.mjs`; the separate JK Window pilot does not render these episodes.

Preserve previous episode/video/source and continuity. Write an explicit hook → clue → action/reaction → reveal → consequence → open choice plan. Use the existing saved Thai narrator (ผู้บรรยายไทย สุขุม) and offline audio where available. Do not silently change voices or substitute reference artwork/styles.

For supported mall sets/actions, author a validated low-poly beat plan. Use measured audio boundaries and reviewed local speech anchors. Reference the same named anchor from camera/reveal channel/caption/keyword/SFX when they describe one event. Do not calculate phrase timings from text length or add more cuts as a substitute for staging. Keep the figure hidden until its reveal, give head/hand/body a causal order, and preserve a useful quiet hold. Maintain Thai highlighted short phrases with smaller English unless the user requests otherwise; do not invent a newer typography preference.

Actually run `cli.mjs check` and `build` into a fresh versioned directory. Confirm BUILD.json records the intended source-plan hash and the generated renderer imports the shared sampler. A SKILL.md edit or a separate demonstration is not an episode change. Do not fall back to the previous standalone compose.py generator while claiming this workflow was used.

Run repository npm test and npm run check after pipeline changes; exercise the real episode plan plus an independent tiny fixture. Inspect HyperFrames frames at speech/reveal/cut boundaries and phone size. Render and fully decode the final MP4; verify actual speech/caption/action sync, safe layout, final vote, audio coverage/levels and intentional silence. State limitations of ASR and unreviewed sound candidly. No paid calls, uploads, scheduler changes or publishing are implied.

Only `mall-v1` and the documented adapter channels are implemented. For a new scene/action, extend/test that adapter before promising support. A short representative proof may establish direction; never call it the completed whole episode.

For the user's clarified subtitle-only mall revision: use `captionTreatment: original-thai-pop` and per-caption `reveal` events through the actual builder. Restore original Thai font/palette/outline/position with no Thai background; preserve secondary English. Use `thaiUnits()` to retain combining marks/preposed vowels, reserve full line layout, and pop coherent units at reviewed word/syllable/token times. Do not estimate the whole phrase from character counts or claim exact per-character alignment. Inspect reference pixels and multi-frame encoded sequences. Preserve story/camera/audio and prior versions; verify unchanged plan fields and copied audio when only subtitles were requested.
