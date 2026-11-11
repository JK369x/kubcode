# 0002 — One repo (kubcode), one local file store, R2 for creator media later

Status: accepted (2026-11-11, owner) · Extends 0001 (AI Studio on kubcode) · Amended 2026-11-11 (below)

> **Amendment (2026-11-11, owner):** kubcode is a **public** repo. The import was a plain file copy (no history, not
> `git subtree`). Voice references, example MP4s, licensed SFX, third-party screenshots and the reference-only kits stay
> in the git-ignored `media/` (see `studio/docs/media.md`), not in Git — this replaces "voice tracked under
> `studio/shared/voice` (kubcode is private)" below. `deep-sea-docs` is a members-only proprietary kit: it is **not**
> in kubcode; its canonical source stays in the private `JK369x/jk-animation-studio`, which is therefore **not
> archived** (step 8 is on hold for that repo).

## Decisions

| # | Decision |
|---|---|
| D1 | **Object storage for creator media is Cloudflare R2**, alone. No S3 for clips, no CloudFront in front of it. S3 stays only for what already needs AWS IAM (Pulumi state, skill packages, Lambda-only paths) until each is moved. Reason: R2 has no egress fee; S3 and CloudFront both charge $0.12/GB in Asia. |
| D2 | **kubcode (`JK369x/kubcode`) becomes the single repo.** This repository (`jk-animation-studio`) is folded into it as `kubcode/studio/`, then archived. |
| D3 | **Exactly one local copy of everything.** The duplicate checkout at `~/Documents/ChatGPT/webtest/jk-animation-studio` is merged and removed. |
| D4 | **Owner clips and render outputs stay on the owner's Mac** for now, inside the kubcode checkout but git-ignored. They are not uploaded to R2 or S3 yet. |
| D5 | **Owner media moves to R2 last**, through the same upload path creators use, once the Studio, quotas, retention and R2 integration are built. The owner is customer #1, not a special case. |

## Target layout (one place)

```text
~/work/kubcode/                  ← the only repo and the only checkout
  app/ components/ lib/          web (existing) + AI Studio (new)
  services/ infra/ db/           Rust Lambdas, Pulumi, migrations (existing)
  packages/                      distributable skill kits (existing)
  studio/                        ← from jk-animation-studio (tracked)
    styles/ formats/ pipelines/ shared/{voice,captions,covers}/
    gallery/ scripts/ tests/ visual/ voice-mcp/ rust-mcp/ social-api/
  media/                         ← git-ignored, local only (D4)
    clips/                       ← was ~/Studio/clips   (2.6 GB, 63 clips)
    work/                        ← was ~/Studio/work    (in-progress projects)
    outputs/                     ← was jk-animation-studio/outputs (8.7 GB, to be pruned)
    archive/                     ← old ChatGPT/webtest media still worth keeping
```

kubcode's `.gitignore` gains `/media/` (and keeps its existing `*.mp4`, `*.zip` rules). Tools that read `~/Studio/clips` keep working through env, not code changes: the `kubcode` CLI reads `KUBCODE_STUDIO`, and `npm run showcase` reads `SHOWCASE_STUDIO_ROOT` / `SHOWCASE_STYLES_ROOT`. Point them at `media/clips` and `studio/styles`, then change the defaults in a later PR.

## Inventory today (2026-11-11)

