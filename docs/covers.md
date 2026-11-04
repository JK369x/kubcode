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

## Look: cartoon, with our two mascots

Covers are friendly flat-colour cartoons, not glossy 3D, glass or neon. Every cover shows our two original mascots, Kub the cat and Kode the dog, doing the article's real activity (animating a clip, unpacking a toolbox, stacking layers…). Purple is only an accent.

**Brand rule:** never draw a third-party logo, product mascot or app UI into a generated image. Real tool logos appear only as the UI icon row on article cards and headers, which uses the maker's own files from `public/tools/`.

The character sheet below is pasted into every prompt by `npm run cover`. Edit it here only. `docs/covers/mascots.png` is the drawn reference (provenance in `mascots.json`); give it to the image tool with every cover so the mascots stay identical.

<!-- character-sheet:start -->
MASCOTS (original kubcode characters; draw them identically every time):
- Kub, the cat: small, round, cream-white short-haired cat with one ginger-orange patch over the left ear and eye, and a ginger tip on a short tail. Big round black eyes with a white glint, tiny pink triangle nose, short whiskers. Wears a lavender (#b48cff) knitted scarf. Curious and focused: Kub does the hands-on work.
- Kode, the dog: medium-small sandy-tan mixed-breed dog with floppy dark-brown ears, a white muzzle, chest and paws, and a curly tail. Friendly open-mouth smile. Wears a mustard-yellow collar with a round blank tag. Cheerful and helpful: Kode assists.
- Both: chunky simple shapes, about three heads tall, same proportions, colours and accessories on every cover. Kode stands about one head taller than Kub.
STYLE: friendly hand-drawn cartoon, flat colour with slightly uneven dark-brown ink outlines (#3a2a24) and a subtle paper grain. Warm palette: cream paper background (#f7efe2), peach, mustard, sage green, soft brown; purple only as a small accent (Kub's scarf plus at most one prop). NOT glossy, NOT 3D, no glass, no neon, no glow, no gradients. Simple props, generous empty space.
<!-- character-sheet:end -->

## Generated covers (Codex imagegen)

`npm run cover -- <slug> --scene "<what Kub and Kode are doing>"` prints the steps, the exact `codex exec` command and the brief. The brief carries the title, the description, the scene, the character sheet and the brand rules. Without `--scene`, it asks for the mascots doing the article's real activity.

1. Codex generates `cover.jpg` (1600×900), `og.jpg` (1200×630) and `cover.json` (tool, date, full prompt, `source: generated`). It runs in its own git worktree under Codex's `workspace-write` sandbox.
2. **Look at every image yourself** before using it. Regenerate anything that is glossy or 3D, has text, logos or real people, or where Kub and Kode don't match the reference sheet.
3. Copy `public/covers/<slug>/` into your branch, add the frontmatter above, remove the Codex worktree, then run `npm test`.

Keep `cover.json` next to the images: it is the provenance record.
