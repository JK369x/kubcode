// Preloaded into the local Next server only (docs/dev/local-e2e.md).
// The web host keeps its production Lambda URL check, so the local run uses a
// well-formed but fake Function URL; this sends exactly that origin to the
// local publishing runner over loopback. Every other request is untouched.
"use strict";

const from = process.env.KUBCODE_LOCAL_LAMBDA_FROM;
const to = process.env.KUBCODE_LOCAL_LAMBDA_TO;
if (!from || !to || !/^http:\/\/127\.0\.0\.1:\d+$/.test(to)) {
  throw new Error("lambda-route: KUBCODE_LOCAL_LAMBDA_FROM and a loopback KUBCODE_LOCAL_LAMBDA_TO are required");
}
const origin = new URL(from).origin;
const realFetch = globalThis.fetch;

globalThis.fetch = function localLambdaFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (typeof url === "string" && url.startsWith(origin + "/")) {
    const target = to + url.slice(origin.length);
    // The production call sets redirect: "error"; keep every option as sent.
    return realFetch(target, init);
  }
  return realFetch(input, init);
};
