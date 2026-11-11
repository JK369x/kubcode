# ตรวจแบบ JK Studio · 29 ต.ค. 2026

## Calendar prototype

Added `createui-react/src/Calendar.tsx` and `calendar.css`: mock Content records are separate from per-account Publication records. Filters cover YouTube STORY GRID, Running on Legacy, โลกอีกแบบ, Instagram @story.grids and combined view. Month, week and agenda views show local date/time, platform, account and text status; mobile presents an agenda. Date opens a draft editor, and simulated scheduling or rescheduling requires a separate account/date/time/timezone summary and confirmation. Editing/canceling before confirmation leaves the saved record unchanged. Mock records, content, filters and selected view are saved in browser session storage, never to a backend.

Browser verification: Instagram filter excluded YouTube; YouTube → Running on Legacy showed only that account, including its 1 November item in the October grid and November view. Week 25–31 October and agenda were checked. Simulated schedule confirmation showed exact account and Bangkok timezone; changed 12:00 to 13:00 and verified summary, then closed without confirmation and checked original 12:00 persisted. A different sample was confirmed and remained marked simulated after reload. Month button activated by Enter with visible focus. Mobile at 390px had no document-level horizontal overflow; calendar-mobile.png is a real screenshot. Browser console errors empty. Date-only arithmetic uses UTC dates as a neutral calendar representation and times are explicitly Bangkok local; no real provider-time conversion or daylight-saving behavior is claimed. Build passes; complete accessibility and provider tests remain open.

The visual direction is not finalized: user rejected the previous front end and the theme preference is pending. Current calendar inherits the existing preview theme solely to test structure and interaction. Free Create UI Button and Badge source remain in use; no Pro components were added.

## Actual Create UI React preview

`createui-react/` is a separate Vite/React/Tailwind v4 project. It uses actual unmodified free Create UI Button, Spinner and Badge source from https://createui.co/r/{name}.json. Source byte-for-byte matches the downloaded registry items; see LICENSE-CREATEUI.md for provenance and license. Official docs and dependency metadata were read before installing with `npm install --ignore-scripts`, with a temporary npm cache. No paid/Pro source was used. Native fields, stepper, app layout and theme are project-authored; no claim that those are imported Create UI components.

React preview build passed. Verified desktop flow: input error → idea → brief → edit script → simulated subtitle generation/loading → script change marks subtitle stale while preserving prior text → simulated preview error → review → schedule form → cancel → schedule with Bangkok timezone → reload preserving draft, stage and schedule. Buttons block repeated simulated work during loading; existing schedule rejects duplicate save. Enter on the stepper and visible focus checked. At 320px the document width matched viewport; screenshots createui-react-desktop.png and createui-react-mobile.png. Browser console error log empty. Vite reported `use client` directives ignored in its client-only bundle. Actual generation, billing, account connections and publishing are not implemented, and these checks are not a complete WCAG audit.

## Create UI redesign

The previous screen led with a dashboard rather than the job and required the user to discover the actual creation path. The revised preview starts on Idea → Brief → Build → Review, keeps style and worker context beside the task, groups settings in disclosure, and separates schedule confirmation from content creation. Stage fields, draft values and the simulated schedule are stored in this browser session; they are not saved to a server. A changed script marks completed dependent steps as requiring review.

Create UI documentation inspected: Introduction, Installation, Button, Field, Status Badge, Stepper, Prompt Input, color and spacing, and the official license. The standalone prototype has no React/Tailwind v4/Radix/CVA; those packages are absent in this repository. Therefore **zero actual Create UI React components are imported**. The preview adapts the documented native button, field, status and stepper interaction patterns in HTML/CSS; it is not a Create UI installation. Prompt Input is Pro and was not copied. The free code is MIT-style licensed with required attribution; use the real free components in a separate React/Tailwind implementation after inspecting dependency versions. No package or installer was run.

Browser checks: required-input error and recovery, simulated idea loading, select idea → edit brief → simulated subtitle generation → error/retry affordance → review → schedule, cancel schedule, simulated scheduling with Asia/Bangkok, reload preserving the brief and subtitle, script change marks subtitle stale while keeping its text, keyboard Enter and visible focus. Simulated generation disables its button while loading. At 320px, document width matched viewport; inspected screenshot. Screenshot files: createui-desktop.png and createui-mobile.png. Browser error log empty. This is not a complete accessibility audit: 400% zoom, all contrast pairs, screen-reader behavior, and full keyboard traversal still need validation in the implementation. Create UI source integration and all actual providers remain unimplemented.

## Impeccable redesign

