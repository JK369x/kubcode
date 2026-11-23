"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CreditCard, LayoutDashboard, LogOut, Plus, Settings2 } from "lucide-react";
import { WORK_LINKS, isCurrent } from "@/lib/main-links";
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
/** What the member may open (GET /api/account/capabilities); absent = not loaded yet. */
export type MenuCapabilities = { publishing: boolean; billing: boolean };

/**
 * Header account control (presentational). `user`: undefined while the
 * session loads, null when signed out. Signed in: a shadcn DropdownMenu
 * (Radix): opens on click / Enter / Space / ArrowDown with focus on the first
 * item, arrows move, Esc closes and returns focus to the avatar, outside
 * click and Tab close it (MASTER.md §Modals).
 *
 * Owner 2026-11-16: the main actions are not hidden in the avatar menu. A
 * member who may publish sees them in the header (WorkActions: แดชบอร์ด ·
 * โพสต์ของฉัน · ช่อง + "สร้างโพสต์"); the avatar menu keeps only the account:
 * บัญชี, การชำระเงิน, ตั้งค่าบัญชี, then sign-out, set apart.
 */
export function AccountMenuView({
  user,
  caps,
  open,
  onOpenChange,
  onSignOut,
}: {
  user: MenuUser | null | undefined;
  caps?: MenuCapabilities;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSignOut: () => void;
}) {
  if (user === undefined) return <span className={styles.placeholder} aria-hidden="true" />;
  // Owner 2026-11-23: no "เข้าสู่ระบบ" in the header; one bright start button.
  // /account signs people up or in with Google / LINE.
  if (user === null)
    return (
      <Link className={styles.signIn} href="/account">
        เริ่มใช้งาน
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
          <Link href="/account">
            <LayoutDashboard aria-hidden="true" /> บัญชี
          </Link>
        </DropdownMenuItem>
        {caps?.billing && (
          <DropdownMenuItem asChild>
            <Link href="/account/billing">
              <CreditCard aria-hidden="true" /> การชำระเงิน
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/account/settings">
            <Settings2 aria-hidden="true" /> ตั้งค่าบัญชี
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden="true" /> ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The member's work in the header (owner 2026-11-16), for members who may
 * publish: แดชบอร์ด · โพสต์ของฉัน · ช่อง as links, and "สร้างโพสต์" as the
 * primary button. Hidden on phones (the sheet carries them).
 */
export function WorkActions({ caps }: { caps?: MenuCapabilities }) {
  const path = usePathname();
  if (!caps?.publishing) return null;
  return (
    <span className={styles.work}>
      {WORK_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={styles.workLink} aria-current={isCurrent(l.href, path) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <Link href="/account/posts/new" className={styles.create} aria-current={path === "/account/posts/new" ? "page" : undefined}>
        <Plus aria-hidden="true" /> สร้างโพสต์
      </Link>
    </span>
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
  const [caps, setCaps] = useState<MenuCapabilities | undefined>(undefined);
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
        if (!s.user) return;
        // Booleans only; a failure just hides the extra links.
        fetch("/api/account/capabilities", { credentials: "same-origin", cache: "no-store" })
          .then(async (res) => (res.ok ? ((await res.json()) as MenuCapabilities) : null))
          .catch(() => null)
          .then((c) => {
            if (live && c) setCaps({ publishing: c.publishing === true, billing: c.billing === true });
          });
      });
    return () => {
      live = false;
    };
  }, []);

  // A picture that fails to load falls back to the initial.
  const shown = user && broken ? { ...user, image: null } : user;
  return (
    <div className={styles.root} onErrorCapture={() => setBroken(true)}>
      {user ? <WorkActions caps={caps} /> : null}
      <AccountMenuView user={shown} caps={caps} onSignOut={() => void signOutToAccount()} />
    </div>
  );
}
