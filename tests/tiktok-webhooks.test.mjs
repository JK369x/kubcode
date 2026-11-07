import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Sandbox } from "../services/tiktok-sandbox/session.mjs";
import { createBridge } from "../services/tiktok-sandbox/http.mjs";
test("only a fresh signed revocation disconnects its TikTok user", async () => {
  const app = new Sandbox({ clientKey: "app", clientSecret: "example" });
  app.productionWebhook = { clientKey: "live", clientSecret: "live-secret" };
  const now = Math.floor(Date.now() / 1000);
  for (const id of ["alice", "bob"])
    app.grants.set(id, { openId: id, connectedAt: now - 30 });
  const server = createBridge(app, "internal");
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const event = {
      client_key: "app",
      event: "authorization.removed",
      create_time: now,
      user_openid: "alice",
    };
    const send = (time, secret, key = "app") => {
      const body = JSON.stringify({ ...event, client_key: key });
      return fetch(
        "http://127.0.0.1:" + server.address().port + "/webhooks/tiktok",
        {
          method: "POST",
          body,
          headers: {
            "TikTok-Signature":
              "t=" +
              time +
              ",s=" +
              createHmac("sha256", secret)
                .update(time + "." + body)
                .digest("hex"),
          },
        },
      );
    };
    assert.equal((await send(now, "live-secret", "live")).status, 200);
    assert.ok(app.grants.has("alice"));
    assert.equal((await send(now, "example", "live")).status, 403);
    assert.equal((await send(now, "wrong")).status, 403);
    assert.equal((await send(now - 901, "example")).status, 403);
    assert.ok(app.grants.has("alice"));
    assert.equal((await send(now, "example")).status, 200);
    assert.ok(!app.grants.has("alice") && app.grants.has("bob"));
    assert.equal((await send(now, "example")).status, 200);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
