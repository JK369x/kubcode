"use client";
import { BadgeCheck, MessageCircle, Plus, Send, UserRound } from "lucide-react";
import { PlatformLogo, type Platform } from "./PlatformLogo";
import styles from "./SocialStage.module.css";

/**
 * kubcode Social demo inside the hero phone (owner, 2026-11-13). A drawing of
 * the visitor's own channel: generic names, no real accounts, nothing
 * fetched. Three screens: the weekly schedule, a published post, and a
 * keyword comment answered by DM. Each screen animates once when it becomes
 * active (CSS only, restarted by remounting); under reduced motion the CSS
 * shows the final frame.
 */
export type SocialScreen = { id: string; title: string; card: string; detail: string };

export const SOCIAL_SCREENS: readonly SocialScreen[] = [
  { id: "schedule", title: "ตั้งเวลาโพสต์", card: "ตั้งเวลา · ปฏิทิน", detail: "วางคลิปลงปฏิทินของสัปดาห์ ทุกช่องในที่เดียว" },
  { id: "published", title: "โพสต์ขึ้นแล้ว", card: "โพสต์ขึ้นอัตโนมัติ", detail: "ถึงเวลา ระบบโพสต์ลงทุกช่องให้เอง" },
  { id: "dm", title: "คอมเมนต์ → DM", card: "คอมเมนต์ → DM", detail: "คนคอมเมนต์คีย์เวิร์ด ได้ลิงก์ทาง DM (Instagram)" },
];

const DAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"] as const;
const SCHEDULED: readonly { day: number; platform: Platform; time: string; label: string }[] = [
  { day: 0, platform: "tiktok", time: "19:00", label: "TikTok" },
  { day: 2, platform: "instagram", time: "12:00", label: "Reels" },
  { day: 4, platform: "youtube", time: "18:00", label: "Shorts" },
];

export function SocialStage({ screen, keyword = "ลิงก์", link = "yourshop.com/promo" }: { screen: number; keyword?: string; link?: string }) {
  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <span className={styles.avatar}>
          <UserRound className="size-3.5" />
        </span>
        ช่องของคุณ
        <span className={styles.demo}>ตัวอย่าง</span>
      </div>
      {/* key: remount restarts the screen's entrance animation. */}
      <div key={screen} className={styles.body}>
        {screen === 0 && <Schedule />}
        {screen === 1 && <Published />}
        {screen === 2 && <Dm keyword={keyword} link={link} />}
      </div>
      <ol className={styles.dots}>
        {SOCIAL_SCREENS.map((s, i) => (
          <li key={s.id} data-on={i === screen ? "" : undefined} />
        ))}
      </ol>
    </div>
  );
}

function Schedule() {
  return (
    <div className={styles.calendar}>
      <p className={styles.heading}>สัปดาห์นี้</p>
      <ol className={styles.week}>
        {DAYS.map((d, i) => (
          <li key={d} className={styles.day}>
            <span className={styles.dayName}>{d}</span>
            {SCHEDULED.filter((s) => s.day === i).map((s) => (
              <span key={s.platform} className={styles.chip}>
                <PlatformLogo platform={s.platform} size={12} decorative />
                <span>
                  {s.label}
                  <b>{s.time}</b>
                </span>
              </span>
            ))}
            {i === 5 && (
              <span className={`${styles.chip} ${styles.drop}`}>
                <PlatformLogo platform="instagram" size={12} decorative />
                <span>
                  โพสต์
                  <b>20:00</b>
                </span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className={styles.added}>
        <Plus className="size-3.5" />
        เพิ่มคลิปใหม่ ส. 20:00 แล้ว
      </p>
    </div>
  );
}

function Published() {
  return (
    <div className={styles.post}>
      <div className={styles.thumb} />
      <p className={styles.caption}>คลิปใหม่ของคุณ · ตอนที่ 12</p>
      <ul className={styles.status}>
        {(["tiktok", "instagram", "youtube"] as const).map((p, i) => (
          <li key={p} style={{ "--i": i } as React.CSSProperties}>
            <PlatformLogo platform={p} size={14} decorative />
            <span>{p === "tiktok" ? "TikTok" : p === "instagram" ? "Instagram" : "YouTube"}</span>
            <span className={styles.ok}>
              เผยแพร่แล้ว <BadgeCheck className="size-3.5" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dm({ keyword, link }: { keyword: string; link: string }) {
  return (
    <div className={styles.dm}>
      <p className={styles.platformRow}>
        <PlatformLogo platform="instagram" size={12} decorative /> Instagram · ส่ง DM
      </p>
      <div className={styles.comment}>
        <MessageCircle className="size-3.5" />
        <span>
          <b>ผู้ติดตาม</b> ขอ<span className={styles.key}>{keyword}</span>หน่อย
        </span>
      </div>
      <p className={styles.small}>ข้อความจากช่องของคุณ</p>
      <div className={styles.reply}>
        <Send className="size-3.5" />
        <span>
          นี่ลิงก์ที่ขอไว้
          <span className={styles.link}>{link}</span>
        </span>
      </div>
      <p className={styles.sent}>
        <BadgeCheck className="size-3.5" /> ส่ง DM อัตโนมัติแล้ว
      </p>
      {/* TikTok has no DM for this: the honest flow is a public reply. */}
      <div className={styles.tiktok}>
        <p className={styles.platformRow}>
          <PlatformLogo platform="tiktok" size={12} decorative /> TikTok · ตอบใต้คอมเมนต์
        </p>
        <div className={styles.comment}>
          <MessageCircle className="size-3.5" />
          <span>
            <b>ผู้ชม</b> <span className={styles.key}>{keyword}</span>
          </span>
        </div>
        <div className={styles.thread}>
          <span className={styles.threadBy}>ช่องของคุณ ตอบกลับ</span>
          ดูลิงก์ที่ไบโอได้เลย {link}
        </div>
      </div>
    </div>
  );
}
