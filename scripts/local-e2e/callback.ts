// Reads the URL the owner copies during the local E2E hand-off.

/**
 * Our callback URL from what the owner copied: Zernio's exit page
 * (zernio.com/connect/continue?to=<callback>) or the callback itself.
 */
export function callbackFrom(copied: string): string | undefined {
  let u: URL;
  try {
    u = new URL(copied);
  } catch {
    return undefined;
  }
  const inner = u.origin === "https://zernio.com" ? u.searchParams.get("to") ?? "" : copied;
  return /^https:\/\/kubcode\.dev\/api\/channels\/callback\?i=[0-9a-f]{64}(&|$)/.test(inner) ? inner : undefined;
}
