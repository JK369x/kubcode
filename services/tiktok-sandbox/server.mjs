import { createBridge } from "./http.mjs";
import { Sandbox } from "./session.mjs";
const {
  TIKTOK_SANDBOX_KEY: clientKey,
  TIKTOK_SANDBOX_SECRET: clientSecret,
  TIKTOK_SANDBOX_ORIGIN: origin,
  TIKTOK_SANDBOX_BRIDGE: bridge,
} = process.env;
if (
  !clientKey ||
  !clientSecret ||
  !origin ||
  new URL(origin).protocol !== "https:" ||
  new URL(origin).origin !== origin ||
  !bridge ||
  bridge.length < 32
)
  throw Error("Missing sandbox settings");
const sandbox = new Sandbox({ clientKey, clientSecret, origin });
if (process.env.TIKTOK_PRODUCTION_KEY && process.env.TIKTOK_PRODUCTION_SECRET) {
  sandbox.productionWebhook = {
    clientKey: process.env.TIKTOK_PRODUCTION_KEY,
    clientSecret: process.env.TIKTOK_PRODUCTION_SECRET,
  };
}
setInterval(() => sandbox.prune(), 60000).unref();
createBridge(sandbox, bridge).listen(3051, "127.0.0.1");
