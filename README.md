# kubcode — personal skill library

รับช่วงต่อ: อ่าน `HANDOFF.md` ก่อน — current status, remaining priorities, evidence และ personal-account boundaries.

## Current production — central accounts + Google/LINE linking (2026-11-03)

Live at `https://kubcode.dev/account`, deployment `dpl_2M8P5FcZv2ymhY1RUccvj9mzWMzN`. Personal Supabase Free project `sgtyrndczwxijrubyyjw` hosts the private account schema in us-east-1, colocated with Vercel iad1. Verified owner CLI login, Free organization, actual migration ledger, scoped non-superuser/non-BYPASSRLS runtime role, RLS policies and denial of anon/authenticated access. Hosted TLS verifies provider certificates/hostname; server TLS enforcement is enabled. Secrets are server-only Sensitive Production variables, never dotenv/source/client assets.

Central accounts are enabled: stable internal user IDs; explicit fresh source+target proof and final confirmation; no automatic email merging or transfer of already-owned identities; no removal of last usable method; link/unlink revokes earlier sessions. Ordinary logout still clears this browser only, not individually copied cookies; privacy copy states this and stored-data limits. Login/linking grants no membership approval, downloads, admin, credits or MCP access.

Verified:218unit/19real-local-PG/2local-media,32UI fixtures,14actual local Next production-server+PG checks, source-only Node22 build/types. Fresh canonical13routes/78states/9interactions/19private404,0errors/mediarequests; both actual production buttons initialize OAuth correctly with external navigation intercepted. Known generated DB credentials absent from3liveHTML/10JS assets. **Real Google/LINE consent, linking and logout with owner accounts remains pending**; fixtures/initialization are not that proof.

Start with one provider, then use `/account/settings` to link the other. Don't create a separate account by signing out and using the other provider before linking. Existing stateless cookies require fresh login after this rollout. Current evidence: `.qa/account-linking-live-release-receipt.json`, `.qa/account-linking-hosted-readback.json`, `.qa/account-linking-production-browser/report.json`. Remaining sections below are historical unless explicitly updated.

## Historical provider-only rollout — Google + LINE (2026-11-03)

Both sign-in buttons are now live at `https://kubcode.dev/account`, production deployment `dpl_6pXA1iUTDSjr3TV8446B5zDQYz78`. Personal Hobby ownership, production target and canonical alias were read back. The unchanged59-file publication-safe LINE source passed prior160unit/2local-media/23runtime/24fixture-browser gates and exact source hashes were rechecked before CLI deployment. No previews, credentials or dotenv were uploaded.

Actual production verification: provider API lists Google and LINE; both buttons enabled; both real browser SDK flows generated canonical callback/code/S256/state/nonce and secure cookies, with external consent navigation deliberately intercepted. LINE authorization uses the owner's supplied Channel ID. Fresh canonical public regression passed13routes/78states/9interactions/19private404,0errors/mediarequests. This proves deployment and initialization, **not completed real-user consent/callback/logout**. Real-account acceptance remains pending. A user already signed in should sign out to choose another provider; there is no account linking or automatic download/admin/MCP approval. No channel audience/publication or shared Google settings were changed.

Current evidence: `.qa/line-login-live-release-receipt.json`, `.qa/kubcode-live-release-receipt.json`, `.qa/line-login-production-init-report.json`, `.qa/line-login-production-browser/report.json`. Older local-only status below is historical.

Thai-first personal skill library. The **publication-safe site and Google web-login implementation are deployed at https://kubcode.dev** on the owner's personal Vercel Hobby project. Real-user Google consent/callback/logout acceptance is still pending. Persistent membership, approval, generation, real downloads and MCP are not implemented. Original local examples remain private and are not included in this deployment.

## LINE addition — local verified, not deployed (2026-11-03)

