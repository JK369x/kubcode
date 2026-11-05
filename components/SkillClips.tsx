"use client";
import type { FocusEvent, PointerEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ShowcaseItem, SkillShowcase } from "@/lib/showcase";
import { creditsOf } from "./StyleShelf";
import { playPreview, stopPreview } from "./hoverPreview";
import styles from "./SkillClips.module.css";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram" } as const;

// Hover or focus plays the muted loop; leaving stops it.
const hover = {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => e.pointerType !== "touch" && playPreview(e.currentTarget),
  onPointerLeave: (e: PointerEvent<HTMLElement>) => stopPreview(e.currentTarget),
  onFocus: (e: FocusEvent<HTMLElement>) => playPreview(e.currentTarget),
  onBlur: (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stopPreview(e.currentTarget);
  },
};

function Media({ clip, eager }: { clip: ShowcaseItem; eager: boolean }) {
  return (
    <span className={styles.media}>
      <img
        className={styles.poster}
        src={clip.poster.src}
        alt={clip.label}
        width={clip.poster.width}
        height={clip.poster.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
      {clip.preview && (
        <video
          className={styles.video}
          data-src={clip.preview.src}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
    </span>
  );
}

function PostLink({ clip, label }: { clip: ShowcaseItem; label: string }) {
  if (!clip.link) return null;
  return (
    <a className={styles.post} href={clip.link.url} target="_blank" rel="noopener noreferrer">
      {label} {PLATFORM[clip.link.platform]}
      <ArrowUpRight size={14} aria-hidden="true" />
      <span className="sr-only">(เปิดแท็บใหม่)</span>
    </a>
  );
}

/** The skill's cover clip, shown where the page's preview sits. */
export function SkillCover({ showcase }: { showcase: SkillShowcase }) {
  const { cover } = showcase;
  return (
    <figure className={styles.cover} {...hover}>
      <Media clip={cover} eager />
      <figcaption className={styles.caption}>
        <span>ตัวอย่าง: {cover.label}</span>
        <PostLink clip={cover} label="ดูคลิปเต็มบน" />
      </figcaption>
    </figure>
  );
}

/**
 * The skill's other approved clips (the cover is shown above them), plus the
 * credits every shown clip needs. Renders nothing when there is neither.
 */
export function SkillClipGrid({ showcase }: { showcase: SkillShowcase }) {
  const credits = creditsOf(showcase.clips);
  const others = showcase.clips.filter((c) => c.id !== showcase.cover.id);
  if (others.length === 0 && credits.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby={others.length > 0 ? "skill-clips-heading" : undefined}>
      {others.length > 0 && (
        <>
          <h2 id="skill-clips-heading">คลิปที่ทำด้วยสกิลนี้</h2>
          <ul className={styles.grid}>
            {others.map((clip, i) => (
              <li key={clip.id} className={styles.item} {...hover}>
                <Media clip={clip} eager={i < 2} />
                <p className={styles.label}>{clip.label}</p>
                <PostLink clip={clip} label="ดูบน" />
              </li>
            ))}
          </ul>
        </>
      )}
      {credits.length > 0 && (
        <p className={styles.credits}>
          เครดิต:{" "}
          {credits.map((c, i) => (
            <span key={c.text}>
              {i > 0 && ", "}
              {c.href ? <a href={c.href}>{c.text}</a> : c.text}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
