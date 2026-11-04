// Builds the Codex imagegen brief for one article cover (npm run cover).
// The mascot character sheet is read from docs/covers.md so it lives once.

const START = "<!-- character-sheet:start -->";
const END = "<!-- character-sheet:end -->";

/** The character sheet block from docs/covers.md. */
export function characterSheet(docs: string): string {
  const a = docs.indexOf(START);
  const b = docs.indexOf(END);
  if (a < 0 || b < a) throw new Error("docs/covers.md has no character sheet block");
  return docs.slice(a + START.length, b).trim();
}

export function coverBrief(input: { slug: string; title: string; description: string; scene?: string; sheet: string }): string {
  const { slug, title, description, scene, sheet } = input;
  return `Task: generate one article cover illustration for the kubcode website with your built-in image generation tool, then save sized files plus provenance. Work only inside this repository checkout. Do not modify existing files. Do not commit, push or open a PR.

Article: ${title}
About: ${description}
Scene: ${scene ?? "Kub and Kode doing the article's real activity; pick one clear moment that says what the article is about."}

${sheet}

## Reference
Use docs/covers/mascots.png as the visual reference for both mascots (pass it to the image tool as an input image if it accepts one). Kub and Kode must match it: same colours, markings, proportions and accessories.

## Brand rules
- No third-party logos, brand marks, product mascots, app icons or recognisable app UI anywhere in the image (laptops and screens show only simple shapes or blank colour).
- No text, letters, numbers or readable code. No real people. Do not imitate a named artist or studio.
- Cartoon only: flat colour and ink outlines, NOT glossy, NOT 3D, no glass, neon or glow.

## Output (exact paths)
Create public/covers/${slug}/:
- cover.jpg: 1600×900 (16:9) master, JPEG quality ~88, sRGB. Keep the mascots and props inside the central 80% of the height so a 1200×630 crop keeps everything.
- og.jpg: 1200×630 crop of the master, main subject fully inside, JPEG quality ~88.
- cover.json: {"slug": "${slug}", "tool": "codex imagegen", "date": "YYYY-MM-DD", "source": "generated", "prompt": "<full prompt you sent>", "reference": "docs/covers/mascots.png", "master": "cover.jpg", "og": "og.jpg", "width": 1600, "height": 900}
Resize/crop with sips to exact sizes; crop to aspect first, never stretch.

## Check before finishing
Look at the result. Regenerate (max 3 attempts) if it looks glossy or 3D, has text or a logo, or if Kub or Kode differ from the reference.
sips -g pixelWidth -g pixelHeight public/covers/${slug}/*.jpg && cat public/covers/${slug}/cover.json
Final message: paths, sizes, attempts, one sentence describing the image.`;
}
