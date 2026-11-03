# kubcode

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

### Current central-account production release — 2026-11-03

`dpl_2M8P5FcZv2ymhY1RUccvj9mzWMzN` READY and canonical owner/alias rechecked. Personal Supabase Free (`sgtyrndczwxijrubyyjw`) migrated; scoped server role/RLS denial and real verified TLS tested, Production secrets metadata verified. Central identity linking enabled, no approval/download/MCP grants.218unit/19SQL/32UI/14local-actual-Next checks and source-only build/types; canonical13routes/78states/9interactions/19private404,0errors/private requests; real production provider initialization passed, external consent intercepted. **Owner real-account linking/logout acceptance still pending.** Current `.qa/account-linking-live-release-receipt.json` supersedes older local-only and stateless release status below. No new spending or employer resources.


Current rollout update (2026-11-03): Google + LINE web-login code is now deployed together on `https://kubcode.dev/account`, personal production `dpl_6pXA1iUTDSjr3TV8446B5zDQYz78`. Live provider enumeration, both enabled buttons and both real-browser OAuth initializations passed; actual account consent/callback/logout is still not observed. Current `.qa/line-login-live-release-receipt.json` supersedes the earlier local-only deployment status. No LINE channel audience was published/changed and no membership/download/admin/MCP entitlement was enabled.

Confirmed frontend: Next.js + TypeScript. On 2026-11-02 the user accepted the staged free-first hosting direction: Vercel Hobby for the publication-ready personal frontend on `kubcode.dev`, and Cloud Run as the future Go/API/MCP hosting path when built; do not rent additional Lightsail now. Persistent DB/membership storage remains undecided; Google web identity now uses direct NextAuth as recorded in the release section below. Backend language/tool scope and deployment configuration still need implementation validation. This does not authorize enabling paid billing, using company accounts, publishing uncleared media or buying resources. AWS profile `default` presence does not establish personal account ownership.

## LINE addition — local verified, channel setup pending (2026-11-03)

The user requested LINE Login alongside Google. Claude implemented independent provider readiness, Google-only/LINE-only/both operation, no-email LINE sessions, provider+subject identity separation (no automatic linking), secure OIDC/PKCE/state/nonce, existing Google verified-email checks, backward-compatible Google cookies, honest independently disabled buttons and updated privacy copy. Parent verified160unit/2local-media/build/types,23 local runtime checks with fictional channel/session data,24 account fixture-browser states and13 public-stage routes/78states/19private404s. Independent Claude security review returned SHIP at code level; neutral AccessDenied text and unused updateAge export were corrected. No real LINE user or real channel secret was used, and public-button branding/channel consent still need launch checks.

The owner did not confirm a personal LINE Login channel, so this addition is **not deployed**. Do not infer ownership from a company provider or reuse Messaging API tokens. Need personal LINE Login Web app callback `https://kubcode.dev/api/auth/callback/line`, server-only `LINE_CLIENT_ID` (Channel ID) and Sensitive `LINE_CLIENT_SECRET` (Channel secret) in Vercel Production; preserve shared auth settings. No channel/project/DNS/billing/DB/cloud writes were made. The current live Google release/receipt remains unchanged. Source archive and local evidence: `.qa/kubcode-line-login-source.zip`, `.qa/line-login-local-receipt.json`.

## Google web-login release — 2026-11-03

Direct Google web login is deployed on the existing personal Vercel Hobby site: `next-auth@4.24.15`, Google-only openid/email/profile, PKCE/state/nonce, verified email, encrypted cookie session, and canonical `https://kubcode.dev/api/auth/callback/google`. The user confirmed a personal Google Cloud OAuth client and entered Google credentials into Sensitive server-side Production settings; no secret values were read into source/chat. DB/membership storage remains undecided, and no Neon/Supabase project, Cloud Run billing, Lightsail, DNS changes, membership approval, private downloads or MCP authorization were added.

Observed:120 unit tests,2 local-media tests, source-only Node22 build/typecheck, Vercel production READY,13 canonical routes/78 browser states/9 interactions/19 private404s,0 runtime errors/media requests. Sixteen runtime checks use fictional local credentials/session fixtures. The production browser button generated Google's real authorization redirect with the expected scopes, callback and secure cookies; navigation to Google was deliberately intercepted. The owner was asked to perform consent but did not respond; actual user consent/callback/session/logout acceptance remains pending, and no real auth-event success was observed in the queried logs. Do not turn fixture or initialization success into a claim of completed Google login.

