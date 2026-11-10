"use client";
import type { FocusEvent, PointerEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ShowcaseItem } from "@/lib/showcase";
import { SHOWCASE_VISUALS } from "@/lib/showcase-allowlist";
import { STORY_FORMATS, VISUAL_STYLES } from "@/lib/taxonomy";
import { playPreview, stopPreview } from "./hoverPreview";
import styles from "./ClipResults.module.css";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram" } as const;

const hover = {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => e.pointerType !== "touch" && playPreview(e.currentTarget),
  onPointerLeave: (e: PointerEvent<HTMLElement>) => stopPreview(e.currentTarget),
  onFocus: (e: FocusEvent<HTMLElement>) => playPreview(e.currentTarget),
  onBlur: (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stopPreview(e.currentTarget);
  },
};

/**
 * Homepage clips that match the แนวภาพ / แนวเรื่อง filters, shown while one
 * of them is set. Each clip carries its story format on the poster and its
 * visual style under it; it links to its skill page, else to its post.
 */
export function ClipResults({ clips }: { clips: readonly ShowcaseItem[] }) {
  return (
    <section className={styles.section} aria-labelledby="clip-results-heading">
      <h3 id="clip-results-heading" className={styles.heading}>
        คลิปที่ตรงกัน <span>{clips.length} คลิป</span>
      </h3>
      <ul className={styles.grid}>
        {clips.map((clip, i) => {
          const skill = SHOWCASE_VISUALS[clip.visual]?.skill;
          const href = skill ? `/skills/${skill}` : clip.link?.url;
          const external = !skill && Boolean(clip.link);
          return (
            <li key={clip.id} className={styles.item} data-visual={clip.visual} data-story={clip.story} {...hover}>
              <span className={styles.media}>
                <img
                  className={styles.poster}
                  src={clip.poster.src}
                  alt={clip.label}
                  width={clip.poster.width}
                  height={clip.poster.height}
                  loading={i < 4 ? "eager" : "lazy"}
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
                <span className={styles.story}>
                  <span className="sr-only">แนวเรื่อง </span>
                  {STORY_FORMATS[clip.story].th}
                  <span lang="en" className={styles.en}> · {STORY_FORMATS[clip.story].en}</span>
                </span>
              </span>
              <p className={styles.label}>
                {href ? (
                  <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {clip.label}
                    <ArrowUpRight size={14} aria-hidden="true" />
                    {external && clip.link && <span className="sr-only"> บน {PLATFORM[clip.link.platform]} (เปิดแท็บใหม่)</span>}
                  </a>
                ) : (
                  clip.label
                )}
              </p>
              <p className={styles.visual}>
                <span className="sr-only">แนวภาพ </span>
                {VISUAL_STYLES[clip.visual].th}
                <span lang="en" className={styles.en}> · {VISUAL_STYLES[clip.visual].en}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
