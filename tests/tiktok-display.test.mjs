import test from "node:test";
import assert from "node:assert/strict";
import { Sandbox } from "../services/tiktok-sandbox/session.mjs";
test("member display reads only authorized fields and lists public videos", async () => {
  const seen = [];
  const app = new Sandbox(
    { clientKey: "app", origin: "https://example.test" },
    async (url, init) => {
      assert.equal(init.headers.Authorization, "Bearer own");
      seen.push(new URL(url));
      return Response.json({
        error: { code: "ok" },
        data: url.includes("/user/info/")
          ? { user: { display_name: "Creator", follower_count: 2 } }
          : { videos: [] },
      });
    },
  );
  app.grants.set("member", {
    token: "own",
    until: Date.now() + 60000,
    scopes: ["user.info.basic", "user.info.stats", "video.list"],
  });
  await assert.rejects(app.display("other"), /connect_required/);
  const data = await app.display("member");
  assert.equal(data.profile.follower_count, 2);
  assert.deepEqual(data.videos, []);
  assert.equal(seen.length, 2);
  assert.ok(!seen[0].searchParams.get("fields").includes("bio_description"));
});