The library's unauthenticated client-log endpoint is disabled. Sessions renew with a24h rolling lifetime, not an absolute cap, and logout clears only this browser; copied cookies/other devices cannot yet be centrally revoked. Google login gives no approval/admin/download/MCP rights. Before adding protected capabilities, design persistent authorization and stronger session/revocation policy separately. Evidence: `.qa/google-login-release-report.md` and `.qa/google-login-deployment-readback.json`; sanitized source archive `.qa/kubcode-google-login-source.zip`.

## Initial publication-safe frontend — 2026-11-02

The frontend is now published at `https://kubcode.dev` on the user-confirmed personal Vercel Hobby/Owner team, with trusted HTTPS200 and canonical-domain browser verification. The user confirmed AWS profile `default` is personal and authorized for this domain; only the intended apex A record in the existing matching Route53 zone was updated, with NS/SOA/other records preserved. No Lightsail, Cloud Run billing, database, auth backend or MCP server was created.

The user's publication choice is only verified-rights media. Every catalog skill is still `uncleared`, so no original preview media were uploaded. The release physically excludes all previews and uses an empty publication allowlist plus production-default-deny catalog/cover filtering. Public pages show rights-pending copy, not real playable samples or invented substitutes. The full-media local source remains intact; the owned temporary ngrok tunnel has been closed. Real signup/download/provider features remain unavailable/503.

Actual evidence:88 unit tests,2 local-media tests, typecheck, source-only Node22 build, actual Vercel production build and12 routes/72 browser states/9 interactions/19 private-path checks on the canonical origin. Source archive and receipts live under `.qa/`; see `.qa/kubcode-live-release-receipt.json`. Default Vercel CLI scope remains employer-related: use only the isolated personal config and explicit personal team scope recorded by `kubcode-deployment` for future changes.

## Users

Thai-speaking users discovering skills across categories and learning how to install/use them. Video is the leading category, not the entire product. Members download after administrator approval. The owner manages skills, articles, releases and member approvals.

## Product Purpose

A personal website collecting skills and articles, with actual examples, installation guidance and gated downloads. Success for the first UI slice: a visitor can find a skill, understand requirements, inspect a genuine example and understand the membership/download state.

## Capabilities and Constraints

- Public skills catalog, articles and detail pages.
- Free signup, then manual admin approval before downloads; email verification is distinct from approval.
- Membership states pending, approved and suspended; administrator privileges are separate.
- Actual downloads must use server-side authorization/private storage. A hidden button is not access control.
- AWS default and personal GitHub only. Cloudcommerce is a company-internal project: do not connect, modify, copy its data, reuse its credentials or use its budget.
- Local UI can proceed without personal Supabase credentials. Until connected, forms/downloads must say that they are not live rather than fabricate signup/approval/download success.
- Publish only skills and media with confirmed redistribution rights. Locally held commercial/private-study kits are not automatically distributable.
- No cloud render service, MCP subscription, billing or AI generation is part of this first website slice.

## Brand Commitments

The user wants their own UI identity, not a copy of Genhaha. The latest explicit palette overrides the original cobalt direction: **purple primary; dark theme purple/black; light theme purple/white**, with an actual dark/light theme switch. The user rejected the overall appearance of the implemented Media Atlas on 2026-11-02; its previous local technical/finish review is not user design approval. Redesign the overall composition and visual identity, not merely its colors. Genhaha is the user's quality benchmark, but the replacement must not closely copy it. Purple dark/light brand commitments remain. On 2026-11-02, after discussing an asymmetric real-work feature plus supporting previews and a media-led card library with tool icons, the user explicitly said “เริ่มทำสิ”, authorizing implementation of that redesign. This selects the proposed work-first composition, not final creative acceptance. In the redesign interview, the user chose real work examples as the first-viewport lead, so visitors want to try the skill. Their supplied screenshots highlight recognizable tool-logo chips and media-led rounded preview cards as liked treatments. Use these as reference principles, not copied cards, content, counts, or an identical composition. The user also supplied https://claude.ai/artifact/8bnV3cQH3ntDHWmeHsZg2N twice (one reference); its contents are not yet verified because browser access encountered a security challenge. Backend integration is not the next priority while this design decision remains open. Reference roles: videos.genhaha.com/skills for catalog/use/download organization; transitions.dev for deliberate interaction motion; impeccable.style/#slop for design craft/anti-template review; shader-effects-inc/shaders for actual shader implementation when useful. The user-approved website name is **kubcode**, spelled lowercase. Media Atlas is the superseded initial design direction, not the brand; its existing surface brief and DESIGN.md describe the incumbent implementation only until a replacement is selected. Domain registration and internal folder/repository renaming are not authorized by this naming decision.

