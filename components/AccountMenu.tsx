"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { avatarInitial, safeAvatarUrl } from "@/lib/avatar";
import styles from "./AccountMenu.module.css";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MenuUser = { name: string | null; image: string | null };

/**
 * Header account control (presentational). `user`: undefined while the
 * session loads, null when signed out. Signed in: a shadcn DropdownMenu
 * (Radix): opens on click / Enter / Space / ArrowDown with focus on the first
 * item, arrows move, Esc closes and returns focus to the avatar, outside
 * click and Tab close it (MASTER.md §Modals).
 */
export function AccountMenuView({
  user,
  open,
  onOpenChange,
  onSignOut,
}: {
  user: MenuUser | null | undefined;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSignOut: () => void;
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
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger className={styles.avatar} aria-label={`บัญชีของ ${name}`}>
        {image ? (
          // Plain <img>: provider host only, no proxy, no referrer sent.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={32} height={32} referrerPolicy="no-referrer" decoding="async" />
        ) : (
          <span aria-hidden="true">{avatarInitial(user.name)}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} collisionPadding={16}>
        <DropdownMenuLabel className="px-2 pt-1 pb-2 text-sm font-semibold wrap-anywhere text-foreground">
          {name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/settings">ตั้งค่าบัญชี</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}>ออกจากระบบ</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [broken, setBroken] = useState(false);

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

  // A picture that fails to load falls back to the initial.
  const shown = user && broken ? { ...user, image: null } : user;
  return (
    <div className={styles.root} onErrorCapture={() => setBroken(true)}>
      <AccountMenuView user={shown} onSignOut={() => void signOutToAccount()} />
    </div>
  );
}