| Location | Size | What | Fate |
|---|---|---|---|
| `~/work/ai-video/jk-animation-studio` | 10 GB (8.7 GB `outputs/`) | primary checkout, 16 modified + 26 untracked paths | merge base → `kubcode/studio/` |
| `~/Documents/ChatGPT/webtest/jk-animation-studio` | 4.9 GB (3.1 GB `outputs/`) | duplicate checkout, same HEAD `922e681`; only it has `styles/deep-sea-docs`, `styles/tool-reel-system`, extra `shared/voice/assets` | merge unique files in, then delete |
| `~/Studio/clips` | 2.6 GB | finished-clip library (`video.mp4`, `cover.jpg`, `captions.srt`, `clip.json`) | move → `kubcode/media/clips` |
| `~/Studio/work`, `~/Studio/tools` | 386 MB | in-progress projects; `clip-migrate`, `clip-board.py` | `media/work`; tools → `studio/tools` (tracked) |
| `~/Documents/ChatGPT/webtest/00-คลังงาน-AI`, `videos/` | 8.2 GB + 2.7 GB | original sources the clips were migrated from | review; keep needed originals in `media/archive`, drop the rest |
| `~/work/ai-video/{research,tools,make-short-test,ai-prompt-journey}` | small | side projects | decide per folder |

## Plan (each step reversible until the last; nothing deleted before a verified copy exists)

1. **Freeze and back up.** Commit and push all work in the primary checkout to a branch. Take a local backup (e.g. Time Machine or a `tar` of both checkouts excluding `node_modules`, `.venv`, `outputs`).
2. **Merge the duplicate.** Copy files that exist only in `~/Documents/.../jk-animation-studio` (deep-sea-docs, tool-reel-system, voice assets, their tests) into the primary checkout; for the 291 paths dirty in both, diff and keep the newer intent. Run `npm test` and `npm run check`. Push.
3. **Clone kubcode locally** to `~/work/kubcode` (it is not checked out today).
4. **Import with history.** `git subtree add --prefix=studio <jk-animation-studio> <branch>` in kubcode, on a PR branch. Keep the tracked `demo.mp4` examples as Git LFS or move them under `media/`; never put unlicensed kits (growkaz-stickman, thai-survival) under `public/` or `packages/`.
5. **Make studio work inside kubcode.** Fix paths in `studio/scripts`, add `studio` npm scripts (or a workspace), wire `showcase` to `studio/styles`, and generate kubcode's style taxonomy/registry from `studio/styles/*/style.json`. Add CI for `studio` tests. Update both AGENTS.md files.
6. **Move local media into `kubcode/media/`** (git-ignored) and set `KUBCODE_STUDIO`, `SHOWCASE_STUDIO_ROOT`. Verify `kubcode push --dry` and `npm run showcase` still find everything.
7. **Prune.** Delete `outputs/` items already represented in `media/clips`; review `ChatGPT/webtest` originals into `media/archive` or delete.
8. **Retire.** Delete both old checkouts, archive `JK369x/jk-animation-studio` on GitHub (read-only, not deleted).

Later, separate project (D5): R2 bucket via Pulumi, presigned upload/view in the Rust Lambdas, `media_assets` per workspace, quotas and retention; then upload `media/clips` through that path.

## Resolved (2026-11-11, owner)

- **growkaz-stickman, thai-survival:** not our styles. They are unlicensed upstream kits kept only as private
  visual references (`availability: "reference"` in `style.json`, banner in `STYLE.md`). Our own looks are
  `visual/stickman-canvas` and `visual/flat-room`. When moving into kubcode they go under `studio/` like other
  styles but must never reach `public/`, `packages/`, a release tarball or any R2 creator-facing path; a kubcode
  test should enforce that (kubcode already denylists both slugs for downloads).
- **Thai narrator voice:** tracked under `studio/shared/voice` (kubcode is private). Renamed from "เสียงไทย JK" to
  **ผู้บรรยายไทย สุขุม / Thai Calm Narrator**; skill `thai-jk-voice` → `thai-narrator`; sample `jk-sample.wav` →
  `narrator-sample.wav`; env `JK_MODEL_PATH` → `NARRATOR_MODEL_PATH` (old name still read). The voice id
  `approved-calm-male-v1`, reference WAV and checksum are unchanged, and old names stay as aliases. kubcode's catalog
  still uses the slug `thai-jk-voice` (`tests/toolchips.test.ts`, content refs); rename it there in the import PR.
