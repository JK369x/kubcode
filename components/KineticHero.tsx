"use client";
import { useId, type ReactNode } from "react";
import { ArrowDown, Play } from "lucide-react";
import type { Skill } from "@/lib/catalog";
import { cartoonShowcase, publishedShowcase, type ShowcaseItem, type StyleTool } from "@/lib/showcase";
import { VisualShelf } from "./VisualShelf";
import { HeroStage } from "./HeroStage";
import { heroClips } from "@/lib/hero-stage";
import styles from "./KineticHero.module.css";

/* ------------------------------------------------------------- component */

// Podcast clips belong on their skill page, never on this shelf.
const SHOWCASE = cartoonShowcase(publishedShowcase());

export function KineticHero({
  skills,
  activeSlug,
  onSelectSkill,
  clips = SHOWCASE,
  styleTools,
  children,
  pricing = false,
}: {
  skills: readonly Skill[];
  activeSlug: string;
  onSelectSkill: (slug: string) => void;
  /** Clips for the visual-style shelf; defaults to what this build may publish. */
  clips?: readonly ShowcaseItem[];
  /** Each visual style's tools with logos, resolved on the server (lib/showcase styleToolsFrom). */
  styleTools?: Readonly<Record<string, readonly StyleTool[]>>;
  /** Search / browse actions owned by the page (query state stays there). */
  children?: ReactNode;
  /** /pricing ships in this build (lib/site-routes hasPage). */
  pricing?: boolean;
}) {
  const headingId = useId();
  const active = skills.find((skill) => skill.slug === activeSlug);
  const activeHasMedia = Boolean(
    active?.examples.some((example) => example.video || example.poster),
  );

  const hasClips = clips.length > 0;
  // Option B phone stage (DECISION.md 2026-11-11) whenever its clips are publishable.
  const stage = heroClips(clips);

  return (
    <section
      className={styles.hero}
      aria-labelledby={headingId}
      data-media={hasClips ? "clips" : "none"}
    >
      {stage.length > 0 && <HeroStage clips={stage} headingId={headingId} pricing={pricing} />}
      <div className={styles.copy}>
        {stage.length > 0 ? null : hasClips ? (
          <>
            {/* Plain Thai, outcome first: no skill/agent/template/render jargon (owner, 2026-11-06). */}
            <h1 id={headingId} className={styles.title}>
              <span>คลิปแบบนี้</span> <span>ทำเองได้</span>
            </h1>
            <p className={styles.lead}>
              เลือกสไตล์ที่ชอบจากคลิปจริงด้านล่าง
              โหลดชุดคำสั่งฟรี แล้วทำคลิปแนวเดียวกันในคอมของคุณ
            </p>
            <a className={styles.start} href="#get-started">
              ดูวิธีทำคลิปแรก
              <ArrowDown size={17} aria-hidden="true" />
            </a>
          </>
        ) : (
          // No approved clips: no claim that real work is visible here.
          <>
            <h1 id={headingId} className={styles.title}>
              <span>ทำคลิปสั้น</span> <span>ได้เองในคอม</span>
            </h1>
            <p className={styles.lead}>
              ตัวอย่างผลงานรอยืนยันสิทธิ์เผยแพร่ จึงยังไม่แสดงบนเว็บนี้
              ดูเครื่องมือและสิ่งที่ต้องมีของแต่ละสไตล์ได้ด้านล่าง
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

      {hasClips && <VisualShelf items={clips} styleTools={styleTools} />}
    </section>
  );
}
