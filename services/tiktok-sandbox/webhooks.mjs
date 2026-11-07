import { createHmac, timingSafeEqual } from "node:crypto";

export async function receiveWebhook(req, sandbox, send) {
  const parts = String(req.headers["tiktok-signature"] || "")
    .split(",")
    .map((pair) => pair.trim().split("="));
  const { t, s } = Object.fromEntries(parts);
  if (
    !/^\d{10}$/.test(t) ||
    !/^[a-f0-9]{64}$/.test(s) ||
    Math.abs(Date.now() / 1000 - Number(t)) > 300
  )
    return send(403, { error: "invalid_signature" });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) return send(413, { error: "too_large" });
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const event = JSON.parse(body.toString());
    const activeClient = event.client_key === sandbox.config.clientKey;
    const client = activeClient ? sandbox.config : sandbox.productionWebhook;
    if (!client || client.clientKey !== event.client_key)
      return send(403, { error: "wrong_client" });
    const hash = createHmac("sha256", client.clientSecret)
      .update(t + ".")
      .update(body)
      .digest();
    if (!timingSafeEqual(hash, Buffer.from(s, "hex")))
      return send(403, { error: "invalid_signature" });
    if (!activeClient) return send(200, {});
    if (
      event.event === "authorization.removed" &&
      typeof event.user_openid === "string" &&
      event.user_openid &&
      Number.isSafeInteger(event.create_time)
    ) {
      for (const [member, grant] of sandbox.grants) {
        if (
          grant.openId === event.user_openid &&
          grant.connectedAt <= event.create_time
        )
          sandbox.grants.delete(member);
      }
    }
    return send(200, {});
  } catch {
    return send(400, { error: "invalid_payload" });
  }
}
