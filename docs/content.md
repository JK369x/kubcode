# Writing articles and tool pages

Articles live in `content/articles/<slug>.mdx`, tool pages in `content/tools/<slug>.mdx`. The frontmatter schema is in `lib/content.ts`; `npm test` and `next build` fail on any problem and list every one. Covers: see [covers.md](covers.md).

## `agentInstall`: "ติดตั้งด้วย AI agent ของคุณ" (owner rule, 2026-11-11)

Every post that has a repo or is a skill bundle tells the reader how to install it **by pasting one prompt into their own AI agent**. The page shows a titled box near the top (articles: under the cover, before the first H2; tools: under the facts) with the agent badges, the prompt, a big "คัดลอก prompt" button, a note that the agent asks before running commands, and, for our download packages, a sign-in note. It is also the first TOC entry.

```yaml
agentInstall:
  agents: [claude-code, codex-cli]          # tool slugs under content/tools/ (checked)
  source: https://github.com/owner/repo     # or skill:<slug> for a package in lib/packages.ts
  prompt: |
    ช่วยติดตั้ง ... จาก https://github.com/owner/repo
    1. ก่อนเริ่ม อ่าน README แล้วอธิบายว่าจะติดตั้งอะไร ไว้ที่ไหน และขออนุญาตฉันก่อนรันทุกคำสั่ง
    2. เช็ก OS ... ถ้าเป็นระบบอื่นที่ไม่รองรับ ให้หยุดแล้วบอกฉัน
    3. <the real install commands from the upstream README>
    4. เช็ก <runtimes> แล้วสรุปว่าขาดอะไรพร้อมคำสั่งติดตั้ง
    5. ห้ามขอ API key ในแชต ...
    6. เสร็จแล้วบอกวิธีเริ่มใช้ แล้วรอ ...
```

### When it is required

- **Articles** whose `refs` include a kit tool (a tool page with `links.repo` **and** its own `agentInstall`) or a skill in `PACKAGES` (`lib/packages.ts`). The loader rejects them without it.
- **Tool pages** for repo-based skills, plugins and kits (today: make-short, elephant-goldfish-model, what-if-animation, tool-reel-system). Agents and apps such as Claude Code, Blender or FFmpeg have repos but are not kits; they get no prompt. `tests/agent-install.test.ts` pins both lists, so adding a page means updating it there.
- Concept articles with no kit or package refs (e.g. install-with-permissions) need none.

### Rules for the prompt

- One block, at most 1,200 characters, Thai instructions, the upstream repo URL (and `https://kubcode.dev/skills/<slug>` when it uses our package). If `source` is set, the prompt must contain it. Members-only kits (`PRIVATE_PACKAGES`, e.g. deep-sea-docs) have no public repo: `source: skill:<slug>` and the kubcode.dev page is the source.
- Copy commands and paths **from the upstream README as it is today**: fetch it, do not write from memory. Give each agent its own command when they differ.
- It must make the agent: explain what it will install and where; ask before running each command; never ask for API keys or passwords in chat (tell the user to set them in their own terminal or `.env`); stop and say so if the OS or agent is unsupported. The test checks for these phrases:
  `อธิบายว่าจะติดตั้งอะไร ไว้ที่ไหน`, `ขออนุญาตฉันก่อนรันทุกคำสั่ง`, `ห้ามขอ … key … ในแชต`, `ไม่รองรับ … หยุด`.
- Package-based (`skill:<slug>` or a kubcode.dev/skills link): the user signs in at kubcode.dev, downloads the zip, and the agent **asks for the path**; it never downloads for them.
- End by telling the user how to start (new session, the first command) and wait for their input.
- Use the same prompt on the article and on the tool page for the same kit.
