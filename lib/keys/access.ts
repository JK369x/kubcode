// Who may use the settings keys page, in one place. Phase 1: the feature
// flag must be exactly "true" and the member must be the owner. Opening it to
// creators later (ADR 0003) means changing canUseKeys only.
import type { AuthEnv } from "../auth-policy";

export const KEYS_FLAG = "KUBCODE_KEYS_ENABLED";

export const keysEnabled = (env: AuthEnv) => env[KEYS_FLAG] === "true";

export const canUseKeys = (member: { isOwner: boolean }) => member.isOwner;
