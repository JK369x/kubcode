"use client";
import type { FocusEvent, PointerEvent, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { styleShelf, type ShelfEntry, type ShowcaseItem } from "@/lib/showcase";
import { SHOWCASE_STYLES, type ShowcaseCredit } from "@/lib/showcase-allowlist";
import styles from "./StyleShelf.module.css";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram" } as const;

/** Every distinct credit across the shown clips, in first-seen order. */
export function creditsOf(items: readonly ShowcaseItem[]): ShowcaseCredit[] {
  const seen = new Map<string, ShowcaseCredit>();
  for (const item of items) for (const c of item.credits) if (!seen.has(c.text)) seen.set(c.text, c);
  return [...seen.values()];
}

// Previews play only while someone points at or focuses a card: nothing
// moves on its own, and nothing downloads until then.
function play(card: HTMLElement) {
  const video = card.querySelector<HTMLVideoElement>("video[data-src]");
  if (!video) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  if (!video.getAttribute("src")) video.src = video.dataset.src!;
  card.dataset.playing = "";
  video.play().catch(() => delete card.dataset.playing);
}
function stop(card: HTMLElement) {
  const video = card.querySelector<HTMLVideoElement>("video");
  delete card.dataset.playing;
  if (!video) return;
  video.pause();
  if (video.readyState > 0) video.currentTime = 0;
}

function Card({ entry, eager }: { entry: ShelfEntry; eager: boolean }) {
  const { clip, count } = entry;
  const style = SHOWCASE_STYLES[entry.style] ?? { name: entry.style };
  const body: ReactNode = (
    <>
      <span className={styles.media}>
        <img
          className={styles.poster}
          src={clip.poster.src}
          alt={clip.label}
          width={clip.poster.width}
          height={clip.poster.height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
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
      <span className={styles.name}>{style.name}</span>
      <span className={styles.meta}>
        <span>
          {count} คลิป
          {!style.skill && clip.link && `, ดูบน ${PLATFORM[clip.link.platform]}`}
        </span>
        {!style.skill && clip.link && (
          <>
            <ArrowUpRight size={14} aria-hidden="true" />
            <span className="sr-only">(เปิดแท็บใหม่)</span>
          </>
        )}
      </span>
    </>
  );

  let content: ReactNode;
  if (style.skill) {
    content = (
      <a className={styles.link} href={`/skills/${style.skill}`}>
        {body}
      </a>
    );
  } else if (clip.link) {
    content = (
      <a className={styles.link} href={clip.link.url} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  } else {
    content = <div className={styles.link}>{body}</div>;
  }

  return (
    <li
      className={styles.card}
      data-style={entry.style}
      onPointerEnter={(e: PointerEvent<HTMLLIElement>) => e.pointerType !== "touch" && play(e.currentTarget)}
      onPointerLeave={(e: PointerEvent<HTMLLIElement>) => stop(e.currentTarget)}
      onFocus={(e: FocusEvent<HTMLLIElement>) => play(e.currentTarget)}
      onBlur={(e: FocusEvent<HTMLLIElement>) => stop(e.currentTarget)}
    >
      {content}
    </li>
  );
}

/** One card per style: the style's cover clip, its name and how many clips use it. */
export function StyleShelf({ items }: { items: readonly ShowcaseItem[] }) {
  const shelf = styleShelf(items);
  const credits = creditsOf(shelf.map((s) => s.clip));
  return (
    <div className={styles.shelf}>
      <ul className={styles.row} aria-label="ตัวอย่างคลิป สไตล์ละหนึ่งคลิป">
        {shelf.map((entry, i) => (
          <Card key={entry.style} entry={entry} eager={i < 4} />
        ))}
      </ul>
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
    </div>
  );
}
