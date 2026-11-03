import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { NextRequest as NextRequestCtor } from "next/server";
import { buildAuthOptions } from "@/lib/auth";
import {
  authUnavailableResponse,
  canonicalHostRedirect,
  describeProblems,
  providerReadiness,
  readAuthConfig,
  CANONICAL_ORIGIN,
} from "@/lib/auth-policy";
import { readAccountsConfig } from "@/lib/accounts/config";

import { accountErrorResponse } from "@/lib/accounts/errors";
import { clearLinkCookie } from "@/lib/accounts/http";
import { requestContextFrom } from "@/lib/accounts/runtime";
import { getAccountStore } from "@/lib/accounts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ nextauth: string[] }> };

async function handle(request: NextRequest, context: Context): Promise<Response> {
  // The library's client log proxy is unauthenticated; do not allow forged logs.
  if ((await context.params).nextauth[0] === "_log")
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const result = readAuthConfig(process.env);
  if (!result.ok) {
    // Variable names and reasons only; values never reach logs or clients.
    console.warn(`[auth] AUTH_NOT_CONFIGURED ${describeProblems(result.problems)}`);
    return authUnavailableResponse();
  }
  // Alias/preview hosts go to the canonical account page before the library
  // can set CSRF/PKCE/state cookies for the wrong host.
  const redirectTo = canonicalHostRedirect(request.headers);
  if (redirectTo)
    return new Response(null, {
      status: 303,
      headers: { Location: redirectTo, "Cache-Control": "no-store" },
    });
  const accounts = readAccountsConfig(process.env);
  // Feature OFF: the existing stateless Google/LINE login, unchanged.
  if (accounts.mode === "off") return NextAuth(buildAuthOptions(result.config))(request, context);
  // Explicitly enabled but broken: fail closed, never fall back to stateless.
  if (accounts.mode === "broken") {
    console.error(`[accounts] ACCOUNTS_MISCONFIGURED ${accounts.reason}`);
    return accountErrorResponse("ACCOUNTS_UNAVAILABLE");
  }
  const [action, providerId] = (await context.params).nextauth;
  let forwarded: NextRequest = request;

  if (action === "signin" && request.method === "POST") forwarded = await withSignInParams(request, providerId);
  const ctx = await requestContextFrom(request.cookies, result.config.secret);
  const handler = NextAuth(
    buildAuthOptions(result.config, {
      store: getAccountStore(accounts.databaseUrl),
      ready: providerReadiness(result),
      request: ctx,
    }),
  );
  const response = await handler(forwarded, context);
  // Logout also drops this browser's link cookie (its intent was cancelled in
  // the signOut event), so a later ordinary sign-in is not diverted.
  if (action === "signout" && request.method === "POST") ctx.clearLinkCookie = true;
  if (!ctx.clearLinkCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", clearLinkCookie());
  return new Response(response.body, { status: response.status, headers });
}

// Only server-approved authorization parameters reach the provider: Google may
// show its account chooser (prompt=select_account); nothing else (scope,
// claims, login_hint, ...) can be injected through the sign-in query string.
async function withSignInParams(request: NextRequest, providerId: string | undefined): Promise<NextRequest> {
  const url = new URL(request.nextUrl.pathname, CANONICAL_ORIGIN);
  if (providerId === "google" && request.nextUrl.searchParams.get("prompt") === "select_account")
    url.searchParams.set("prompt", "select_account");
  return new NextRequestCtor(url, { method: request.method, headers: request.headers, body: await request.text() });
}

export { handle as GET, handle as POST };
