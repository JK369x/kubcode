// Server-only next-auth v4 wiring. All decisions live in ./auth-policy.
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import GoogleProvider from "next-auth/providers/google";
import LineProvider from "next-auth/providers/line";
import {
  accountRedirect,
  isTrustedSignIn,
  minimalToken,
  providerReadiness,
  publicUserFromSession,
  readAuthConfig,
  safeLogCode,
  signInEventMarker,
  tokenFromSignIn,
  toPublicSession,
  GOOGLE_SCOPE,
  LINE_SCOPE,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,

  type AuthConfig,
  type AuthEnv,
  type AuthReadiness,
  type PublicUser,
  ACCOUNT_URL,
  CANONICAL_ORIGIN,
} from "./auth-policy";
import type { JWT } from "next-auth/jwt";
import { readAccountsConfig } from "./accounts/config";
import { logDbFailure } from "./accounts/db";
import { requestContextFrom, type AccountsRuntime } from "./accounts/runtime";
import {
  accountToken,
  isSubject,
  parseAccountToken,
  publicSessionFromAccountToken,
  sessionClaims,
} from "./accounts/session";
import { getAccountStore, type LoginProfile } from "./accounts/store";
import { safeAvatarUrl } from "./avatar";

// Logs only the library's fixed code; metadata (errors, request bodies,
// profiles, tokens) is dropped on purpose.
const logger = {
  error(code: string) {
    console.error(`[auth] ${safeLogCode(code)}`);
  },
  warn(code: string) {
    console.warn(`[auth] ${safeLogCode(code)}`);
  },
  debug() {},
};

// Only providers whose own credentials validated are registered.
function providers(config: AuthConfig): NextAuthOptions["providers"] {
  const list: NextAuthOptions["providers"] = [];
  if (config.google)
    list.push(
      GoogleProvider({
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        authorization: { params: { scope: GOOGLE_SCOPE } },
        checks: ["pkce", "state", "nonce"],
        profile(profile) {
          return { id: profile.sub, name: profile.name, email: profile.email };
        },
      }),
    );
  if (config.line)
    // The library default keeps OIDC discovery (wellKnown), idToken: true and
    // HS256 ID-token verification with the channel secret; do not override
    // `client`, `wellKnown` or `idToken` here.
    list.push(
      LineProvider({
        clientId: config.line.clientId,
        clientSecret: config.line.clientSecret,
        authorization: { params: { scope: LINE_SCOPE } },
        checks: ["pkce", "state", "nonce"],
        profile(profile) {
          return { id: profile.sub, name: profile.name ?? null, email: null, image: null };
        },
      }),
    );
  return list;
}

// Verified provider claims for a central-account login or link proof.
function loginProfile(account: unknown, profile: unknown): LoginProfile | null {
  const token = tokenFromSignIn({ account, profile });
  if (!token?.provider || !token.sub || !isSubject(token.sub)) return null;
  const displayName = token.name ? token.name.slice(0, 200) : null;
  const email = token.provider === "google" && token.email && token.email.length <= 320 ? token.email : null;
  return { provider: token.provider, subject: token.sub, displayName, email };
}

// Google and LINE ID tokens carry `picture`; LINE's profile API calls it
// `pictureUrl`. Only allowlisted provider image URLs survive.
function profilePicture(profile: unknown): string | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as { picture?: unknown; pictureUrl?: unknown };
  return safeAvatarUrl(p.picture) ?? safeAvatarUrl(p.pictureUrl);
}

const SETTINGS_URL = `${CANONICAL_ORIGIN}/account/settings`;

// Central accounts (feature ON). Every decision fails closed: an outage or an
// unexpected state never yields a session and never falls back to stateless.
function accountCallbacks(accounts: AccountsRuntime): NextAuthOptions["callbacks"] {
  const { store, ready, request: ctx } = accounts;
  return {
    async signIn({ account, profile }) {
      if (!isTrustedSignIn({ account, profile })) return false;
      const proof = loginProfile(account, profile);
      if (!proof) return false;
      // Any link cookie (even a broken one) makes this a link callback. It
      // returns a redirect string, so next-auth issues no session cookie and
      // the initiating session stays as it was.
      if (ctx.linkCookie !== "none") {
        if (ctx.linkCookie === "malformed") {
          ctx.clearLinkCookie = true;
          return `${SETTINGS_URL}?link_error=LINK_INVALID`;
        }
        try {
          const result = await store.advanceIntent(ctx.linkCookie, ctx.session, proof, ready);
          if (result.ok) return `${SETTINGS_URL}?link=${result.step}_verified`;
          ctx.clearLinkCookie = true;
          return `${SETTINGS_URL}?link_error=${result.code}`;
        } catch (error) {
          logDbFailure("LINK_CALLBACK", error);
          return `${SETTINGS_URL}?link_error=ACCOUNTS_UNAVAILABLE`;
        }
      }
      try {
        const result = await store.resolveLogin(proof);
        if (result.status !== "ok") return false;
        // The picture rides in the encrypted session only; the store never sees it.
        ctx.login = { ...proof, userId: result.userId, sessionVersion: result.sessionVersion, picture: profilePicture(profile) };
        return true;
      } catch (error) {
        logDbFailure("LOGIN", error);
        return `${ACCOUNT_URL}?error=AccountUnavailable`;
      }
    },
    async jwt({ token, account }) {
      if (account) {
        const login = ctx.login;
        if (!login || login.provider !== account.provider) throw new Error("ACCOUNT_LOGIN_MISSING");
        return accountToken({
          userId: login.userId,
          sessionVersion: login.sessionVersion,
          provider: login.provider,
          subject: login.subject,
          name: login.displayName,
          email: login.email,
          picture: login.picture,
        }) as unknown as JWT;
      }
      // Session read: the client-supplied `session` update payload is ignored.
      const parsed = parseAccountToken(token);
      if (!parsed || !ready[parsed.provider]) return {};
      try {
        return (await store.checkSession(sessionClaims(parsed))) ? (parsed as unknown as JWT) : {};
      } catch (error) {
        logDbFailure("SESSION_CHECK", error);
        return {};
      }
    },
    // An expires-only object looks authenticated to next-auth/react. A DB-
    // revoked/malformed JWT must produce an empty public session instead.
    session: ({ session, token }) =>
      (parseAccountToken(token) ? publicSessionFromAccountToken(token, session.expires) : {}) as never,
    redirect: ({ url }) => accountRedirect(url, CANONICAL_ORIGIN),
  };
}

