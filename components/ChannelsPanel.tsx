"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Instagram, Youtube } from "lucide-react";
import { send } from "@/lib/interactions/client";
import { CONNECTABLE, type Connectable } from "@/lib/channels/config";
import type { ChannelStatus, ChannelView } from "@/lib/channels/store";
import styles from "./KeysSettings.module.css";
import own from "./ChannelsPanel.module.css";

type Props = {
  channels: ChannelView[];
  notice: string | null;
  /** Whether comment automations are on (read on the server). */
  automations?: boolean;
};

const NOTICES: Record<string, string> = {
  connected: "เชื่อมช่องสำเร็จแล้ว",
  connect_failed: "เชื่อมช่องไม่สำเร็จ ลองใหม่อีกครั้ง",
  connect_denied: "คุณยกเลิกการให้สิทธิ์ จึงยังไม่ได้เชื่อมช่อง",
  connect_expired: "คำขอเชื่อมช่องหมดเวลา ลองใหม่อีกครั้ง",
  connect_unavailable: "ระบบเชื่อมช่องยังไม่พร้อม",
};

/** TikTok's note glyph (lucide has no TikTok icon). */
function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M16.6 3c.4 2.2 1.9 3.8 4.1 4v3.1a7.6 7.6 0 0 1-4.1-1.3v6.4a5.8 5.8 0 1 1-5.8-5.8c.3 0 .7 0 1 .1v3.2a2.7 2.7 0 1 0 1.8 2.5V3h3Z" />
    </svg>
  );
}

const PLATFORM: Record<Connectable, { label: string; icon: ReactNode }> = {
  youtube: { label: "YouTube", icon: <Youtube size={18} aria-hidden="true" /> },
  instagram: { label: "Instagram", icon: <Instagram size={18} aria-hidden="true" /> },
  tiktok: { label: "TikTok", icon: <TikTokIcon /> },
};
const platformOf = (p: string) => PLATFORM[p as Connectable] ?? { label: p, icon: null };

/** Platforms whose comments the automations page answers. */
const AUTOMATABLE = new Set(["instagram", "tiktok"]);

const STATUS: Record<ChannelStatus, string> = {
  active: "เชื่อมอยู่",
  needs_reconnect: "ต้องเชื่อมใหม่",
  disconnected: "ยกเลิกการเชื่อมแล้ว",
};

const date = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(iso));

const who = (c: ChannelView) => (c.handle ? `@${c.handle}` : c.displayName);

/** The confirm() text: which channel, and what stops with it. */
export const disconnectQuestion = (c: ChannelView) =>
  `ยกเลิกการเชื่อม ${platformOf(c.platform).label} ${who(c)} ใช่ไหม?\n\n` +
  "โพสต์ที่ตั้งเวลาไว้กับช่องนี้จะไม่ถูกโพสต์ และการตอบคอมเมนต์อัตโนมัติของช่องนี้จะหยุด";

export function ChannelsPanel({ channels, notice, automations = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(notice ? (NOTICES[notice] ?? "") : "");
  const live = channels.filter((c) => c.status !== "disconnected");
  const gone = channels.filter((c) => c.status === "disconnected");

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

  async function onDisconnect(c: ChannelView) {
    if (!window.confirm(disconnectQuestion(c))) return;
    setBusy(true);
    const r = await send("/api/channels/" + c.id + "/disconnect", "POST", {});
    setBusy(false);
    setStatus(r.ok ? `ยกเลิกการเชื่อม ${platformOf(c.platform).label} ${who(c)} แล้ว` : r.message);
    if (r.ok) router.refresh();
  }

  return (
    <div className={styles.keys}>
      <p className={styles.lead}>
        เชื่อมช่อง YouTube บัญชี Instagram และ TikTok เพื่อตั้งเวลาโพสต์คลิปจาก kubcode หน้าขอสิทธิ์จะขึ้นชื่อแอปของ Zernio
        ซึ่งเป็นผู้ให้บริการเชื่อมต่อที่ kubcode ใช้อยู่ตอนนี้
      </p>
      <p className={own.status} role="status" aria-live="polite">
        {status}
      </p>

      <section className={styles.section} aria-labelledby="channels-list">
        <h2 id="channels-list">ช่องของคุณ</h2>
        {live.length === 0 ? (
          <p className={styles.meta}>ยังไม่มีช่องที่เชื่อมไว้ เริ่มจากปุ่มด้านล่าง</p>
        ) : (
          <ul className={own.list}>
            {live.map((c) => {
              const p = platformOf(c.platform);
              return (
                <li key={c.id} className={own.row}>
                  <div className={own.who}>
                    <span className={own.platform}>
                      {p.icon}
                      {p.label}
                    </span>
                    <strong className={own.handle}>{who(c)}</strong>
                    <span className={c.status === "active" ? `${own.pill} ${own.ok}` : `${own.pill} ${own.warn}`}>{STATUS[c.status]}</span>
                    {c.handle && c.displayName !== c.handle ? <span className={own.meta}>{c.displayName}</span> : null}
                    {c.connectedAt ? <span className={own.meta}>ตั้งแต่ {date(c.connectedAt)}</span> : null}
                  </div>
                  <div className={own.rowActions}>
                    {automations && AUTOMATABLE.has(c.platform) && c.status === "active" ? (
                      <Link className={own.action} href={`/account/channels/${c.id}/automations`}>
                        ตั้งค่าตอบคอมเมนต์อัตโนมัติ
                      </Link>
                    ) : null}
                    <button type="button" className={`${styles.danger} ${own.action}`} disabled={busy} onClick={() => onDisconnect(c)}>
                      ยกเลิกการเชื่อม
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {gone.length > 0 ? (
          <details className={own.gone}>
            <summary>ช่องที่ยกเลิกแล้ว ({gone.length})</summary>
            <ul>
              {gone.map((c) => (
                <li key={c.id}>
                  {platformOf(c.platform).label} {who(c)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="channels-add">
        <h2 id="channels-add">เชื่อมช่องใหม่</h2>
        <div className={own.connect}>
          {CONNECTABLE.map((id) => (
            <button key={id} type="button" className="primary" disabled={busy} onClick={() => onConnect(id)}>
              {PLATFORM[id].icon}
              เชื่อม {PLATFORM[id].label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
