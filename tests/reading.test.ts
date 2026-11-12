import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { headingId, renderMdx } from "../lib/mdx";

const SOURCE = `## เริ่มต้น

ข้อความ

### ติดตั้ง Node

\`\`\`bash title="check.sh"
node --version # comment
\`\`\`

## เริ่มต้น

## Tools & "quotes"

\`\`\`
## not a heading
\`\`\`
`;

test("the TOC lists h2 and h3 in order with unique ids that match the rendered anchors", async () => {
  const { content, toc } = await renderMdx(SOURCE);
  assert.deepEqual(toc, [
    { depth: 2, id: "เริ่มต้น", text: "เริ่มต้น" },
    { depth: 3, id: "ติดตั้ง-node", text: "ติดตั้ง Node" },
    { depth: 2, id: "เริ่มต้น-2", text: "เริ่มต้น" },
    { depth: 2, id: "tools-quotes", text: 'Tools & "quotes"' },
  ]);
  const html = renderToStaticMarkup(content);
  for (const { id } of toc) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /<h2 id="เริ่มต้น" tabindex="-1"><a class="anchor" href="#เริ่มต้น"/);
});

test("heading ids keep Thai letters and marks and drop punctuation", () => {
  assert.equal(headingId("คำว่า \"ฟรี\" มีเงื่อนไข"), "คำว่า-ฟรี-มีเงื่อนไข");
  assert.equal(headingId("  OpenCode + GLM-5.3  "), "opencode-glm-53");
});

test("code blocks are highlighted on the server with a language label, filename and copy button", async () => {
  const html = renderToStaticMarkup((await renderMdx(SOURCE)).content);
  assert.match(html, /class="code-block"/);
  assert.match(html, /<span class="code-lang">bash<\/span>/);
  assert.match(html, /<span class="code-file">check\.sh<\/span>/);
  assert.match(html, /<\/figcaption><div class="code-body"><button[^>]*data-slot="button"[^>]*class="[^"]*\bcode-copy\b[^"]*"[^>]*aria-label="คัดลอกโค้ด"[^>]*><svg[^>]*lucide-copy/);
  assert.match(html, /--shiki-dark:/, "dual-theme token colours");
  assert.match(html, /# comment/);
  // A fence without a language still gets the card, labelled as plain text.
  assert.match(html, /<span class="code-lang">text<\/span>/);
});

test("blockquotes render as callouts", async () => {
  const html = renderToStaticMarkup((await renderMdx("> หมายเหตุสำคัญ")).content);
  assert.match(html, /<blockquote class="callout">/);
});
