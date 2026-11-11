# 0005 — The studio engine lives in this repo as `studio/`; media stays local

Status: accepted (2026-11-11, owner)

## Context

The video engine (`JK369x/jk-animation-studio`: styles, renderers/pipelines, Thai narrator, captions, covers) and this
web app are being consolidated into one repo (its ADRs 0001/0002: the AI Studio is a kubcode.dev feature, one repo,
creator media on Cloudflare R2 later). This repo is **public**; the engine repo was private.

## Decision

1. Import the engine as `studio/` by **plain file copy, without history**. The private repo keeps the history.
2. **No media in Git.** Example MP4s, the narrator reference WAV and samples, ElevenLabs audio, Pixabay SFX, third-party
   screenshots and the unlicensed reference kits (`growkaz-stickman`, `thai-survival`, `tool-reel-system`) live in the
   git-ignored `media/` folder (`studio/docs/media.md`). Studio tests and `check` pass without it.
   `tests/studio-public-tree.test.ts` blocks media, credentials, reference kits and files over 1.4 MB under `studio/`.
3. **Members-only kits are not in this repo.** `deep-sea-docs` (licence: kubcode members only, no redistribution) keeps
   its source in the private engine repo, which is therefore not archived. Only public-safe metadata may appear here.
4. ElevenLabs narration always uses the member's own voice, looked up by name (`ELEVENLABS_VOICE_NAME`); no voice id is
   shipped.
5. CI runs `npm --prefix studio test` and `npm --prefix studio run check` (no install, no media).
6. The skill slug `thai-jk-voice` is renamed `thai-narrator` (“Thai Calm Narrator”), with a permanent 301 from the old URL.

## Consequences

- `npm run showcase` reads styles from `studio/styles` and example videos from `media/studio-examples` by default.
- Proprietary downloadable packages need an upload path that does not read from this repo (follow-up PR).
