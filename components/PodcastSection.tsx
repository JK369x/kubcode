"use client";
import type { FocusEvent, PointerEvent } from "react";
import { approvedPackageFor } from "@/lib/packages";
import { podcastShowcase, publishedShowcase, type ShowcaseItem } from "@/lib/showcase";
import { SHOWCASE_STYLES } from "@/lib/showcase-allowlist";
import { CardActions, useAvailable, useSignedIn } from "./StyleShelf";
import { playPreview as play, stopPreview as stop } from "./hoverPreview";
import shelf from "./StyleShelf.module.css";
import styles from "./PodcastSection.module.css";

const PODCAST = podcastShowcase(publishedShowcase());

/**
 * The homepage podcast section: podcast shorts are their own category, kept
 * apart from the cartoon styles' shelf. The clips are use-case examples, one
 * card each crediting its source episode and licence; the skill's template
 * link and download appear once, next to the heading.
 */
export function PodcastSection({ items = PODCAST }: { items?: readonly ShowcaseItem[] }) {
  const signedIn = useSignedIn();
  const packaged = [
    ...new Set(
      items.flatMap((i) => {
        const skill = SHOWCASE_STYLES[i.style]?.skill;
        return skill && approvedPackageFor(skill) ? [skill] : [];
      }),
    ),
  ];
  const available = useAvailable(packaged);
  if (items.length === 0) return null;
  const style = SHOWCASE_STYLES[items[0].style];
  return (
    <section className={styles.section} aria-labelledby="podcast-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="podcast-heading">พอดแคสต์</h2>
          {style?.detail && <p>{style.detail}</p>}
        </div>
        {/* One skill, so one template link and one download for the section. */}
        <div className={styles.headingActions}>
          <CardActions
            entry={{ style: items[0].style, clip: items[0], count: items.length }}
            signedIn={signedIn}
            available={available[style?.skill ?? ""]}
          />
        </div>
      </div>
      <ul className={styles.grid}>
        {items.map((clip, i) => (
          <li
            key={clip.id}
            className={`${shelf.card} ${styles.card}`}
            data-style={clip.style}
            onPointerEnter={(e: PointerEvent<HTMLLIElement>) => e.pointerType !== "touch" && play(e.currentTarget)}
            onPointerLeave={(e: PointerEvent<HTMLLIElement>) => stop(e.currentTarget)}
            onFocus={(e: FocusEvent<HTMLLIElement>) => play(e.currentTarget)}
            onBlur={(e: FocusEvent<HTMLLIElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stop(e.currentTarget);
            }}
          >
            <div className={shelf.media}>
              <img
                className={shelf.poster}
                src={clip.poster.src}
                alt={clip.label}
                width={clip.poster.width}
                height={clip.poster.height}
                loading={i < 2 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
              />
              {clip.preview && (
                <video
                  className={shelf.video}
                  data-src={clip.preview.src}
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-hidden="true"
                  tabIndex={-1}
                />
              )}
            </div>
            <p className={shelf.name}>{clip.label}</p>
            {clip.credits.length > 0 && (
              <p className={shelf.meta}>
                {clip.credits.map((c, j) => (
                  <span key={c.text}>
                    {j > 0 && " · "}
                    {c.href ? <a href={c.href}>{c.text}</a> : c.text}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
