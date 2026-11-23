import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PlatformLogo, type Platform } from "@/components/PlatformLogo";
import { AUTOMATION_PLATFORMS } from "@/lib/automations/rules";
import { ACTIVITY_DAYS, DM_CAP_PER_MONTH, type DashboardActivity } from "@/lib/dashboard/store";
import styles from "@/app/account/account.module.css";

const PLATFORMS: readonly Platform[] = ["youtube", "instagram", "tiktok", "facebook"];
const isPlatform = (p: string): p is Platform => (PLATFORMS as readonly string[]).includes(p);
const fmt = (n: number) => n.toLocaleString("th-TH");

/** The top numbers of the Social dashboard: exact counts from kubcode's own records. */
export function SocialStats({ activity }: { activity: DashboardActivity }) {
  const items: [number, string][] = [
    [activity.posts.scheduled, "โพสต์ที่ตั้งเวลาไว้"],
    [activity.posts.published, `เผยแพร่แล้ว (${ACTIVITY_DAYS} วัน)`],
    [activity.answersThisMonth, "ตอบคอมเมนต์ให้แล้ว (เดือนนี้)"],
  ];
  return (
    <ul className={styles.stats} aria-label="ภาพรวม">
      {items.map(([n, label]) => (
        <li key={label}>
          <span className={styles.statNum}>{fmt(n)}</span>
          <span className={styles.statLabel}>{label}</span>
        </li>
      ))}
      {activity.posts.failed > 0 && (
        <li data-tone="warn">
          <span className={styles.statNum}>{fmt(activity.posts.failed)}</span>
          <span className={styles.statLabel}>โพสต์ไม่สำเร็จ ({ACTIVITY_DAYS} วัน)</span>
        </li>
      )}
    </ul>
  );
}

/**
 * What kubcode did on each channel: comments that matched a keyword in the
 * last 30 days, how many got an answer (Instagram DM, TikTok public reply),
 * and this month's answers against the monthly cap.
 */
export function SocialActivity({ activity }: { activity: DashboardActivity }) {
  // Only channels where kubcode answers comments (Instagram, TikTok).
  const answering = activity.channels.filter((c) => (AUTOMATION_PLATFORMS as readonly string[]).includes(c.platform));
  return (
    <section className={styles.card} aria-labelledby="activity-h">
      <div className={styles.cardHead}>
        <h2 id="activity-h" className={styles.cardTitle}>
          kubcode ทำงานให้คุณ
        </h2>
        <Link className={styles.headLink} href="/account/channels">
          ตั้งค่าตอบอัตโนมัติ <ChevronRight aria-hidden="true" />
        </Link>
      </div>
      {answering.length === 0 ? (
        <p className={styles.muted}>ยังไม่มีช่อง Instagram หรือ TikTok เชื่อมแล้วตั้งคีย์เวิร์ด ระบบจะตอบคอมเมนต์ให้</p>
      ) : (
        <table className={styles.activity}>
          <caption className="sr-only">คอมเมนต์ที่ตรงคีย์เวิร์ดใน {ACTIVITY_DAYS} วัน และคำตอบเดือนนี้ แยกตามช่อง</caption>
          <thead>
            <tr>
              <th scope="col">ช่อง</th>
              <th scope="col">ตรงคีย์เวิร์ด</th>
              <th scope="col">ตอบแล้ว</th>
              <th scope="col">เดือนนี้</th>
            </tr>
          </thead>
          <tbody>
            {answering.map((c) => (
              <tr key={c.channelId}>
                <th scope="row">
                  <span className={styles.activityName}>
                    {isPlatform(c.platform) ? <PlatformLogo platform={c.platform} size={18} /> : null}
                    <span>{c.platform === "youtube" ? c.name : `@${c.name}`}</span>
                  </span>
                </th>
                <td>{fmt(c.matched)}</td>
                <td>{fmt(c.answered)}</td>
                <td>
                  {fmt(c.answersThisMonth)}
                  <span className={styles.activityCap}> / {fmt(DM_CAP_PER_MONTH)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={styles.muted}>
        Instagram ตอบเป็น DM · TikTok ตอบใต้คอมเมนต์ · ตัวเลขนับจากระบบของ kubcode
      </p>
    </section>
  );
}
