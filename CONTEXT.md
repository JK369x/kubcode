# kubcode

kubcode.dev is a Thai catalogue of AI video skills (animation styles and podcast shorts), the tools behind them, and articles.

## Language

### Catalogue

**Skill**:
One kit in the catalogue (an animation style, or a workflow such as cutting podcast shorts) with its description, requirements and preview examples.
_Avoid_: style card, template (when you mean the catalogue entry)

**Category**:
The one group a skill is filed under. Podcast skills have their own category (พอดแคสต์) and their own homepage section, apart from every cartoon/animation style.
_Avoid_: section, family (as a second grouping axis)

**Visual style** (แนวภาพ):
How a clip looks: its kit and renderer, such as Low-poly 3D or Stick SVG. Keys and Thai names come from the studio taxonomy (lib/taxonomy.json); the homepage shelf shows one card per visual style.
_Avoid_: style (alone), look, series

**Story format** (แนวเรื่อง):
How a clip's story is told: its script formula and tone, such as What If or Satire. Independent of the visual style: one format can use many looks and one look many formats.
_Avoid_: genre, series, style

**Use case**:
What a creator wants to make (การ์ตูนเล่าเรื่อง, คลิปสั้นจากพอดแคสต์, เสียงพากย์และซับไทย, ช่วยออกแบบแอป). The third homepage filter; the only one that reaches tools, which have no visual style or story format.

**Podcast short**:
A short vertical clip cut from someone else's podcast: the original speaker audio, reframed visuals and Thai captions, with credit to the source episode.
_Avoid_: recut (that is a different, overlay-only skill)

**Preview media**:
Example clips and posters shown on a skill's page. Governed by the media policy, separately from downloads.
_Avoid_: download, package

### Downloads

**Skill package**:
A versioned file of a skill's kit (instructions, scripts, references, licence) that a member can download. A skill has zero or more packages; most skills have none.
_Avoid_: template, ZIP, download (as a noun for the file)

**Package approval**:
The owner's clearance of distribution rights for one exact package version, with the licence and credit it must carry. A package without approval is never downloadable, whatever the account.
_Avoid_: rights cleared (that phrase also describes preview media)

**Download**:
One authorized request by a signed-in member for an approved package, answered with a link that works for about a minute.

**Download limit**:
The most downloads one member may make in a rolling 24 hours.

### Accounts

**Member**:
A signed-in, active user. Being a member is enough to download; there is no separate member approval yet.
_Avoid_: customer, approved member

**Creator**:
A member who publishes their own clips to their own YouTube or Instagram accounts through kubcode's posting tools. Any Thai creator may be one; no technical skill is assumed.
_Avoid_: user (too broad), customer

**Posting limit**:
The most a creator may use the posting tools during the free beta: scheduled posts per month, clip size, and how many posts may run an auto-reply. Creators share the kubcode apps' platform quotas, so every creator has one, paid or not.
_Avoid_: quota (that word is the platform's own limit on the kubcode app)

**Owner**:
The single account flagged as the site owner.

### Publishing

**Workspace**:
The unit that holds a creator's channels and is billed per channel. One creator owns one workspace for now.
_Avoid_: customer, profile (that is Zernio's word), team

**Channel**:
One social account on one platform inside a workspace, such as one YouTube channel or one Instagram account.
_Avoid_: account (ambiguous with the kubcode member account), profile

**Provider**:
Who carries out a capability for a channel: Zernio (phase 1) or kubcode's own integration (native).
_Avoid_: integration, vendor

**Connection**:
A channel's link through one provider. A channel can have one through Zernio and one native while it moves between them.
_Avoid_: token, linked account

**Post**:
What a creator wants published: one clip with its title, description, tags and designed cover.
_Avoid_: upload, schedule (as a noun)

**Delivery**:
One post going to one channel at one time. It is the thing that gets scheduled, cancelled, published or fails.
_Avoid_: job, publication

**Receipt**:
The record that a delivery went out: the platform's link, the time, and whether the platform shows our cover.

**Inbox item**:
A comment or direct message received on a channel.
_Avoid_: notification, event

**Automation rule**:
An instruction that reacts to inbox items, such as "a comment with this keyword on this post gets this DM".
_Avoid_: workflow (Zernio's word for its own flows), bot

## Relationships

- A **Skill** has zero or more **Skill packages**; each package version has at most one **Package approval**
- A **Download** is made by one **Member** for one approved **Skill package** version and counts toward that member's **Download limit**
- A showcase clip has exactly one **Visual style** and one **Story format**, both from its series; a style **Skill** declares at most one of each, tools declare neither
- **Preview media** and **Skill packages** are cleared separately: an approved package says nothing about the skill's clips
- A **Creator** owns one **Workspace**; a **Workspace** has many **Channels**
- A **Channel** has one or more **Connections**, at most one per **Provider**
- A **Post** has one **Delivery** per **Channel** it goes to; a published **Delivery** has one **Receipt**
- **Inbox items** and **Automation rules** belong to one **Channel**; a rule may target one **Post**'s delivery or every post

## Example dialogue

> **Dev:** "What If's catalogue entry still says rights uncleared — can members download it?"
> **Owner:** "That's the **preview media**. The **skill package** for What If 0.1.0 has its own **package approval** (MIT, credit FreshStack), so members can download it."

## Flagged ambiguities

- "style" meant both how a clip looks and how its story is told (the old shelf had "ถ้าเกิดว่า…" beside "Low-poly 3D"). Resolved (owner, 2026-11-10): **Visual style** and **Story format** are separate axes, filtered independently.
- "template" was used for both the skill page ("ดู template") and the downloadable kit — resolved: the downloadable thing is a **Skill package**; the page is the **Skill**.
- HANDOFF P2 "member approval" — resolved for downloads: any **Member** may download; member approval stays a separate future feature.
- "customer" in the two-phase publishing plan (2026-11-08) meant the person paying per channel. Resolved (2026-11-09): that person is a **Creator**, and what is billed is their **Workspace**'s **Channels**.
- "user" in the open-to-others plan meant two groups: technical people who run **Skill packages** with their own AI agent, and **Creators** who only post. Resolved (2026-11-05): the first outside audience is **Creators**, served by posting tools first; generating video for them is later.
