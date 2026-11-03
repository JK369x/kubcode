import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadContent } from "../lib/content";
import { renderMdx } from "../lib/mdx";

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Matches React's text escaping so headings with quotes compare correctly.
const escapeHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

test("every repo article and tool body compiles and renders its headings", async () => {
  const { articles, tools } = loadContent();
  for (const article of [...articles, ...tools]) {
    const html = renderToStaticMarkup((await renderMdx(article.body)).content);
    const headings = [...article.body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.ok(headings.length > 0, article.slug);
    for (const h of headings) assert.ok(new RegExp(`<h2 id="[^"]+" tabindex="-1"><a [^>]+>#</a>${escapeRe(escapeHtml(h))}</h2>`).test(html), `${article.slug}: ${h}`);
  }
});

test("external links in MDX open safely and internal links stay plain", async () => {
  const html = renderToStaticMarkup(
    (await renderMdx("[ต้นทาง](https://example.com/a) และ [เครื่องมือ](/tools/opencode)")).content,
  );
  assert.match(html, /<a href="https:\/\/example.com\/a" rel="noopener noreferrer" target="_blank">ต้นทาง<\/a>/);
  assert.match(html, /<a href="\/tools\/opencode">เครื่องมือ<\/a>/);
});
