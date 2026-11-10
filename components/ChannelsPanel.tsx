"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { send } from "@/lib/interactions/client";
import type { ChannelStatus, ChannelView } from "@/lib/channels/store";
import styles from "./KeysSettings.module.css";

type Props = {
  channels: ChannelView[];
  notice: string | null;
  /** Whether comment → DM automations are on (read on the server). */
  automations?: boolean;
};

const NOTICES: Record<string, string> = {
  connected: "เชื่อมช่องสำเร็จแล้ว",
  connect_failed: "เชื่อมช่องไม่สำเร็จ ลองใหม่อีกครั้ง",
  connect_denied: "คุณยกเลิกการให้สิทธิ์ จึงยังไม่ได้เชื่อมช่อง",
  connect_expired: "คำขอเชื่อมช่องหมดเวลา ลองใหม่อีกครั้ง",
  connect_unavailable: "ระบบเชื่อมช่องยังไม่พร้อม",
};

const PLATFORMS: { id: "youtube" | "instagram"; label: string }[] = [
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
];

const PLATFORM_LABEL: Record<string, string> = { youtube: "YouTube", instagram: "Instagram" };

const STATUS: Record<ChannelStatus, string> = {
  active: "เชื่อมอยู่",
  needs_reconnect: "ต้องเชื่อมใหม่",
  disconnected: "ยกเลิกการเชื่อมแล้ว",
};

const date = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(iso));

export function ChannelsPanel({ channels, notice, automations = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(notice ? (NOTICES[notice] ?? "") : "");

  async function onConnect(platform: string) {
    setBusy(true);
    const r = await send<{ authorizeUrl: string }>("/api/channels/connect", "POST", { platform });
    if (!r.ok) {
      setBusy(false);
      return setStatus(r.message);
    }
    // Leaves kubcode for the platform's consent page; it returns to the callback.
    window.location.assign(r.authorizeUrl);
  }

  async function onDisconnect(id: string) {
    setBusy(true);
    const r = await send("/api/channels/" + id + "/disconnect", "POST", {});
    setBusy(false);
    setStatus(r.ok ? "ยกเลิกการเชื่อมช่องแล้ว" : r.message);
    if (r.ok) router.refresh();
  }

  return (
    <div className={styles.keys}>
      <p className={styles.lead}>
        เชื่อมช่อง YouTube และบัญชี Instagram เพื่อตั้งเวลาโพสต์คลิปจาก kubcode หน้าขอสิทธิ์จะขึ้นชื่อแอปของ
        Zernio ซึ่งเป็นผู้ให้บริการเชื่อมต่อที่ kubcode ใช้อยู่ตอนนี้
      </p>
      <p className={styles.status} role="status" aria-live="polite">
        {status}
      </p>

      <section className={styles.section} aria-labelledby="channels-list">
        <h2 id="channels-list">ช่องของคุณ</h2>
        {channels.length === 0 ? (
          <p className={styles.meta}>ยังไม่มีช่องที่เชื่อมไว้</p>
        ) : (
          <div className={styles.connections}>
            <ul>
              {channels.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{c.displayName}</strong> {PLATFORM_LABEL[c.platform] ?? c.platform}
                    {c.handle ? ` @${c.handle}` : ""} · {STATUS[c.status]}
                    {c.connectedAt ? ` · ตั้งแต่ ${date(c.connectedAt)}` : ""}
                  </span>
                  {automations && c.platform === "instagram" && c.status === "active" ? (
                    <Link href={`/account/channels/${c.id}/automations`}>ตั้งค่าตอบคอมเมนต์อัตโนมัติ</Link>
                  ) : null}
                  {c.status !== "disconnected" ? (
                    <button type="button" className={styles.danger} disabled={busy} onClick={() => onDisconnect(c.id)}>
                      ยกเลิกการเชื่อม
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="channels-add">
        <h2 id="channels-add">เชื่อมช่องใหม่</h2>
        <div className={styles.actions}>
          {PLATFORMS.map((p) => (
            <button key={p.id} type="button" className="primary" disabled={busy} onClick={() => onConnect(p.id)}>
              เชื่อม {p.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
