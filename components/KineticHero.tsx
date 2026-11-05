"use client";
import { useId, type ReactNode } from "react";
import { Play } from "lucide-react";
import type { Skill } from "@/lib/catalog";
import { publishedShowcase, type ShowcaseItem, type StyleTool } from "@/lib/showcase";
import { StyleShelf } from "./StyleShelf";
import styles from "./KineticHero.module.css";

/* ------------------------------------------------------------- component */

const SHOWCASE = publishedShowcase();

export function KineticHero({
  skills,
  activeSlug,
  onSelectSkill,
  clips = SHOWCASE,
  styleTools,
  children,
}: {
  skills: readonly Skill[];
  activeSlug: string;
  onSelectSkill: (slug: string) => void;
  /** Clips for the style shelf; defaults to what this build may publish. */
  clips?: readonly ShowcaseItem[];
  /** Each style's tools with logos, resolved on the server (lib/showcase styleToolsFrom). */
  styleTools?: Readonly<Record<string, readonly StyleTool[]>>;
  /** Search / browse actions owned by the page (query state stays there). */
  children?: ReactNode;
}) {
  const headingId = useId();
  const active = skills.find((skill) => skill.slug === activeSlug);
  const activeHasMedia = Boolean(
    active?.examples.some((example) => example.video || example.poster),
  );

  const hasClips = clips.length > 0;

  return (
    <section
      className={styles.hero}
      aria-labelledby={headingId}
      data-media={hasClips ? "clips" : "none"}
    >
      <div className={styles.copy}>
        {hasClips ? (
          <>
            <h1 id={headingId} className={styles.title}>
              <span>ดูงานจริง</span> <span>แล้วลองทำเอง</span>
            </h1>
            <p className={styles.lead}>
              ตัวอย่างงานจริงสไตล์ละหนึ่งคลิป เลือกสไตล์ที่ชอบ
              แล้วดูว่าต้องใช้ skill และเครื่องมืออะไรบ้าง
            </p>
          </>
        ) : (
          // No approved clips: no claim that real work is visible here.
          <>
            <h1 id={headingId} className={styles.title}>
              <span>คลัง skill</span> <span>สำหรับลองทำเอง</span>
            </h1>
            <p className={styles.lead}>
              ตัวอย่างผลงานรอยืนยันสิทธิ์เผยแพร่ จึงยังไม่แสดงบนเว็บนี้
              ค้นหา skill และดูเครื่องมือกับสิ่งที่ต้องมีของแต่ละรายการได้ด้านล่าง
            </p>
          </>
        )}
        {children && <div className={styles.actions}>{children}</div>}
        {active && (
          <a className={styles.cue} href="#selected-example" onClick={(event) => {
            event.preventDefault();
            onSelectSkill(active.slug);
          }}>
            <span className={styles.cueIcon} aria-hidden="true">
              <Play size={15} />
            </span>
            <span>
              {activeHasMedia ? "เล่นตัวอย่าง " : "ดูรายละเอียด "}
              <strong>{active.name}</strong>
              {active.examples.length > 1 && (
                <span className={styles.cueNote}>
                  {" "}
                  · {active.examples.length} ผู้เขียน
                </span>
              )}
            </span>
          </a>
        )}
      </div>

      {hasClips && <StyleShelf items={clips} styleTools={styleTools} />}
    </section>
  );
}