- Working-tree code supports Google and LINE independently. Missing/invalid LINE settings do not disable Google. LINE requests only `openid profile`, accepts a real identity without email, preserves SDK HS256/issuer/audience/expiry/nonce checks, and never merges identities by email. Legacy Google cookies migrate to a provider-tagged encrypted token; neither provider grants member/admin/download/MCP rights.
- Actual local gates:160 unit tests,2 local-media tests, Node22 clean source-only build/typecheck,23 real-library runtime checks using fictional channel/session data,24 fixture-browser account states (Google-only/LINE-only/both/LINE without email;375/768/1440;dark/light), plus13 public-stage routes/78 states/9 interactions/19 private404s. No runtime errors or private media requests. Parent viewed mobile enabled and LINE-no-email captures. This is not real LINE consent/login or a production deployment.
- Actual independent Claude source review: SHIP at code level, no Critical/High/Medium. Parent fixed provider-specific AccessDenied text after observed RED1failure→GREEN160 and removed the unused updateAge constant. Remaining: legacy-cookie cleanup after a future rollout, existing rolling-session/no-central-revocation limits, LINE button branding review and channel-side consent/settings checks before public launch. The text-only button is not claimed officially certified.
- Blocker: the owner did not answer whether a personally owned LINE Login channel exists. No channel was created, no LINE credential values were requested/read, and nothing was deployed or changed in the live Google release. Do not use an employer channel or Messaging API access token.
- Owner setup: LINE Login channel with Web app; callback `https://kubcode.dev/api/auth/callback/line`. Put Channel ID in `LINE_CLIENT_ID` and Channel secret in `LINE_CLIENT_SECRET` as server-only Vercel Production settings (Secret Sensitive), never chat/source/`NEXT_PUBLIC_*`. Preserve existing `NEXTAUTH_URL` and `NEXTAUTH_SECRET`. Developing mode limits who can sign in; audience/publication needs explicit owner confirmation, not automatic publishing.
- Evidence: `.qa/line-login-local-receipt.json`, `.qa/line-login-builder-report.md`, `.qa/line-login-security-review.md`, `.qa/line-auth-local-integration.json`, `.qa/line-login-browser/report.json`, `.qa/line-login-public-browser/report.json`. Sanitized59-file source `.qa/kubcode-line-login-source.zip`. Current live receipt stays the Google release; local LINE readiness is recorded separately.

## Google web login — deployed 2026-11-03

