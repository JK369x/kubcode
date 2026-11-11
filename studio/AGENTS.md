# JK Animation Studio

Read README.md, DIRECTOR.md and TECHNIQUE.md, then the chosen styles/<id>/style.json and STYLE.md. Inspect the selected preview before drawing. Treat styles as reusable visual languages, not one fixed scene.

Preserve the distinction between draft, selected and retired. JK Soft Story v2 is selected for still visual direction only. Do not infer motion/audio/full-film approval from it.

Keep editable SVG source and stable named groups. Prefix SVG ids when composing multiple components. Use TECHNIQUE.md for the core HyperFrames contract and the optional official HyperFrames skills for full API guidance. Repository-local .agents/skills contains the Thai narrator entrypoint (thai-narrator); its reference WAV is local media (docs/media.md). Do not invent a replacement.

After code changes run npm test and npm run check. Regenerate gallery with npm run gallery when metadata changes. Inspect actual images after artwork changes. Do not import third-party reference screenshots as production assets or publish without a request.

## Product boundary: the AI Studio belongs on kubcode.dev (owner decision 2026-11-11)

The user-facing AI Studio (idea → brief → build clip → review → schedule/publish, plus calendar, channels and insights) is a feature of the kubcode web app (repo `JK369x/kubcode`, kubcode.dev), not of this repository. See docs/adr/0001-ai-studio-on-kubcode.md.

- This repository is the production engine and style source: styles, STYLE.md, style.json, renderers/pipelines, Thai narrator voice, captions and covers. It runs on the owner's Mac and is never deployed.
- `docs/studio-design-2026-10-29/createui-react/` is a design prototype with simulated data only. Use it as UI/flow reference; do not add real backends, auth, AI calls, payments or publishing to it, and do not grow it into a product.
- `gallery/` stays a local style picker for agents and the owner.
- Build new Studio screens, routes, auth, storage, jobs and billing in kubcode, following its own AGENTS.md, ADRs and Rust-for-backend rule. kubcode already owns accounts, channels, publishing (Rust Lambdas + Zernio) and secrets.
- Integrate through explicit contracts (exported style manifest, render job/artifact format, `kubcode` CLI), never by sharing a database, secrets or importing code across repositories.

## Inside kubcode (2026-11-11)

This tree is `studio/` in the **public** repo `JK369x/kubcode` (imported without history, kubcode ADR 0005). Treat every
committed file as published.

- Never commit media: MP4/WAV/MP3, voice references, third-party screenshots, reference kits. They live in the
  git-ignored `../media/` (`STUDIO_MEDIA_ROOT`); see docs/media.md. kubcode's `tests/studio-public-tree.test.ts` enforces it.
- `growkaz-stickman`, `thai-survival`, `tool-reel-system` (no upstream licence) and the members-only `deep-sea-docs`
  kit are not in this repo. deep-sea-docs' canonical source stays in the private repo `JK369x/jk-animation-studio`.
- Creator media storage is Cloudflare R2 only (no S3 for clips, no CloudFront). Owner clips/outputs stay local.
- ElevenLabs narration always uses the member's own voice resolved by name (`ELEVENLABS_VOICE_NAME`); never a hard-coded
  or default voice id. Keys only from env/.env, never printed. Dry-run first.
- Do not delete any checkout, clip or output folder without the owner confirming a verified copy exists.
- Windows/WSL2 setup: docs/pc-setup.md. What If vertical shorts: pipelines/what-if-host/README.md.

Social API tasks use the bundled youtube/instagram skills and Bun + Elysia in social-api/. Read social-api/README.md before calling a route. Select and verify the explicit account/channel first; never use a default profile. Credentials and account state are private, not shipped. Publishing needs an explicit request; production alone does not authorize it. Run npm run test:social for social API code changes.
