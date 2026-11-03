// CI only: production promote + live smoke via the Vercel REST API.
//   ci-vercel-release promote <newDeploymentId>
//   ci-vercel-release post-promote <newDeploymentId> <previousDeploymentId>
// Env: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, CANONICAL_ORIGIN.
// Prints deployment ids and fixed reasons only; never the token.
import { appendFileSync } from "node:fs";
import { postPromote, promoteAndWait, type ReleaseConfig } from "../lib/ci/vercel-release";

const ID = /^dpl_[A-Za-z0-9]+$/;

function config(): ReleaseConfig {
  const need = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
  };
  const origin = need("CANONICAL_ORIGIN");
  return {
    token: need("VERCEL_TOKEN"),
    teamId: need("VERCEL_ORG_ID"),
    projectId: need("VERCEL_PROJECT_ID"),
    origin,
    domain: new URL(origin).hostname,
    fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    timeoutMs: 5 * 60_000,
    intervalMs: 5_000,
  };
}

const summary = (line: string) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
};

async function main(): Promise<number> {
  const [command, newId, previousId] = process.argv.slice(2);
  if (!newId || !ID.test(newId) || (command === "post-promote" && (!previousId || !ID.test(previousId)))) {
    console.error("::error::usage: ci-vercel-release promote <dpl_new> | post-promote <dpl_new> <dpl_previous>");
    return 2;
  }
  const cfg = config();
  if (command === "promote") {
    const r = await promoteAndWait(cfg, newId);
    if (!r.ok) {
      console.error(`::error::${r.reason}`);
      return 1;
    }
    console.log(`promoted ${newId}; ${cfg.domain} serves it`);
    return 0;
  }
  if (command === "post-promote") {
    const r = await postPromote(cfg, newId, previousId);
    console.log(`post-promote outcome=${r.outcome} live=${r.live}`);
    if (!r.ok) {
      console.error(`::error::${r.reason}`);
      summary(`Production: ${r.outcome} — ${r.reason}`);
      return 1;
    }
    summary(`Production: ${newId} live on ${cfg.domain} and healthy (previous ${previousId})`);
    return 0;
  }
  console.error(`::error::unknown command ${JSON.stringify(command)}`);
  return 2;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Only our own fixed messages (missing env, lookup HTTP status) reach here.
    console.error(`::error::${error instanceof Error ? error.message : "release step failed"}`);
    process.exit(1);
  },
);