- `/account` uses Google-only `next-auth@4.24.15` with `openid email profile`, PKCE, state, nonce and verified-email checks. No new database or auth-vendor project was created. Google identity does not approve a member or enable downloads/MCP.
- Callback: `https://kubcode.dev/api/auth/callback/google`. Earlier conditional Supabase callback guidance does not apply to this direct flow. Preview/platform aliases redirect auth requests to the canonical domain; local builds without configuration show a disabled button.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` are server-side Vercel Production settings. Secret settings were verified as Sensitive by metadata only. Never put their values in chat, source, `NEXT_PUBLIC_*`, fixtures, logs or an uploaded dotenv file.
- Encrypted cookie sessions expose only name/email and expiry. Provider tokens are not retained in the JWT/session. Cookies are Secure, HttpOnly and SameSite=Lax. The 24-hour lifetime is rolling, **not an absolute cap**; logout clears this browser, not copied cookies/other devices. There is no central session revocation yet. `/privacy` describes the current data handling.
- Actual gates:120 passing unit tests,2 local-media tests, Node22 source-only build/typecheck and Vercel production READY. Sixteen local runtime checks use deliberately fictional credentials/JWE data and do **not** prove Google user login. Canonical browser QA passed13 routes/78 states/9 interactions/19 private-path checks,0 page errors and0 private media requests.
- The actual production button initialized Google's authorization redirect with canonical callback, minimal scopes, PKCE/state/nonce and secure cookies. External Google navigation was deliberately intercepted. The owner was asked to complete consent manually but did not respond; no real success/logout event was observed in the queried deployment logs. Do not report full Google end-to-end acceptance yet.
- Claude delivered the implementation and a separate source security review (SHIP, three Low findings). Parent disabled the unauthenticated `_log` proxy after a runtime RED200→GREEN404 regression, corrected privacy wording, removed inert JWT `updateAge`, and added a canonical Vercel-header test. The rolling-session limit remains an explicit residual, not a claim of absolute expiration/revocation.
- Current deployment: `dpl_6ZZFPGMdTaMeU9gbjFBxrNBQVXpR`. Evidence: `.qa/google-login-deployment-readback.json`, `.qa/google-login-production-initialization.json`, `.qa/google-auth-local-integration.json`, `.qa/google-login-remote-browser/report.json`. Sanitized58-file source archive: `.qa/kubcode-google-login-source.zip`. No DNS changes, paid infrastructure, private preview publication, commit or push were performed for this feature.

## Live frontend release — 2026-11-02

- Public build uses `NEXT_PUBLIC_MEDIA_MODE=licensed-only`; the approved-preview allowlist is currently empty. It shows an intentional rights-pending state rather than publishing unapproved posters/videos or fake replacement artwork.
- Deployed from a separate source-only stage:53 verified source/license files, no original previews, dotenv, QA logs, credentials or Git data. Tool-icon provenance/licenses and font licenses are preserved. Original files remain in `public/previews/` locally.
- Verified personal Vercel Hobby/Owner scope with isolated CLI config. **Do not use the default Vercel CLI context: it is an employer account.** Load the `kubcode-deployment` skill for the correct config/scope, staging and DNS procedure.
- Route53 apex A changed to provider-recommended values after checking the live deployment; NS/SOA/other records were unchanged. Public DNS, Vercel configuration and trusted HTTPS200 were read back. The old owned ngrok tunnel was closed and its absence verified.
- Actual release gates:88 unit tests,2 local-media tests, typecheck, source-only Node22 build and actual Vercel production build. Canonical-domain browser QA:12 routes/72 route states,9 interactions,19 private-path checks, no unapproved media requests or runtime errors. This is not GitHub CI or a performance benchmark.
- Evidence: `.qa/kubcode-live-release-receipt.json`, `.qa/public-release-remote-browser/report.json`, `.qa/kubcode-domain-https-verification.json`. Sanitized reproducible source archive: `.qa/kubcode-public-release-source.zip`.

## Private full-media visual revision — 2026-11-02

- One full-width kinetic work stage with actual artwork, bounded original-color tool marks, pause and reduced-motion/offscreen gates.
- No initial selected work and no always-open solitary Stickman player. Explicit selection opens the genuine preview; closing restores focus.
- Full-cover portrait catalog cards, compact overlaid title/actions, no purple matte or tall detached facts body. Native playback stays uncropped.
- Two covers are documented real source-video frames at4s (`lib/media-covers.ts`); original videos, posters, stable slugs and genuine source/author credits remain intact. These derivatives are local-only, not a redistribution grant.
- One truly disabled unavailable-download primitive shared between cards and detail pages: neutral on dark media, recessive light neutral on a light detail page. No purple dashed panel, fake enabled success or ZIP.
- `lib/status-labels.ts` is the shared Thai status-label source for cards, opened previews, detail pages and the style register. Source enums are unchanged; unknown values are not upgraded to ready.
- Purple/black dark and purple/white light page themes remain across catalog, detail, articles and account. Real vendor colors remain their own colors.

Claude implemented the media-card family and performed two independent pixel/source reviews. The first returned FIX; the second returned SHIP at **local-preview scope**, with two non-blocking follow-ups. Surface-aware light-detail unavailable styling and the shared Thai status map were subsequently implemented and checked with the targeted browser gate. This is not the user's creative approval or production sign-off.

## Run locally

```bash
npm ci --ignore-scripts
npm run dev
```

The app binds to `127.0.0.1:3040`. For an explicitly private full-media local production build, use `NEXT_PUBLIC_MEDIA_MODE=local-study npm run build`, then `NEXT_PUBLIC_MEDIA_MODE=local-study npm run start`. The public flag is inlined at build time: changing it only at runtime is not sufficient. Do not expose this private server or deploy the source root blindly. A publication-safe release must also physically exclude unapproved files in a separate stage; hiding media in UI does not prevent direct file access.

## Verification

### Source-only CI

```bash
npm test
npm run build
npm run typecheck
```

`.github/workflows/ci.yml` uses Node22 and `npm ci --ignore-scripts`. The source-only gate was reproduced with a separate clean dependency installation under Node22.23.4 on local macOS arm64, without `.env` or ignored private media. That is **not** an observed GitHub Ubuntu workflow run. The current Google-login release has120 passing unit tests; typecheck/build pass. Older private-media counts below are historical evidence, not a new run.

Earlier unit tests incorrectly depended on ignored private preview binaries and a `.qa` provenance file. Media-byte checks are now an explicit local gate; canonical licensed tool provenance is in `public/tool-icons/PROVENANCE.json`.

### Local private-media and real-browser gates

With the owner's actual local preview media present and the local server running:

```bash
npm run test:local-media
npm run test:browser
```

The strict media gate has2 passing tests, including actual image-header dimensions. Browser scripts are committed-source candidates under `tests/`, not only temporary `.qa` scripts:

- `project-visual-audit-browser.mjs`:12 routes, dark/light,1440/768/375px;72 route states plus6 catalog states. Requires actual decoded posters/nonzero natural dimensions, not just cover-sized empty boxes.
- `kinetic-hero-browser.mjs`:30 interaction cases including motion/pause/reduced-motion, actual author selection/playback/seek, search/filter, truthful no-media and fail-closed download behavior.
- `native-media-browser.mjs`:8 real default-video play/seek/pause cases in both themes. Totals are derived from catalog data; still-only and no-media entries are not counted as videos. These captures are explicitly after interaction, not untouched initial states.
- `shared-download-browser.mjs`:14 detail download cases plus2 opened-preview locale cases, measured label/state contrast and actual disabled controls.

Results and screenshots are in `.qa/project-visual-audit/`, `.qa/kinetic-browser-after/` and `.qa/download-consistency/`; the source-only reproduction is `.qa/source-only-ci-result.json`. No runtime page errors were observed in the final browser suite.

## Design source and evidence

- `PRODUCT.md`: product truth, user rejections, authorized scope and future requirements.
- `DESIGN.md`: current token-bearing design record. Four machine-readable heading sizes are CSS upper bounds; exact shipping `clamp()` expressions are retained in prose/sidecar metadata.
- `tokens.json`: actual Google DESIGN.md CLI DTCG export.
- `.impeccable/design.json`: current token/source record and7 unchanged primitive specimens. Rejected availability/card/download specimens are archived rather than represented as current. New hero/media/download families are source/token documented, not falsely claimed as standalone HTML exports.
- `.qa/redesign-documentation-results.json`:42 isolated checks of those7 primitive specimens in both themes/three widths, without the app global stylesheet or external requests.
- `.qa/final-media-review.md`, `.qa/final-media-review-v2.md`: independent Claude findings and the bounded local-preview verdict.
- `.qa/final-design-lint.json`:0 errors;19 advisory orphaned-token warnings remain. This is not a whole-site accessibility certificate.

## Honest functional boundaries

Seven catalog skills and the article routes use local metadata. Source videos/images are actual local samples; no unrelated art stands in for absent media. Thai Calm Narrator and Captions Overlay have no real preview media and say so.

Backend account/approval/download infrastructure is not connected. Downloads remain fail-closed (`503`) and visibly unavailable. No signup, approval, source-kit delivery, voice-provider validation, paid generation or API-key storage success is simulated. The API-key management page is a recorded requirement, not implemented functionality.

`public/previews/`, private kits, credentials, raw `.env` files and `.qa` logs are not for redistribution. Do not publish private media or deploy this as a working membership service without verified rights, owner-specific infrastructure, authentication, manual approval and backend authorization. Personal work must not inherit employer infrastructure merely because a CLI account is logged in.

The private media correction described above performed no deploy, commit, push or provider/billing action. Actual subsequent production releases are recorded in the dated sections at the top; Google login does not imply membership/backend or media-rights completion.
