// Prints the Codex imagegen brief and command for one article's cover.
// Usage: npm run cover -- <article-slug>
// See docs/covers.md for the whole workflow (generate → review → wire up).
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const slug = process.argv[2];
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error("usage: npm run cover -- <article-slug>");
  process.exit(2);
}
const file = path.join("content", "articles", `${slug}.mdx`);
let fm: Record<string, unknown>;
try {
  const src = readFileSync(file, "utf8");
  fm = parseYaml(/^---\n([\s\S]*?)\n---/.exec(src)?.[1] ?? "") as Record<string, unknown>;
} catch {
  console.error(`not found: ${file} (write the article first, then its cover)`);
  process.exit(1);
}

const brief = `Task: generate one article cover illustration for the kubcode website with your built-in image generation tool, then save sized files plus provenance. Work only inside this repository checkout. Do not modify existing files. Do not commit, push or open a PR.

Article: ${String(fm.title)}
About: ${String(fm.description)}
Pick one clear central motif that says what the article is about.

## Output (exact paths)
Create public/covers/${slug}/:
- cover.jpg — 1600×900 (16:9) master, JPEG quality ~88, sRGB.
- og.jpg — 1200×630 crop of the master, main subject fully inside, JPEG quality ~88.
- cover.json — {"slug": "${slug}", "tool": "codex imagegen", "date": "YYYY-MM-DD", "source": "generated", "prompt": "<full prompt you sent>", "master": "cover.jpg", "og": "og.jpg", "width": 1600, "height": 900}
Resize/crop with sips to exact sizes; crop to aspect first, never stretch.

## Visual direction (must match the existing covers in public/covers/)
- Deep purple to near-black background (#100e15 / #2c1549 family), soft directional light, lavender accents (#bb98ff / #d1b9ff), a little warm highlight allowed.
- Editorial illustration: calm, slightly dimensional (soft 3D, frosted glass or layered paper), quiet negative space on the left third.
- NO text, letters or numbers. No real people or faces. No third-party logos, brands, product UI or screenshots. Do not imitate a named artist or studio.
- Look at the result; regenerate (max 3 attempts) if it has text, a logo, a realistic person, artifacts or breaks the palette.

## Verify
sips -g pixelWidth -g pixelHeight public/covers/${slug}/*.jpg && cat public/covers/${slug}/cover.json
Final message: paths, sizes, attempts, one sentence describing the image.`;

if (process.argv.includes("--brief-only")) {
  console.log(brief);
  process.exit(0);
}

const wt = `$HOME/.cache/codex-worktrees/kubcode-cover-${slug}`;
console.log(`# Cover brief for ${slug}

## 1. Generate (Codex, isolated worktree, sandboxed to that folder)
git worktree add -b codex/cover-${slug} "${wt}" origin/main
codex exec -s workspace-write -c approval_policy='"never"' -C "${wt}" -o /tmp/codex-cover-${slug}.md "$(npm run --silent cover -- ${slug} --brief-only)" < /dev/null

## 2. Review every image yourself (open cover.jpg and og.jpg); rerun if off-brand.

## 3. Copy into your branch and wire up
cp -R "${wt}/public/covers/${slug}" public/covers/
# frontmatter in ${file}:
# cover:
#   src: /covers/${slug}/cover.jpg
#   og: /covers/${slug}/og.jpg
#   alt: "<Thai description of the image>"
#   source: generated
git worktree remove --force "${wt}" && git branch -D codex/cover-${slug}
npm test   # the content schema checks the files, sizes and fields

## Brief
${brief}`);