The user rejected the original dashboard. Its equal-weight cards, decorative labels and generic headline hid the actual production task. The revised Operate-mode design uses a restrained dark editing desk, existing story artwork as a work item, direct idea action, compact project rows and a separate schedule rail. It removes the repeated icon tiles and most card borders; visual identity remains a proposal, pending user feedback.

Read Impeccable's official SKILL.md and new-work, operate, craft-floor, distill and polish guidance from github.com/pbakaus/impeccable. Context launcher and detector were not run because this task expressly excludes executing downloaded software; this was not a formal Impeccable critique or detector pass. No skill was installed. Desktop checked idea → brief → simulated production → schedule; Enter on Idea Lab navigated successfully and focus outline was visible. At 390×844 Idea Lab measured 390px document width and was visually reviewed. Browser error log was empty. Screenshots: dashboard-redesign.png and idea-mobile-redesign.png. Tests do not prove aesthetic approval.

## Idea Lab update

Added a mock Idea Lab and staged clip workflow. Desktop browser verified: select audience/topic → example ideas with hook/reason and explicit mock-source label → editable brief with chosen channel/style → production stages → simulate and regenerate a single stage. At 390×844, Idea Lab viewport and document widths both measured 390px and the page was visually inspected. The mock does not research, invoke models, generate media, spend, publish or create a real schedule. Subscription, worker availability, missing connections and paid-provider estimate are shown as illustrative states; real values remain unverified.

## Deliverables

- `PLAN.md`: Thai product/UX plan, session coverage, existing-vs-proposed capabilities, exact podcast extension files, scheduler/worker/data/API design, provider adapter boundaries and MVP acceptance criteria.
- `prototype.html`: seven-page responsive design preview. No backend, provider invocation, token handling, real schedule, upload or publish operation.
- `assets/`: copies of existing private study images with provenance in assets/README.md.
- `dashboard-preview.png`, `schedule-preview.png`, `mobile-preview.png`: screenshots of the local prototype for review. The schedule screenshot contains a synthetic sample, not a persisted production job.

## Repository baseline and final checks

Before and after creating this design directory:

- `npm test`: 5 pass, 0 fail.
- `npm run check`: both existing selected styles and all referenced assets pass.
- `npm run test:social`: 5 pass, 0 fail; fake transport only, no live account request.
- Final working tree: pre-existing `M styles/low-poly-urban/STYLE.md`; new untracked `docs/`. No commit, push, fetch, deploy, credential creation, real schedule change or publication.

## Prototype verification

- JavaScript syntax parsed with Node vm.Script.
- Opened actual page through a loopback-only static server on `127.0.0.1:3078`; served directory is this design folder only.
- Actual desktop screenshot inspected: navigation, task rows, old-project style images and schedule layout readable.
- Created a synthetic Podcast draft with source/brief; verified it appears in the Agent screen and says no model invocation.
- Selected Low-poly Urban from the style card; verified original-audio / Thai-translated captions switched to JK voice / Robot Terminal and Podcast source input was hidden.
- Created a Low-poly draft; verified Agent summary and attached style update to Low-poly Urban.
- Added a synthetic schedule for Instagram @story.grids at `2026-10-30 12:00 +07:00` with expire-and-notify behavior and required package/approval checkboxes. Read the resulting table: target/time/policy/status match. No backend receives it.
- Tested the create screen at 390×844: document width 390, viewport width 390; no page-level horizontal overflow; all images complete and naturalWidth > 0; inspected screenshot. Temporary viewport override reset afterward.
- Browser console error/warning log after interactions: empty.
- Refresh clears demo data, as labeled in UI.

Not verified: real scheduler durability, worker deployment, real Codex/Claude connection, account OAuth, live metrics, original source reuse rights, real publishing. These belong to implementation and provider-specific acceptance work in PLAN.md.

## Discovery limits

Seven discovered project/subfolder sessions read to end of returned pagination: 184 returned turns. The current session contributes an active turn with no message items. `list_threads` returns at most 50 recent threads and provides no cursor in available schema; no completeness claim for undiscovered hidden/older sessions or unreturned raw transcript bytes. Archived Codex inventory returned empty. Personal Context unavailable.

Supplementary inventory command `xirp session list --project ~/Documents/ChatGPT/webtest --all --limit 200 --json` first hit sandbox EPERM; the same read-only command retried with approved local-network access then returned ECONNREFUSED at localhost:49183. The daemon was not started or switched. Status: failed to read supplementary inventory; not an auto-review denial; no uncertain remote mutation. Supported thread-tool discovery and design completed independently.

The workspace dependency helper is unavailable to durable threads; no dependency installation was necessary. System Node/Bun/Python and the browser were sufficient for this design preview.
