"use client";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { send } from "@/lib/interactions/client";
import type { AuditEntry, ConnectionMeta, Overview, SecretKind, SecretMeta } from "@/lib/keys/store";
import styles from "./KeysSettings.module.css";

type Props = { overview: Overview; canSave: boolean };

const CALLBACK = "https://kubcode.dev/api/keys/oauth/callback";

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(iso));
const date = (iso: string) => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(iso));

const CONNECTION_STATUS: Record<ConnectionMeta["status"], string> = {
  active: "ใช้งานได้",
  needs_reconnect: "ต้องเชื่อมใหม่",
  revoking: "กำลังยกเลิกการเชื่อม",
};

const EVENT_LABEL: Record<string, string> = {
  secret_saved: "บันทึกคีย์",
  secret_replaced: "แทนที่คีย์",
  secret_deleted: "ลบคีย์",
  oauth_connect_started: "เริ่มเชื่อมบัญชี",
  oauth_connected: "เชื่อมบัญชีแล้ว",
  oauth_connect_failed: "เชื่อมบัญชีไม่สำเร็จ",
  oauth_disconnected: "ยกเลิกการเชื่อมบัญชี",
  oauth_revoke_failed: "ยกเลิกสิทธิ์ที่ผู้ให้บริการไม่สำเร็จ",
  token_refreshed: "ต่ออายุ token",
  token_refresh_failed: "ต่ออายุ token ไม่สำเร็จ",
  secret_used: "ใช้คีย์",
};

const SUBJECT_LABEL: Record<string, string> = {
  youtube_oauth_client: "Google OAuth client",
  instagram_app: "Instagram app",
  elevenlabs_api_key: "ElevenLabs",
  youtube: "YouTube",
  instagram: "Instagram",
};

const ACTOR_LABEL: Record<string, string> = { user: "คุณ", lambda: "ระบบ", operator: "ผู้ดูแล" };

type FormSpec = {
  kind: SecretKind;
  publicLabel?: string;
  publicHint?: string;
  secretLabel: string;
};

function KeyForm({ spec, saved, canSave }: { spec: FormSpec; saved: SecretMeta | undefined; canSave: boolean }) {
  const router = useRouter();
  const id = useId();
  const [publicValue, setPublicValue] = useState(saved?.publicValue ?? "");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await send<{ replaced: boolean }>("/api/keys/secrets", "POST", {
      kind: spec.kind,
      publicValue: spec.publicLabel ? publicValue : null,
      secret,
    });
    setBusy(false);
    if (!r.ok) return setStatus(r.message);
    setSecret("");
    setStatus(r.replaced ? "แทนที่คีย์แล้ว" : "บันทึกคีย์แล้ว");
    router.refresh();
  }

  async function onDelete() {
    setBusy(true);
    const r = await send<{ disconnected: number }>(`/api/keys/secrets/${spec.kind}`, "DELETE", { confirmDisconnect });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "IN_USE") setConfirmDisconnect(true);
      return setStatus(r.message);
    }
    setConfirmDisconnect(false);
    setPublicValue("");
    setStatus(r.disconnected ? `ลบคีย์และยกเลิกการเชื่อม ${r.disconnected} บัญชีแล้ว` : "ลบคีย์แล้ว");
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={onSave}>
      <p className={styles.state}>
        {saved ? (
          <>
            ตั้งค่าแล้ว <span className={styles.hint}>••••{saved.hint ?? ""}</span>
            <span className={styles.meta}>
              ครั้งที่ {saved.version} · อัปเดต {dateTime(saved.updatedAt)}
            </span>
          </>
        ) : (
          "ยังไม่ได้ตั้งค่า"
        )}
      </p>
      {spec.publicLabel && (
        <label htmlFor={`${id}-pub`}>
          {spec.publicLabel}
          <input
            id={`${id}-pub`}
            value={publicValue}
            onChange={(e) => setPublicValue(e.target.value)}
            disabled={busy || !canSave}
            autoComplete="off"
            spellCheck={false}
            inputMode={spec.kind === "instagram_app" ? "numeric" : undefined}
            aria-describedby={spec.publicHint ? `${id}-pub-hint` : undefined}
          />
          {spec.publicHint && (
            <span id={`${id}-pub-hint`} className={styles.meta}>
              {spec.publicHint}
            </span>
          )}
        </label>
      )}
      <label htmlFor={`${id}-secret`}>
        {spec.secretLabel}
        <input
          id={`${id}-secret`}
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          disabled={busy || !canSave}
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={512}
          placeholder={saved ? "วางคีย์ใหม่เพื่อแทนที่" : ""}
        />
      </label>
      <div className={styles.actions}>
        <button type="submit" className="primary" disabled={busy || !canSave || !secret}>
          {saved ? "แทนที่คีย์" : "บันทึกคีย์"}
        </button>
        {saved && (
          <button type="button" className={confirmDisconnect ? styles.danger : undefined} disabled={busy} onClick={onDelete}>
            {confirmDisconnect ? "ยืนยันลบและยกเลิกการเชื่อม" : "ลบคีย์"}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={styles.status}>
        {status}
      </p>
    </form>
  );
}