export function buildAuthOptions(config: AuthConfig, accounts?: AccountsRuntime): NextAuthOptions {
  const callbacks: NextAuthOptions["callbacks"] = accounts
    ? accountCallbacks(accounts)
    : {
        signIn: ({ account, profile }) => isTrustedSignIn({ account, profile }),
        // A fresh sign-in never falls back to the library's default token, so an
        // unknown account cannot become a provider-less (legacy Google) token.
        jwt: ({ token, account, profile }) =>
          account ? (tokenFromSignIn({ account, profile }) ?? {}) : minimalToken(token),
        session: ({ session, token }) => toPublicSession(token, session.expires),
        redirect: ({ url }) => accountRedirect(url, config.origin),
      };
  return {
    secret: config.secret,
    debug: false,
    logger,
    useSecureCookies: true,
    // Rolling lifetime, not an absolute cap; stateless logout clears this browser only.
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECONDS,

    },
    jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
    cookies: {
      sessionToken: {
        name: SESSION_COOKIE_NAME,
        options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
      },
      // Bind the SDK's OAuth state/nonce/PKCE to link mode as well as provider.
      // Removing the intent cookie then selects ordinary cookie names, so a
      // pending link callback fails SDK state checks instead of signing in.
      ...(accounts && accounts.request.linkCookie !== "none" ? {
        state: {
          name: "__Host-kubcode-link-state",
          options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, maxAge: 900 },
        },
        nonce: {
          name: "__Host-kubcode-link-nonce",
          options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, maxAge: 900 },
        },
        pkceCodeVerifier: {
          name: "__Host-kubcode-link-pkce",
          options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, maxAge: 900 },
        },
      } : {}),
    },
    pages: { signIn: "/account", signOut: "/account", error: "/account" },
    providers: providers(config),
    events: {
      async signIn({ account }) {
        const marker = signInEventMarker(account);
        if (marker) console.info(marker);
      },
      async signOut({ token }) {
        // Logout abandons any link/unlink intent bound to this browser session.
        const parsed = accounts ? parseAccountToken(token) : null;
        if (accounts && parsed) {
          try {
            await accounts.store.cancelSessionIntents(sessionClaims(parsed));
          } catch (error) {
            logDbFailure("SIGNOUT_CANCEL", error);
          }
        }
        console.info("[auth-event] SIGNOUT_COMPLETED");
      },
    },
    callbacks,
  };
}

export type AccountView =
  | { state: "unconfigured" }
  | { state: "signed-out"; providers: AuthReadiness }
  | { state: "signed-in"; user: PublicUser };

export async function getAccountView(env: AuthEnv = process.env): Promise<AccountView> {
  const result = readAuthConfig(env);
  if (!result.ok) return { state: "unconfigured" };
  const readiness = providerReadiness(result);
  const accounts = readAccountsConfig(env);
  // Explicitly enabled but broken: no login of any kind (no stateless fallback).
  if (accounts.mode === "broken") {
    console.error("[accounts] ACCOUNTS_MISCONFIGURED");
    return { state: "unconfigured" };
  }
  try {
    let options = buildAuthOptions(result.config);
    if (accounts.mode === "on") {
      const { cookies } = await import("next/headers");
      options = buildAuthOptions(result.config, {
        store: getAccountStore(accounts.databaseUrl),
        ready: readiness,
        request: await requestContextFrom(await cookies(), result.config.secret),
      });
    }
    const session = await getServerSession(options);
    const user = publicUserFromSession(session);
    return user ? { state: "signed-in", user } : { state: "signed-out", providers: readiness };
  } catch {
    console.error("[auth] SESSION_READ_FAILED");
    return { state: "signed-out", providers: readiness };
  }
}
