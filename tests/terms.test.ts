import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import Terms from "../app/terms/page";
test("public terms explain creator rights and link to privacy", () => {
  const html = renderToStaticMarkup(Terms());
  assert.match(html, /สิทธิ์/);
  assert.match(html, /TikTok/);
  assert.match(html, /href="\/privacy"/);
});
