# 0001 — The AI Studio is a kubcode.dev feature; this repo is the engine

Status: accepted (2026-11-11, owner)

> Update 2026-11-12: the createui-react prototype (`docs/studio-design-2026-10-29/`) and the local `gallery/` were removed (owner decision: no UI in studio/; all UI work is on kubcode.dev). Git history keeps them.

## Context

- `docs/studio-design-2026-10-29/createui-react/` is a React prototype of a clip studio
  (idea → brief → build → review → schedule, calendar, channels, insights). It uses simulated
  data only: no AI calls, no real jobs, no auth, no publishing.
- `docs/studio-design-2026-10-29/PLAN.md` proposed growing this repository into a web-controlled
  studio with the Mac as worker.
- Meanwhile the kubcode web app (`JK369x/kubcode`, kubcode.dev) already has what a real studio
  needs: Google/LINE accounts, workspaces, channel connections, scheduled publishing and comment
  automations (Rust Lambdas + Zernio), KMS-sealed member secrets, S3 media, Postgres, CI/CD to
  Lightsail and AWS, and a planned per-channel billing model.
- Building a second product surface here would duplicate accounts, secrets, publishing and
  deployment that kubcode already owns.

## Decision

1. **The user-facing AI Studio lives on kubcode.dev.** New Studio screens, routes, auth, storage,
   job orchestration, quotas and billing are built in the kubcode repo, following its AGENTS.md,
   ADRs, and its rule that backend services are Rust.
2. **This repository is the production engine and style source.** It keeps styles (`styles/<id>/`
   with `style.json` and `STYLE.md`), renderers and pipelines (HyperFrames, Three.js/GSAP,
   FFmpeg), the Thai narrator voice, captions and covers. It runs on the owner's Mac and is not deployed.
3. **The React prototype stays a design reference.** Use it for flows and screens when designing
   the kubcode Studio. Do not add real backends, auth, AI calls, payments or publishing to it.
   `gallery/` stays a local style picker.
4. **Integrate only through explicit contracts.** Examples:
   - a style manifest exported from `styles/*/style.json` (id, Thai/English name, status,
     version, rights, preview) that kubcode reads instead of copying status by hand;
   - a render job/artifact format (input plan → MP4, cover, captions, receipt) that a worker
     produces and kubcode stores in its S3 `clips/` prefix;
   - the existing `kubcode` CLI (`push`, `schedule`) for handing finished clips to publishing.

   No shared database, no shared secrets, no cross-repo code imports.

## Consequences

- `PLAN.md`'s "grow this repo into the web studio" direction is superseded. Its research (session
  findings, channel needs, podcast rules) still informs the kubcode Studio design.
- Where generation runs (owner Mac worker vs hosted) is decided in kubcode; see kubcode's
  `docs/research/hosted-generation-cost-2026-11-06.md`. Hosted generation needs quotas and billing
  first because kubcode has no payment system yet.
- Style status shown on kubcode must come from this repo's manifest, so the draft / selected /
  retired distinction is not lost or duplicated.
- The kubcode repo should record the matching decision in its own ADR before Studio work starts.
