"use client";
import { useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { styleShelf, type ShelfEntry, type ShowcaseItem } from "@/lib/showcase";
import { SHOWCASE_STYLES, type ShowcaseCredit } from "@/lib/showcase-allowlist";
import styles from "./StyleShelf.module.css";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram" } as const;

/** Widest a desktop card gets (CSS clamp upper bound) plus the gap. */
const CARD_SPAN = 232 + 20;
/** Each half of the loop must be wider than any screen, or the seam shows. */
const MIN_HALF_WIDTH = 2600;
/** Slow: seconds a card takes to travel its own width. */
const SECONDS_PER_CARD = 6;

/** How many times the styles repeat inside one half of the looping track. */
export function repeatsFor(styleCount: number): number {
  return styleCount > 0 ? Math.max(1, Math.ceil(MIN_HALF_WIDTH / (styleCount * CARD_SPAN))) : 0;
}

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

function Card({ entry, eager, copy }: { entry: ShelfEntry; eager: boolean; copy: boolean }) {
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
      {...(copy ? { "data-copy": "", "aria-hidden": true, inert: true } : {})}
      onPointerEnter={(e: PointerEvent<HTMLLIElement>) => e.pointerType !== "touch" && play(e.currentTarget)}
      onPointerLeave={(e: PointerEvent<HTMLLIElement>) => stop(e.currentTarget)}
      onFocus={(e: FocusEvent<HTMLLIElement>) => play(e.currentTarget)}
      onBlur={(e: FocusEvent<HTMLLIElement>) => stop(e.currentTarget)}
    >
      {content}
    </li>
  );
}

/**
 * One card per style: the style's cover clip, its name and how many clips use
 * it. The row slides slowly in a seamless loop (two equal halves; the track
 * moves by exactly one half). Hover, focus and the pause button stop it;
 * reduced motion shows a static, scrollable row instead.
 */
export function StyleShelf({ items }: { items: readonly ShowcaseItem[] }) {
  const [paused, setPaused] = useState(false);
  const shelf = styleShelf(items);
  const credits = creditsOf(shelf.map((s) => s.clip));
  const repeats = repeatsFor(shelf.length);
  const half = Array.from({ length: repeats }, () => shelf).flat();
  const track = [...half, ...half];
  const duration = { "--slide-duration": `${half.length * SECONDS_PER_CARD}s` } as CSSProperties;
  return (
    <div className={styles.shelf} {...(paused ? { "data-paused": "" } : {})}>
      <div className={styles.viewport}>
        <ul className={styles.track} style={duration} aria-label="ตัวอย่างคลิป สไตล์ละหนึ่งคลิป">
          {track.map((entry, i) => (
            <Card key={`${entry.style}-${i}`} entry={entry} eager={i < 6} copy={i >= shelf.length} />
          ))}
        </ul>
      </div>
      <div className={styles.footer}>
        {credits.length > 0 ? (
          <p className={styles.credits}>
            เครดิต:{" "}
            {credits.map((c, i) => (
              <span key={c.text}>
                {i > 0 && ", "}
                {c.href ? <a href={c.href}>{c.text}</a> : c.text}
              </span>
            ))}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={paused}
          data-motion-toggle=""
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          <span>หยุดเลื่อน</span>
        </button>
      </div>
    </div>
  );
}
