// Prints the Codex imagegen brief and command for one article's cover.
// Usage: npm run cover -- <article-slug> [--scene "<what Kub and Kode are doing>"]
// See docs/covers.md for the whole workflow (generate → review → wire up).
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { characterSheet, coverBrief } from "../lib/cover-brief";

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

const at = process.argv.indexOf("--scene");
const scene = at > 0 ? process.argv[at + 1] : undefined;
const brief = coverBrief({
  slug,
  title: String(fm.title),
  description: String(fm.description),
  scene,
  sheet: characterSheet(readFileSync(path.join("docs", "covers.md"), "utf8")),
});

if (process.argv.includes("--brief-only")) {
  console.log(brief);
  process.exit(0);
}

const wt = `$HOME/.cache/codex-worktrees/kubcode-cover-${slug}`;
console.log(`# Cover brief for ${slug}

## 1. Generate (Codex, isolated worktree, sandboxed to that folder)
git worktree add -b codex/cover-${slug} "${wt}" origin/main
codex exec -s workspace-write -c approval_policy='"never"' -C "${wt}" -o /tmp/codex-cover-${slug}.md "$(npm run --silent cover -- ${slug}${scene ? ` --scene ${JSON.stringify(scene)}` : ""} --brief-only)" < /dev/null

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
