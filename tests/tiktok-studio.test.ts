import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Composer from "../app/account/tiktok/composer";
test("member can review the optional data access before choosing how to connect", () => {
  const html = renderToStaticMarkup(createElement(Composer, { failed: false }));
  assert.match(html, /aria-describedby="profile-permissions"/);
  assert.match(html, /id="profile-permissions"/);
  assert.match(html, /โพสต์อย่างเดียว/);
});
