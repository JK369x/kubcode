import { receiveWebhook } from "./webhooks.mjs";
import http from "node:http";
export function createBridge(sandbox, bridge, request = fetch) {
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    if (req.method === "POST" && req.url === "/webhooks/tiktok")
      return receiveWebhook(req, sandbox, send);
    if (
      req.method !== "POST" ||
      req.headers.authorization !== "Bearer " + bridge
    )
      return send(403, { error: "forbidden" });
    const member = req.headers["x-member"];
    if (typeof member !== "string" || !member)
      return send(403, { error: "forbidden" });
    try {
      if (req.url === "/upload") {
        const job = sandbox.grants.get(member)?.jobs.get(req.headers["x-job"]);
        if (!job?.url || Number(req.headers["content-length"]) !== job.size)
          return send(400, { error: "invalid_upload" });
        const url = job.url;
        job.url = null;
        const result = await request(url, {
          method: "PUT",
          body: req,
          duplex: "half",
          redirect: "error",
          signal: AbortSignal.timeout(180000),
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(job.size),
            "Content-Range": "bytes 0-" + (job.size - 1) + "/" + job.size,
          },
        });
        if (!result.ok) throw Error("upload_failed");
        return send(200, { ok: true });
      }
      req.setEncoding("utf8");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 20000)
          return send(413, { error: "too_large" });
      }
      const data = JSON.parse(body);
      switch (req.url) {
        case "/start":
          return send(200, { url: sandbox.start(member) });
        case "/connect":
          await sandbox.connect(member, data.state, data.code);
          return send(200, { ok: true });
        case "/display-connect":
          return send(200, { url: sandbox.start(member, true) });
        case "/display":
          return send(200, await sandbox.display(member));
        case "/creator":
          return send(200, await sandbox.creator(member));
        case "/init":
          return send(200, await sandbox.init(member, data));
        case "/status":
          return send(200, await sandbox.status(member, data.id));
        default:
          return send(404, { error: "unknown_action" });
      }
    } catch (err) {
      send(400, {
        error: /^[a-z_]{1,80}$/.test(err.message)
          ? err.message
          : "provider_error",
      });
    }
  });
}
