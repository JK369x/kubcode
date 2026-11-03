"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import type { AuthProviderId, AuthReadiness, PublicUser } from "@/lib/auth-policy";
import styles from "./GoogleLogin.module.css";
import lineStyles from "./LineLogin.module.css";

export type AccountFormProps =
  | { state: "unconfigured" }
  | { state: "signed-out"; providers: AuthReadiness; errorMessage?: string | null }
  | { state: "signed-in"; user: PublicUser; settingsAvailable?: boolean };

type Action = AuthProviderId | "signout";

const LABELS: Readonly<Record<AuthProviderId, string>> = { google: "Google", line: "LINE" };
const NONE_READY: AuthReadiness = { google: false, line: false };

// All helpers use next-auth's own CSRF-protected POST flows; the server
// redirect callback pins the landing page regardless of callbackUrl.
export function startGoogleSignIn() {
  return signIn("google", { callbackUrl: "/account" });
}
export function startLineSignIn() {
  return signIn("line", { callbackUrl: "/account" });
}
export function startSignOut() {
  return signOut({ callbackUrl: "/account" });
}

export function signInButtonLabel(
  provider: AuthProviderId,
  { ready, busy }: { ready: boolean; busy: boolean },
): string {
  const label = LABELS[provider];
  if (!ready) return `เข้าสู่ระบบด้วย ${label} — ยังไม่เปิดใช้งาน`;
  return busy ? `กำลังไปที่ ${label}…` : `เข้าสู่ระบบด้วย ${label}`;
}

// Fixed text only; raw client/library errors are never shown.
export function actionFailureMessage(action: Action | null): string {
  if (action === null) return "";
  if (action === "signout") return "ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง";
  return `เริ่มเข้าสู่ระบบด้วย ${LABELS[action]} ไม่สำเร็จ ลองใหม่อีกครั้ง`;
}

function initial(user: PublicUser) {
  const source = (user.name ?? "").trim() || user.email || LABELS[user.provider];
  return (Array.from(source)[0] ?? "?").toUpperCase();
}

export function AccountForm(props: AccountFormProps) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [failed, setFailed] = useState<Action | null>(null);
  const noticeId = useId();

  async function run(action: Action, start: () => Promise<unknown>) {
    setBusy(action);
    setFailed(null);
    try {
      await start();
    } catch {
      setFailed(action);
      setBusy(null);
    }
  }

  const privacy = (
    <p>
      ดูว่าเราใช้ข้อมูลอะไรบ้างที่ <Link href="/privacy">นโยบายข้อมูล</Link>
    </p>
  );
  const failure = actionFailureMessage(failed);

  if (props.state === "signed-in") {
    const { user } = props;
    const label = LABELS[user.provider];
    const heading = user.name ?? (user.email ? null : `บัญชี ${label}`);
    return (
      <div className="account-form">
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {initial(user)}
          </span>
          <div>
            {heading ? <strong className={styles.name}>{heading}</strong> : null}
            {user.email ? <span className={styles.email}>{user.email}</span> : null}
            <span className={styles.provider}>เข้าสู่ระบบด้วย {label}</span>
          </div>
        </div>
        <p className={styles.note}>
          ยืนยันตัวตนด้วย {label} แล้ว — ยังไม่ใช่สมาชิกที่ได้รับอนุมัติ
          <br />
          ระบบอนุมัติสมาชิกยังไม่พร้อม จึงยังดาวน์โหลดไฟล์ไม่ได้
        </p>
        <button
          type="button"
          onClick={() => run("signout", startSignOut)}
          disabled={busy !== null}
          aria-busy={busy === "signout"}
        >
          {busy === "signout" ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
        </button>
        {props.settingsAvailable ? (
          <Link href="/account/settings">ตั้งค่าการเข้าสู่ระบบและการเชื่อม Google/LINE</Link>
        ) : null}
        <p role="status">{failure}</p>
        {privacy}
      </div>
    );
  }

  const unconfigured = props.state === "unconfigured";
  const ready = props.state === "signed-out" ? props.providers : NONE_READY;
  const errorMessage = props.state === "signed-out" ? props.errorMessage : null;
  const noticeFor = (provider: AuthProviderId) =>
    unconfigured ? `${noticeId}-all` : `${noticeId}-${provider}`;
  const button = (provider: AuthProviderId, className: string, start: () => Promise<unknown>) => (
    <button
      type="button"
      className={className}
      onClick={() => run(provider, start)}
      disabled={!ready[provider] || busy !== null}
      aria-busy={busy === provider}
      aria-describedby={ready[provider] ? undefined : noticeFor(provider)}
    >
      {signInButtonLabel(provider, { ready: ready[provider], busy: busy === provider })}
    </button>
  );
  // Honest per-provider configuration notice; no fake active flow.
  const notice = (provider: AuthProviderId) =>
    ready[provider] || unconfigured ? null : (
      <p id={noticeFor(provider)}>
        {LABELS[provider]} ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้ ปุ่มนี้จึงยังใช้ไม่ได้
      </p>
    );

  return (
    <div className="account-form">
      {button("google", "primary", startGoogleSignIn)}
      {notice("google")}
      {button("line", lineStyles.line, startLineSignIn)}
      {notice("line")}
      {unconfigured ? (
        <p id={`${noticeId}-all`}>ระบบเข้าสู่ระบบยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์นี้</p>
      ) : (
        <p>
          Google: ใช้ชื่อ อีเมล และตัวระบุบัญชี · LINE: ใช้ชื่อที่แสดงและตัวระบุบัญชี ไม่ขออีเมล
          <br />
          ไม่ขอรหัสผ่านของทั้งสองบริการ
        </p>
      )}
      <p role="status">{failure || errorMessage || ""}</p>
      {privacy}
    </div>
  );
}