## Latest visual correction — 2026-11-02

The user supplied a screenshot rejecting the current featured-card layout and clarified that tool icons must be real colored brand icons, not generic purple symbolic substitutes. Use sourced logo geometry and original brand colors where available; legitimate monochrome brands remain theme-legible, while APIs/concepts with no sourced brand mark use clearly functional icons rather than invented vendor logos. Keep upstream provenance and licenses. Refine the featured card to an intrinsic portrait-sized player, tighter title/description/tools grouping and an appropriately sized nearby action. On mobile, bring work identity/action near the player instead of after long provenance. Earlier local-preview SHIP does not override this explicit user rejection. Claude owns this corrective implementation.

## Catalog action correction — 2026-11-02

Replace the circular Play badge over catalog thumbnails with a full-card-width “ดาวน์โหลด skill” action below the media. Keep thumbnail preview interaction separate. This full-width request applies to catalog card actions, not the featured-detail CTA whose oversized width the user rejected earlier. Until download authorization/assets are configured and cleared, visibly state unavailable and do not fabricate download success.

## Descriptive skill naming — 2026-11-02

The user authorized replacing creator/person/upstream-branded public skill names with names describing the work, and delegated the choices. New display names: Stickman Cinema, Survival Stories, What If Lab, Soft Story, Soft Story Motion, Thai Voice, Midnight Stories and Map Stories. Low-poly Urban and Captions Overlay remain descriptive. Apply names consistently to catalog, style register and original explanatory articles, but preserve stable slugs/ids/media paths and truthful author, model, voice, source/license attribution. This is presentation naming, not a transfer of ownership or rights.

## Accepted free-first hosting direction — 2026-11-02

The user said “ok เอาตามนั้น” to the preceding staged hosting recommendation. Record this as an accepted direction, not a completed deployment: start the frontend on an eligible personal Vercel Hobby account when publication-ready; add the future Go/MCP container hosting only when needed; no additional Lightsail lease now. Do not silently interpret this as a choice between Neon and Supabase or permission to enable Cloud Run billing.

Read-only preflight found Vercel CLI available and authenticated, but no `.vercel/project.json` link and no Git remotes. Account ownership/use must be confirmed before linking or uploading source. Public nameservers for `kubcode.dev` are AWS DNS; this does not prove which AWS account owns the authoritative zone. No DNS or remote state was changed. Permanent publication scope/rights for local sample media remain unresolved; the earlier ngrok consent was temporary only. DB/Auth can stay unavailable in an honest frontend preview; finishing those features is not automatically a prerequisite for such a preview.

## Future MCP server and performance requirement — 2026-11-02

Confirmed by the user: kubcode must accommodate a future MCP server, with high performance a priority; they asked about Rust versus Go. This is a roadmap/design requirement, not authorization to implement/deploy a server, change DNS or spend money. Keep the existing Next.js frontend and primary domain `kubcode.dev`.

Recommendation, not selected implementation: one modular Go backend serving the application API and protected remote MCP via Streamable HTTP, with transport-specific handlers sharing business logic and authorization. Rust remains an option if team proficiency or measured CPU/memory/tail-latency requirements justify it; there is no kubcode benchmark establishing a fastest language. Initial search/catalog/download/external-voice-API tools are an assumption, not confirmed scope. Ask whether heavy processing runs locally or at a provider before locking the language/worker architecture.

Separate the backend process from Next.js without prematurely adding many microservices. Bound concurrency, deadlines, cancellation and database pools; evaluate region locality, cold/warm paths, query/API time, p95/p99 latency, throughput, memory and error rate under representative workloads. Long jobs may require a worker, but do not add a second language/queue/cache by default. Free/scale-to-zero economics and consistently low latency are a trade-off, not proof that paid infrastructure is required or approved.

Protected remote MCP needs an explicit authorization contract, discovery/resource metadata, token audience/scope validation and membership/tool permissions; ordinary Google browser login is not proof of MCP compatibility. Do not assume a candidate auth provider supports the required authorization-server features. Current protocol/SDK compatibility must be pinned and tested before implementation. No MCP server, benchmark, auth integration or deployment is claimed complete.

## Domain and Google sign-in configuration — 2026-11-02

The user reports registering `kubcode.dev` for this project. This replaces the proposed `kubcode.niznova.com`; it does not establish the registrar, DNS/HTTPS deployment, AWS account ownership or a connected auth backend. Canonical production origin is intended to be `https://kubcode.dev`.

