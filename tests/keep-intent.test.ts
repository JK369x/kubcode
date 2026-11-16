// Keep-intent sign-in (UX audit P0-1): every signed-out account page sends
// the visitor to /account?next=<its own path>, and /account hands that path
// (checked again) to the sign-in buttons.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGES: [string, RegExp][] = [
  ["app/account/billing/page.tsx", /redirect\(signInPath\("\/account\/billing"\)\)/],
  ["app/account/channels/page.tsx", /redirect\(signInPath\("\/account\/channels"\)\)/],
  ["app/account/posts/page.tsx", /redirect\(signInPath\("\/account\/posts"\)\)/],
  ["app/account/posts/new/page.tsx", /redirect\(signInPath\("\/account\/posts\/new"\)\)/],
  ["app/account/channels/[id]/automations/page.tsx", /redirect\(signInPath\(`\/account\/channels\/\$\{id\}\/automations`\)\)/],
];

test("signed-out account pages redirect with ?next= to their own path; none to bare /account", () => {
  for (const [file, re] of PAGES) {
    const src = readFileSync(file, "utf8");
    assert.match(src, re, file);
    assert.doesNotMatch(src, /signed-out"\) redirect\("\/account"\)/, file);
  }
});

test("/account passes only a safeNext()-checked value to the form", () => {
  const src = readFileSync("app/account/page.tsx", "utf8");
  assert.match(src, /next: safeNext\(next\)/);
  const form = readFileSync("components/AccountForm.tsx", "utf8");
  assert.match(form, /startGoogleSignIn\(next\)/);
  assert.match(form, /startLineSignIn\(next\)/);
});
