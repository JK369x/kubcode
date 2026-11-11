import { test } from "node:test";
import assert from "node:assert/strict";
import { RENAMED_SKILLS, skills } from "../lib/catalog";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = (require("../next.config") as { default: import("next").NextConfig }).default;

test("renamed skill slugs 301 to a live skill and never shadow one", async () => {
  const live = new Set(skills.map((s) => s.slug));
  const redirects = (await config.redirects!()) as { source: string; destination: string; statusCode?: number }[];
  for (const [old, slug] of Object.entries(RENAMED_SKILLS)) {
    assert.ok(live.has(slug), `${slug} is a live skill`);
    assert.ok(!live.has(old), `${old} is not a live skill`);
    assert.ok(
      redirects.some((r) => r.source === `/skills/${old}` && r.destination === `/skills/${slug}` && r.statusCode === 301),
      `/skills/${old} redirects`,
    );
  }
  assert.equal(RENAMED_SKILLS["thai-jk-voice"], "thai-narrator");
});