The supplied screen is Google OAuth client creation, not DNS or voice API-key setup. Guidance follows the existing Supabase plan: website origins belong in Google Authorized JavaScript origins; the Google provider redirect must be copied from the actual personal Supabase project's callback URL, not guessed as a website callback. No personal project URL is known yet. Website Site URL and app redirect allowlist are separate Supabase settings. Ordinary member sign-in does not use the AI-agent client option. Client secrets stay in provider/server settings, not chat, client code or the repo. Google login remains unimplemented; no cloud/auth/DNS changes are claimed.

## Full-media catalog and consistency correction — 2026-11-02

The user's latest supplied screenshots reject the solitary always-open Stickman player, purple/dashed download treatment and letterboxed media inside oversized card bodies. Their competitor screenshot establishes the requested principle: video/poster artwork fills the complete card, with compact names/actions overlaid at the bottom and bounded original-color tool marks. This supersedes earlier contain/matte guidance for catalog covers only; actual native playback still preserves its full intrinsic frame. Never copy competitor media, pricing or download counts.

Implemented correction: no initial selected work or open standalone preview; explicit selection opens the genuine preview and a close action restores focus. Catalog uses full-cover portrait media, legibility scrims, compact metadata and a solid neutral unavailable-download action pair. No-media workflows remain honest. The user asked to inspect project-wide CI/design consistency, not to install another design skill or treat passing unit tests as proof of beauty. Source-only Node22 CI and local/private-media verification are separate gates; browser screenshots and a fresh independent visual review remain required. No deployment or hosted-CI success is implied.

## Kinetic hero redesign authorization — 2026-11-02

The user rejected the current hero again, explicitly authorized continuing with the already configured Stitch credential, requested a substantially redesigned cool hero with animation/motion so the website does not feel empty, and asked the agent to research modern live website references. This authorizes a bounded Stitch design exploration and local frontend implementation, not account upgrades, new subscriptions, website voice generation, deployment, credential publication or sending private project files/media to Stitch. The user said to proceed; choose and execute a coherent direction without another minor-choice interview.

Replace the incumbent portrait-player/facts-slab/two-supporting-portraits composition; do not keep it under new spacing or effects. Preserve brand purple-black and purple-white, real-work discovery, original-color tool marks, stable content/IDs/routes, actual author variants, catalog search/filter, honest disabled downloads and membership states. Motion must have one authored hero sequence, useful selection/hover feedback, a reachable pause for continuous effects, reduced-motion and offscreen/hidden behavior, stable layout, and no autoplay audio or scroll hijacking. The API-key ownership question remains unresolved and is not settled by this visual redesign.

## API-key management requirement — 2026-11-02

The user requires a dedicated API-key management page for workflows that need external providers, specifically ElevenLabs and Google AI Studio for voice generation. This is a confirmed product requirement, not an implemented connection or approval for paid generation. Decide ownership before implementing storage or generation: individual member keys (BYOK) versus administrator-managed shared credentials. BYOK is the proposed default, not yet user-approved.

Planned acceptance criteria:
- List supported providers and which workflows need each one; offer add, replace and remove actions, masked configured/not-configured status, and clear setup guidance.
- Show configured state separately from provider-verified state; never fabricate successful validation, available credits or working generation. A future connection check must clearly disclose whether it incurs usage; saving a key must not generate audio.
- Full credentials are write-only after submission and never returned by APIs, embedded in public client bundles, persisted in browser localStorage, or included in logs/analytics/errors. Use authenticated server-side operations, encryption at rest and ownership authorization; do not implement storage until the credential ownership model is selected.
- Explain external-provider costs; distinguish invalid or revoked credentials, insufficient permissions, exhausted quota/rate limits and provider failures without exposing secrets.
- Do not reuse Hermes/MCP credentials, administrator keys or company credentials as website-member credentials. Stitch connection credentials and website voice-generation credentials are separate integrations.
- Until secure storage/provider integration exists, show an explicitly unavailable state rather than claiming that keys were saved or generation works.

Claude reviewed the requirement and security/failure-state boundaries locally. No provider was called and no key was collected for this requirement review. Implementation and credential ownership remain open.

## Evidence on Hand

Existing personal video library has real GrowKaz and Thai Survival Claude/Codex samples and a FreshStack OpenCode/GLM example. These prove local examples exist; distribution rights have not been cleared for a public website. There are no verified website customer counts, download totals, testimonials or operational membership records; do not invent them.

## Product Principles

- Let real work demonstrate the skill before asking a user to download.
- Separate visual style, code author/model, renderer, voice and install requirements.
- Make eligibility and costs explicit; never imply that free membership makes external providers free.
- Maintain one owner for shared instructions; do not create duplicate skills to fill a catalog.
- Keep personal and company infrastructure separate.
