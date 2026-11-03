# Acceptance — first local UI slice

## Confirmed scope

- Personal app, no Cloudcommerce/company integration.
- All skill categories + articles; video featured.
- Next.js + TypeScript; user approved Media Atlas.
- Free membership; manual admin approval before downloads.

## Observations required before calling the UI complete

1. Actual local HTTP page loads at desktop 1440 and mobile 390; no unexpected horizontal overflow or clipped Thai labels.
2. Search filters real metadata, category selection changes the results, empty search state is useful and keyboard accessible.
3. Selecting an artifact changes its actual poster/video/factual panel; Claude/Codex switch appears only for true paired examples and changes the media source.
4. Skill detail and article routes are navigable and contain real prose, prerequisites/version and explicit rights status.
5. Account/signup UI clearly identifies the unconnected personal Supabase backend. It must not pretend login, approval or download occurred.
6. Download authorization tests reject no-session, pending, suspended, rights-not-cleared and backend-not-configured cases. UI-only states are not real auth integration evidence.
7. Shader is actual npm component code, not a screenshot/lookalike; inspect real WebGPU behavior where available, plus fallback and reduced motion. Lack of WebGPU in the browser under test is a named test limitation.
8. No public marketing claims built from made-up user/download counters or testimonials.
9. Real tests/typecheck/production build succeed. Rendered browser inspection, independent finish review and design documentation are separate gates.
10. Shipping media carry source/provenance and local-preview/non-cleared distribution labels. No skills ZIP is published automatically.

## Explicitly not done by this slice

Personal Supabase account/project creation, Auth email delivery, real member approval/storage/download, production security testing, AWS deployment, domain, paid subscriptions, remote GitHub creation/push. Those require separately observed work and any relevant authorization.
