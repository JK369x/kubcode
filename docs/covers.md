# Article covers

Every article needs a cover (the content schema fails `npm test` and `next build` without one):

```yaml
cover:
  src: /covers/<slug>/cover.jpg   # ≥1200px wide, 16:9 (or exactly 1200×630)
  og: /covers/<slug>/og.jpg       # exactly 1200×630, used as the social card
  alt: "<Thai description of the image>"
  source: generated               # generated | own-clip | own-screenshot
```

We only use images we made: no third-party photos or screenshots (`NEXT_PUBLIC_MEDIA_MODE=licensed-only`).

## Generated covers (Codex imagegen)

`npm run cover -- <slug>` prints the steps, the exact `codex exec` command and the brief. The brief is filled from the article's title and description, with the kubcode visual direction shared by every cover. In short:

1. Codex generates `cover.jpg` (1600×900), `og.jpg` (1200×630) and `cover.json` (tool, date, full prompt, `source: generated`). It runs in its own git worktree under Codex's `workspace-write` sandbox.
2. **Look at every image yourself** before using it. Regenerate anything with text, logos, realistic people, artifacts, or colours outside the palette.
3. Copy `public/covers/<slug>/` into your branch, add the frontmatter above, remove the Codex worktree, then run `npm test`.

Keep `cover.json` next to the images: it is the provenance record.
