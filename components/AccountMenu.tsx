"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { avatarInitial, safeAvatarUrl } from "@/lib/avatar";
import styles from "./AccountMenu.module.css";

export type MenuUser = { name: string | null; image: string | null };

/**
 * Header account control (presentational). `user`: undefined while the
 * session loads, null when signed out. A disclosure (button + panel of links),
 * not an ARIA menu, so Tab order and screen readers behave like normal links.
 */
export function AccountMenuView({
  user,
  open,
  onToggle,
  onSignOut,
  panelId = "account-panel",
  buttonRef,
}: {
  user: MenuUser | null | undefined;
  open: boolean;
  onToggle: () => void;
  onSignOut: () => void;
  panelId?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  if (user === undefined) return <span className={styles.placeholder} aria-hidden="true" />;
  if (user === null)
    return (
      <Link className={styles.signIn} href="/account">
        เข้าสู่ระบบ
      </Link>
    );
  const name = user.name?.trim() || "สมาชิก";
  const image = safeAvatarUrl(user.image);
  return (
    <div className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.avatar}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`บัญชีของ ${name}`}
        onClick={onToggle}
      >
        {image ? (
          // Plain <img>: provider host only, no proxy, no referrer sent.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={32} height={32} referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{avatarInitial(user.name)}</span>
        )}
      </button>
      {open && (
        <div id={panelId} className={styles.panel}>
          <p className={styles.name}>{name}</p>
          <ul>
            <li>
              <Link href="/account/settings">ตั้งค่าบัญชี</Link>
            </li>
            <li>
              <button type="button" onClick={onSignOut}>
                ออกจากระบบ
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Signs out through the NextAuth endpoints directly (same requests the SDK
 * makes). The header is on every page, and next-auth/react reads
 * NEXTAUTH_URL at import time, which breaks builds where it is empty.
 */
async function signOutToAccount() {
  try {
    const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
    const { csrfToken } = (await csrf.json().catch(() => ({}))) as { csrfToken?: string };
    if (csrfToken) {
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, callbackUrl: "/account", json: "true" }),
      });
    }
  } finally {
    window.location.assign("/account");
  }
}

type SessionJson = { user?: { name?: string | null; image?: string | null } };

/** Loads the public session on the client so every page can stay static. */
export function AccountMenu() {
  const [user, setUser] = useState<MenuUser | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      // Always drain the body (also on 503 when sign-in isn't configured) so
      // the request completes instead of lingering open.
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as SessionJson;
        return res.ok ? body : {};
      })
      .catch(() => ({}) as SessionJson)
      .then((s) => {
        if (!live) return;
        setUser(s.user ? { name: s.user.name ?? null, image: s.user.image ?? null } : null);
      });
    return () => {
      live = false;
    };
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close(false);
    };
    // Focus leaving the control (e.g. Tab past the last item) closes it too.
    const onFocus = (e: FocusEvent) => {
      if (root.current && e.target instanceof Node && !root.current.contains(e.target)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open, close]);

  // A picture that fails to load falls back to the initial.
  const shown = user && broken ? { ...user, image: null } : user;
  return (
    <div ref={root} className={styles.root} onErrorCapture={() => setBroken(true)}>
      <AccountMenuView
        user={shown}
        open={open}
        panelId={panelId}
        buttonRef={button}
        onToggle={() => setOpen((v) => !v)}
        onSignOut={() => void signOutToAccount()}
      />
    </div>
  );
}
