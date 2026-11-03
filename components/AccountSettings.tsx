"use client";
import { useId, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";
import type { AuthProviderId } from "@/lib/auth-policy";
import { ACCOUNT_ERRORS, isAccountErrorCode, type AccountErrorCode } from "@/lib/accounts/errors";
import type { SettingsView } from "@/lib/accounts/view";
import styles from "./AccountSettings.module.css";

type ReadyView = Extract<SettingsView, { state: "ready" }>;
export type AccountSettingsProps = { view: ReadyView; notice: string | null };

const LABELS: Readonly<Record<AuthProviderId, string>> = { google: "Google", line: "LINE" };
const PROVIDERS: AuthProviderId[] = ["google", "line"];
const SETTINGS_PATH = "/account/settings";

export { settingsNotice } from "@/lib/accounts/notices";

// Fresh provider proof through next-auth's own CSRF/PKCE/state/nonce flow.
// Google shows its account chooser; LINE uses its normal login flow.
export function startProviderProof(provider: AuthProviderId) {
  return provider === "google"
    ? signIn("google", { callbackUrl: SETTINGS_PATH }, { prompt: "select_account" })
    : signIn("line", { callbackUrl: SETTINGS_PATH });
}

type ActionResult = { ok: true; data: Record<string, unknown> } | { ok: false; code: AccountErrorCode };

// Double-submit CSRF: fetch the token, then POST same-origin JSON with it.
export async function postAccountAction(
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<ActionResult> {
  try {
    const csrf = await fetchImpl("/api/account/csrf", { credentials: "same-origin", cache: "no-store" });
    const csrfBody = (await csrf.json()) as { csrfToken?: unknown; code?: unknown };
    if (!csrf.ok || typeof csrfBody.csrfToken !== "string")
      return { ok: false, code: isAccountErrorCode(csrfBody.code) ? csrfBody.code : "ACCOUNTS_UNAVAILABLE" };
    const res = await fetchImpl(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", "x-kubcode-csrf": csrfBody.csrfToken },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok) return { ok: true, data };
    return { ok: false, code: isAccountErrorCode(data.code) ? data.code : "ACCOUNTS_UNAVAILABLE" };
  } catch {
    return { ok: false, code: "ACCOUNTS_UNAVAILABLE" };
  }
}

export function AccountSettings({ view, notice }: AccountSettingsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AccountErrorCode | null>(null);
  const id = useId();
  const { providers, identities, intent } = view;
  const usable = identities.filter((i) => providers[i.provider]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch {
      setError("ACCOUNTS_UNAVAILABLE");
      setBusy(null);
    }
  }
  const fail = (code: AccountErrorCode) => {
    setError(code);
    setBusy(null);
  };

  const begin = (kind: "link" | "unlink", provider: AuthProviderId) =>
    run(`${kind}-${provider}`, async () => {
      const r = await postAccountAction(`/api/account/${kind}/start`, { provider });
      if (!r.ok) return fail(r.code);
      const source = r.data.sourceProvider;
      if (source !== "google" && source !== "line") return fail("ACCOUNTS_UNAVAILABLE");
      await startProviderProof(source);
    });
  const prove = (provider: AuthProviderId) => run(`prove-${provider}`, async () => void (await startProviderProof(provider)));
  const confirm = () =>
    run("confirm", async () => {
      const r = await postAccountAction("/api/account/intent/confirm", {});
      if (!r.ok) return fail(r.code);
      window.location.assign(`/account?account_notice=${r.data.kind === "unlink" ? "unlinked" : "linked"}`);
    });
  const cancel = () =>
    run("cancel", async () => {
      const r = await postAccountAction("/api/account/intent/cancel", {});
      if (!r.ok) return fail(r.code);
      window.location.assign(SETTINGS_PATH);
    });

  const locked = busy !== null || intent !== null;
  const cancelButton = (label = "ยกเลิกคำขอ") => (
    <button type="button" onClick={cancel} disabled={busy !== null} aria-busy={busy === "cancel"}>
      {label}
    </button>
  );

  const rows = PROVIDERS.map((provider) => {
    const identity = identities.find((i) => i.provider === provider);
    const label = LABELS[provider];
    const ready = providers[provider];
    const hintId = `${id}-${provider}`;
    if (!identity)
      return (
        <li key={provider} className={styles.method}>
          <div>
            <strong>{label}</strong>
            <span className={styles.meta} id={hintId}>
              {ready ? "ยังไม่ได้เชื่อม" : `ยังไม่ได้เชื่อม · ${label} ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => begin("link", provider)}
            disabled={!ready || locked}
            aria-busy={busy === `link-${provider}`}
            aria-describedby={hintId}
          >
            {`เชื่อม ${label}`}
          </button>
        </li>
      );
    const othersUsable = usable.filter((i) => i.provider !== provider).length > 0;
    return (
      <li key={provider} className={styles.method}>
        <div>
          <strong>{identity.displayName ?? `บัญชี ${label}`}</strong>
          {identity.email ? <span className={styles.meta}>{identity.email}</span> : null}
          <span className={styles.meta} id={hintId}>
            {`เชื่อมกับ ${label} แล้ว`}
            {identity.current ? " · ใช้เข้าสู่ระบบอยู่ตอนนี้" : ""}
            {ready ? "" : ` · ${label} ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้ จึงใช้เข้าสู่ระบบไม่ได้ตอนนี้`}
            {othersUsable ? "" : " · ยกเลิกไม่ได้ เพราะเป็นวิธีเข้าสู่ระบบเดียวที่ใช้ได้"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => begin("unlink", provider)}
          disabled={!othersUsable || locked}
          aria-busy={busy === `unlink-${provider}`}
          aria-describedby={hintId}
        >
          {`ยกเลิกการเชื่อม ${label}`}
        </button>
      </li>
    );
  });

  let step: ReactNode = null;
  if (intent) {
    const source = LABELS[intent.sourceProvider];
    const target = LABELS[intent.targetProvider];
    const total = intent.kind === "link" ? 3 : 2;
    let body: ReactNode;
    if (intent.phase === "await_source")
      body = (
        <>
          <p>
            ขั้นที่ 1 จาก {total}: ยืนยันว่าเป็นเจ้าของบัญชี {source} ที่ใช้อยู่ตอนนี้อีกครั้ง
            {intent.kind === "link" ? ` ก่อนเชื่อม ${target}` : ` ก่อนยกเลิกการเชื่อม ${target}`}
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => prove(intent.sourceProvider)}
            disabled={busy !== null}
            aria-busy={busy === `prove-${intent.sourceProvider}`}
          >
            {`ยืนยันตัวตนด้วย ${source} อีกครั้ง`}
          </button>
        </>
      );
    else if (intent.phase === "await_target")
      body = (
        <>
          <p>ขั้นที่ 2 จาก 3: เข้าสู่ระบบด้วยบัญชี {target} ที่ต้องการเชื่อม ระบบจะยังไม่เชื่อมจนกว่าคุณจะกดยืนยัน</p>
          <button
            type="button"
            className="primary"
            onClick={() => prove(intent.targetProvider)}
            disabled={busy !== null}
            aria-busy={busy === `prove-${intent.targetProvider}`}
          >
            {`เข้าสู่ระบบด้วย ${target} ที่ต้องการเชื่อม`}
          </button>
        </>
      );
    else
      body = (
        <>
          <p>
            ขั้นที่ {total} จาก {total}:{" "}
            {intent.kind === "link"
              ? `เชื่อมบัญชี ${target}${intent.pendingTargetName ? ` “${intent.pendingTargetName}”` : ""} เข้ากับบัญชีนี้`
              : `ยกเลิกการเชื่อม ${target} ออกจากบัญชีนี้`}
            <br />
            หลังยืนยัน ทุกอุปกรณ์จะออกจากระบบ และต้องเข้าสู่ระบบใหม่
          </p>
          <button type="button" className="primary" onClick={confirm} disabled={busy !== null} aria-busy={busy === "confirm"}>
            {intent.kind === "link" ? `ยืนยันการเชื่อม ${target}` : `ยืนยันยกเลิกการเชื่อม ${target}`}
          </button>
        </>
      );
    step = (
      <section className={styles.step} aria-labelledby={`${id}-step`}>
        <h2 id={`${id}-step`}>{intent.kind === "link" ? `กำลังเชื่อม ${target}` : `กำลังยกเลิกการเชื่อม ${target}`}</h2>
        {body}
        {cancelButton()}
        <p className={styles.meta}>คำขอนี้ใช้ได้ 10 นาที และใช้ได้เฉพาะในเบราว์เซอร์นี้</p>
      </section>
    );
  } else if (view.staleIntentCookie)
    step = (
      <section className={styles.step}>
        <p>คำขอก่อนหน้าใช้ต่อไม่ได้แล้ว (หมดเวลา ถูกยกเลิก หรือไม่ตรงกับการเข้าสู่ระบบนี้)</p>
        {cancelButton("ล้างคำขอ")}
      </section>
    );

  const status = error ? ACCOUNT_ERRORS[error].message : (notice ?? "");
  return (
    <div className={`account-form ${styles.settings}`}>
      <p role="status" aria-live="polite" className={styles.status}>
        {status}
      </p>
      {step}
      <h2 className={styles.heading}>วิธีเข้าสู่ระบบที่เชื่อมไว้</h2>
      <ul className={styles.methods}>{rows}</ul>
      <p>
        ระบบไม่รวมบัญชีให้อัตโนมัติจากอีเมล การเชื่อมเกิดขึ้นเมื่อคุณยืนยันเองทุกขั้นเท่านั้น
        <br />
        ทุกวิธีที่เชื่อมไว้เข้าสู่บัญชีเดียวกันและได้สิทธิ์สมาชิกเท่ากัน
        <br />
        ระบบอนุมัติสมาชิกและการดาวน์โหลดยังไม่เปิด
      </p>
    </div>
  );
}
