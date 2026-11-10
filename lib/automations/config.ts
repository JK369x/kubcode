// The owner's comment → DM page and routes (docs/design/ig-comment-dm.md §4.6)
// sit behind their own flag on top of publishing: rules are only useful for a
// connected Instagram channel.
import type { AuthEnv } from "../auth-policy";
import { readPublishingConfig } from "../channels/config";

export const AUTOMATIONS_FLAG = "KUBCODE_AUTOMATIONS_ENABLED";

export type AutomationsConfig = { mode: "off" } | { mode: "broken" } | { mode: "on" };

/** Off unless the flag is exactly "true" and publishing is enabled; broken when publishing is. */
export function readAutomationsConfig(env: AuthEnv): AutomationsConfig {
  if (env[AUTOMATIONS_FLAG] !== "true") return { mode: "off" };
  const publishing = readPublishingConfig(env);
  if (publishing.mode === "off") return { mode: "off" };
  return publishing.mode === "on" ? { mode: "on" } : { mode: "broken" };
}

/** Whether to offer the page at all (the link on /account/channels). */
export const automationsEnabled = (env: AuthEnv) => readAutomationsConfig(env).mode === "on";
