---
name: jk-shot-plan-v1
description: Plan and render an opt-in JK Soft Story window pilot from a validated structured shot plan.
---
# JK shot plan v1

Read repository AGENTS.md, DIRECTOR.md, TECHNIQUE.md, the selected JK Soft Story STYLE.md and `pipelines/shot-plan-v1/README.md`. This skill is an optional local pilot, not the default or an approved animation. Preserve the original style, voice, captions, source and outputs.

For a story suitable for the existing `jk-window` scene, draft a short concrete hook, development and turn. Pick visible actions supported by the scene; do not invent a visual action absent from the renderer. Write a JSON plan matching `pipelines/shot-plan-v1/schema.json`; use contiguous shot times, only supported camera/effect names, short Thai captions with a meaningful exact-match highlight and faithful smaller English captions. Narration comes first for spoken work: use actual measured audio duration and human-reviewed line boundaries; do not present guessed timings as word alignment. If no reviewed audio is supplied, omit audio and label the result silent. Do not replace the Thai narrator voice silently.

Run `node pipelines/shot-plan-v1/cli.mjs check <plan.json>` and repair any errors. Then build with a fresh slug; it refuses to overwrite. Render only after local scene and costs are understood, using the README command. Inspect multiple frames and the actual output; if supplied, listen to audio and check timing. Review storytelling, text legibility and framing with the user; a valid plan alone does not imply artistic approval. No LLM API, paid generation, publishing, or upload is implied.

This design adapts the explicit hook/beat, shot-to-caption and restrained camera ideas in the user's local Genhaha horror/map `SKILL.md` files. It does not import their code, proprietary assets, voice defaults or prompts. Full provenance and limitations are in `pipelines/shot-plan-v1/README.md`.
