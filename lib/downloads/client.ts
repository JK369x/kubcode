// Browser helpers for the download button: who is signed in (read once per
// page, shared by every card), whether a skill can be downloaded here, and
// the download itself (POST with the CSRF token, then follow the short-lived URL).
import { send } from "../interactions/client";

let session: Promise<boolean> | null = null;

export function fetchSignedIn(): Promise<boolean> {
  session ??= fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    // Always drain the body (also the 503 when sign-in isn't configured), so
    // the request completes instead of staying open (as in AccountMenu).
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as { user?: unknown };
      return res.ok ? body : {};
    })
    .then((s) => Boolean(s.user))
    .catch(() => false);
  return session;
}

export async function fetchAvailable(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/download/${encodeURIComponent(slug)}`, { credentials: "same-origin", cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as { available?: unknown };
    return res.ok && body.available === true;
  } catch {
    return false;
  }
}

/** Starts the download; resolves with an error message, or null once the browser is fetching the file. */
export async function startDownload(slug: string): Promise<string | null> {
  const result = await send<{ url: string }>(`/api/download/${encodeURIComponent(slug)}`, "POST");
  if (!result.ok) return result.message;
  // The URL answers with Content-Disposition: attachment, so the page stays put.
  window.location.assign(result.url);
  return null;
}