function Connections({ items, provider, showExpiry }: { items: ConnectionMeta[]; provider: string; showExpiry?: boolean }) {
  return (
    <div className={styles.connections}>
      <h3>บัญชีที่เชื่อมไว้</h3>
      {items.length === 0 ? (
        <p className={styles.meta}>ยังไม่มีบัญชีที่เชื่อม</p>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <strong>{c.accountLabel ?? provider}</strong>
              <span className={styles.meta}>
                {CONNECTION_STATUS[c.status]}
                {c.lastCheckedAt && ` · ตรวจล่าสุด ${dateTime(c.lastCheckedAt)}`}
                {showExpiry && c.tokenExpiresAt && ` · token หมดอายุ ${date(c.tokenExpiresAt)}`}
              </span>
              <button type="button" disabled title="เร็วๆ นี้">
                ยกเลิกการเชื่อม
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.soon}>
        <button type="button" disabled>
          {provider === "YouTube" ? "เชื่อมช่อง" : "เชื่อมบัญชี"}
        </button>
        <span className={styles.meta}>เร็วๆ นี้ ปุ่มเชื่อมจะเปิดเมื่อระบบเชื่อมบัญชีพร้อม</span>
      </div>
    </div>
  );
}

function History({ audit }: { audit: AuditEntry[] }) {
  if (audit.length === 0) return <p className={styles.meta}>ยังไม่มีประวัติ</p>;
  return (
    <ol className={styles.history}>
      {audit.map((e, i) => (
        <li key={`${e.createdAt}-${i}`}>
          <span>
            {EVENT_LABEL[e.event] ?? e.event}
            {e.subject && ` · ${SUBJECT_LABEL[e.subject] ?? e.subject}`}
          </span>
          <span className={styles.meta}>
            {ACTOR_LABEL[e.actor] ?? e.actor} · {dateTime(e.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function KeysSettings({ overview, canSave }: Props) {
  const secret = (kind: SecretKind) => overview.secrets.find((s) => s.kind === kind);
  const of = (provider: ConnectionMeta["provider"]) => overview.connections.filter((c) => c.provider === provider);
  return (
    <div className={styles.keys}>
      <p className={styles.lead}>
        คีย์ทุกตัวถูกเข้ารหัสก่อนบันทึก และจะไม่ถูกส่งกลับมาที่หน้าเว็บอีก หน้านี้แสดงแค่สถานะกับ 4 ตัวท้าย
      </p>
      {!canSave && (
        <p className="setup-notice" role="status">
          ยังบันทึกคีย์ไม่ได้ ระบบเข้ารหัสยังไม่พร้อม ดูสถานะและลบคีย์เดิมได้ตามปกติ
        </p>
      )}

      <section className={styles.section} aria-labelledby="keys-youtube">
        <h2 id="keys-youtube">YouTube</h2>
        <details className={styles.steps}>
          <summary>ขั้นตอนตั้งค่าใน Google Cloud</summary>
          <ol>
            <li>สร้าง OAuth client แบบ <strong>Web application</strong> (แบบ Desktop ใช้กับเว็บไม่ได้)</li>
            <li>
              ใส่ Authorized redirect URI: <code>{CALLBACK}/youtube</code>
            </li>
            <li>
              เปลี่ยนแอปเป็น <strong>In production</strong> ถ้ายังเป็น Testing token จะหมดอายุทุก 7 วัน
            </li>
          </ol>
        </details>
        <KeyForm
          spec={{
            kind: "youtube_oauth_client",
            publicLabel: "Client ID",
            publicHint: "ลงท้ายด้วย .apps.googleusercontent.com",
            secretLabel: "Client secret",
          }}
          saved={secret("youtube_oauth_client")}
          canSave={canSave}
        />
        <Connections items={of("youtube")} provider="YouTube" />
      </section>

      <section className={styles.section} aria-labelledby="keys-instagram">
        <h2 id="keys-instagram">Instagram</h2>
        <details className={styles.steps}>
          <summary>ขั้นตอนตั้งค่าใน Meta for Developers</summary>
          <ol>
            <li>เปิด Instagram › API setup with Instagram business login › Business login settings</li>
            <li>
              ใส่ OAuth redirect URI: <code>{CALLBACK}/instagram</code>
            </li>
            <li>ใช้ Instagram app ID และ Instagram app secret (ไม่ใช่ Meta app ID)</li>
          </ol>
        </details>
        <KeyForm
          spec={{ kind: "instagram_app", publicLabel: "Instagram app ID", publicHint: "ตัวเลขล้วน", secretLabel: "Instagram app secret" }}
          saved={secret("instagram_app")}
          canSave={canSave}
        />
        <Connections items={of("instagram")} provider="Instagram" showExpiry />
      </section>

      <section className={styles.section} aria-labelledby="keys-other">
        <h2 id="keys-other">คีย์อื่น</h2>
        <h3>ElevenLabs</h3>
        <KeyForm spec={{ kind: "elevenlabs_api_key", secretLabel: "API key" }} saved={secret("elevenlabs_api_key")} canSave={canSave} />
      </section>

      <section className={styles.section} aria-labelledby="keys-history">
        <h2 id="keys-history">ประวัติ</h2>
        <p className={styles.meta}>20 รายการล่าสุด ไม่มีค่าคีย์อยู่ในประวัติ</p>
        <History audit={overview.audit} />
      </section>
    </div>
  );
}
