// The KMS RSA public key that seals user secrets (docs/design/settings-keys.md §1).
// null until step 4 creates alias/kubcode-secrets-wrap: until then the store
// refuses to save (NOT_READY) and the page says saving is not open yet.
// Step 4 commits the PEM here and pins its SPKI SHA-256 fingerprint in a test.
import type { WrapKey } from "./envelope";

export const CURRENT_WRAP_KEY: WrapKey | null = null;
