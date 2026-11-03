// CI production release helpers: promote a deployment to the production
// domains through the Vercel REST API (the CLI's `promote` resolved the wrong
// team scope in CI), wait until the domain really serves it, smoke-test the
// live site, and re-promote the previous deployment only when the new one is
// live and unhealthy. fetch/sleep are injected so tests never hit the network.
// Results carry deployment ids, HTTP statuses and fixed reasons, never tokens.

export type ReleaseConfig = {
  token: string;
  teamId: string;
  projectId: string;
  domain: string; // e.g. kubcode.dev
  origin: string; // e.g. https://kubcode.dev
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  intervalMs: number;
};

const API = "https://api.vercel.com";
const SAFE_CODE = /^[a-z_]{1,60}$/i;

async function apiErrorCode(res: Response): Promise<string> {
  try {
    const code = ((await res.json()) as { error?: { code?: unknown } }).error?.code;
    return typeof code === "string" && SAFE_CODE.test(code) ? ` ${code}` : "";
  } catch {
    return "";
  }
}

export async function liveDeploymentId(cfg: ReleaseConfig): Promise<string> {
  const res = await cfg.fetch(`${API}/v13/deployments/${cfg.domain}?teamId=${cfg.teamId}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) throw new Error(`live lookup HTTP ${res.status}${await apiErrorCode(res)}`);
  const id = ((await res.json()) as { id?: unknown }).id;
  if (typeof id !== "string" || !/^dpl_[A-Za-z0-9]+$/.test(id)) throw new Error("live lookup returned no deployment id");
  return id;
}

export type PromoteResult = { ok: boolean; live?: string; reason?: string };

export async function promoteAndWait(cfg: ReleaseConfig, deploymentId: string): Promise<PromoteResult> {
  const res = await cfg.fetch(`${API}/v10/projects/${cfg.projectId}/promote/${deploymentId}?teamId=${cfg.teamId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (res.status < 200 || res.status > 202)
    return { ok: false, reason: `promote ${deploymentId} HTTP ${res.status}${await apiErrorCode(res)}` };
  const attempts = Math.max(1, Math.ceil(cfg.timeoutMs / cfg.intervalMs));
  let live = "";
  for (let i = 0; i < attempts; i++) {
    live = await liveDeploymentId(cfg);
    if (live === deploymentId) return { ok: true, live };
    await cfg.sleep(cfg.intervalMs);
  }
  return {
    ok: false,
    live,
    reason: `promote ${deploymentId} timed out after ${Math.round(cfg.timeoutMs / 1000)}s; ${cfg.domain} still serves ${live}`,
  };
}

export async function smokeLive(cfg: ReleaseConfig): Promise<{ ok: boolean; reason?: string }> {
  const providers = await cfg.fetch(`${cfg.origin}/api/auth/providers`, { cache: "no-store" });
  if (providers.status !== 200) return { ok: false, reason: `providers HTTP ${providers.status}` };
  let keys: string[];
  try {
    keys = Object.keys((await providers.json()) as object).sort();
  } catch {
    return { ok: false, reason: "providers response is not JSON" };
  }
  if (keys.join(",") !== "google,line") return { ok: false, reason: `providers are [${keys.join(",")}], expected [google,line]` };
  const account = await cfg.fetch(`${cfg.origin}/account`, { cache: "no-store" });
  if (account.status !== 200) return { ok: false, reason: `/account HTTP ${account.status}` };
  return { ok: true };
}

export type PostPromoteOutcome =
  | "promoted_and_healthy"
  | "not_promoted"
  | "unexpected_live"
  | "rolled_back"
  | "rollback_failed";

export type PostPromoteResult = { ok: boolean; outcome: PostPromoteOutcome; live: string; reason?: string };

// Runs after a successful deploy whether or not promote succeeded.
export async function postPromote(cfg: ReleaseConfig, newId: string, previousId: string): Promise<PostPromoteResult> {
  const live = await liveDeploymentId(cfg);
  if (live !== newId) {
    if (live === previousId)
      return { ok: false, outcome: "not_promoted", live, reason: `${cfg.domain} still serves the previous ${previousId}; production unchanged` };
    return {
      ok: false,
      outcome: "unexpected_live",
      live,
      reason: `${cfg.domain} serves ${live}, neither new ${newId} nor previous ${previousId}; no automatic action`,
    };
  }
  const smoke = await smokeLive(cfg);
  if (smoke.ok) return { ok: true, outcome: "promoted_and_healthy", live };
  const back = await promoteAndWait(cfg, previousId);
  if (back.ok)
    return { ok: false, outcome: "rolled_back", live: previousId, reason: `live smoke failed (${smoke.reason}); re-promoted ${previousId}` };
  return {
    ok: false,
    outcome: "rollback_failed",
    live: back.live ?? live,
    reason: `live smoke failed (${smoke.reason}) and re-promote failed (${back.reason}); roll back manually`,
  };
}
