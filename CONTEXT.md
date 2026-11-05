# kubcode

kubcode.dev is a Thai catalogue of AI animation styles ("skills"), the tools behind them, and articles.

## Language

### Catalogue

**Skill**:
One animation style in the catalogue, with its description, requirements and preview examples.
_Avoid_: style card, template (when you mean the catalogue entry)

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

## Relationships

- A **Skill** has zero or more **Skill packages**; each package version has at most one **Package approval**
- A **Download** is made by one **Member** for one approved **Skill package** version and counts toward that member's **Download limit**
- **Preview media** and **Skill packages** are cleared separately: an approved package says nothing about the skill's clips

## Example dialogue

> **Dev:** "What If's catalogue entry still says rights uncleared — can members download it?"
> **Owner:** "That's the **preview media**. The **skill package** for What If 0.1.0 has its own **package approval** (MIT, credit FreshStack), so members can download it."

## Flagged ambiguities

- "template" was used for both the skill page ("ดู template") and the downloadable kit — resolved: the downloadable thing is a **Skill package**; the page is the **Skill**.
- HANDOFF P2 "member approval" — resolved for downloads: any **Member** may download; member approval stays a separate future feature.
- "user" in the open-to-others plan meant two groups: technical people who run **Skill packages** with their own AI agent, and **Creators** who only post. Resolved (2026-11-05): the first outside audience is **Creators**, served by posting tools first; generating video for them is later.
