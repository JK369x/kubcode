"use client";
import { useEffect, useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";
import { ArrowUpRight, Download, LockKeyhole, Pause, Play } from "lucide-react";
import { approvedPackageFor } from "@/lib/packages";
import { fetchAvailable, fetchSignedIn, startDownload } from "@/lib/downloads/client";
import { downloadPhase } from "@/lib/downloads/view";
import { styleShelf, type ShelfEntry, type ShowcaseItem, type StyleTool } from "@/lib/showcase";
import { ToolLogo } from "./ToolLogo";
import { playPreview as play, stopPreview as stop } from "./hoverPreview";
import { SHOWCASE_AGENTS, SHOWCASE_STYLES, type ShowcaseCredit, type ShowcaseMadeBy } from "@/lib/showcase-allowlist";
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

/**
 * Whether someone is signed in: undefined until known. Read once from the
 * public session endpoint, like the header, so the page itself stays static.
 */
export function useSignedIn(): boolean | undefined {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchSignedIn().then((v) => live && setSignedIn(v));
    return () => {
      live = false;
    };
  }, []);
  return signedIn;
}

/** Whether the server serves each packaged skill's download, asked once per shelf. */
export function useAvailable(skills: readonly string[]): Readonly<Record<string, boolean>> {
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const key = skills.join(",");
  useEffect(() => {
    let live = true;
    for (const skill of key ? key.split(",") : [])
      fetchAvailable(skill).then((v) => live && setAvailable((a) => ({ ...a, [skill]: v })));
    return () => {
      live = false;
    };
  }, [key]);
  return available;
}

/**
 * A card's actions. Styles with a skill: "ดู template" plus a download that
 * stays locked: signed out it sends people to sign in; signed in it says
 * downloads are coming (there is no download service yet). Styles without a
 * skill only link to the clip.
 */
export function CardActions({
  entry,
  signedIn,
  available,
}: {
  entry: ShelfEntry;
  signedIn: boolean | undefined;
  /** undefined until the server has answered. */
  available?: boolean;
}) {
  const style = SHOWCASE_STYLES[entry.style];
  const { clip } = entry;
  if (style?.skill) {
    return (
      <div className={styles.actions}>
        <a className={styles.action} href={`/skills/${style.skill}`}>
          ดู template
        </a>
        <SkillDownload skill={style.skill} signedIn={signedIn} available={available} />
      </div>
    );
  }
  if (!clip.link) return null;
  return (
    <div className={styles.actions}>
      <a className={styles.action} href={clip.link.url} target="_blank" rel="noopener noreferrer">
        ดูคลิป
        <ArrowUpRight size={14} aria-hidden="true" />
        <span className="sr-only">บน {PLATFORM[clip.link.platform]} (เปิดแท็บใหม่)</span>
      </a>
    </div>
  );
}

/**
 * The card's download control (ADR 0002). A skill with no approved package
 * says it is coming for everyone, since signing in would not help.
 */
function SkillDownload({ skill, signedIn, available }: { skill: string; signedIn: boolean | undefined; available?: boolean }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const phase = downloadPhase({ hasPackage: approvedPackageFor(skill) !== null, signedIn, available, working });

  if (phase === "none" || phase === "closed") {
    return (
      <button type="button" className={styles.lock} disabled>
        <span className="sr-only">ดาวน์โหลดเร็วๆ นี้</span>
        <span aria-hidden="true">เร็วๆ นี้</span>
      </button>
    );
  }
  // Until the session is known, offer sign-in: most visitors are signed out.
  if (phase === "signin" || phase === "checking") {
    return (
      <a className={styles.lock} href="/account" title="สมัครหรือเข้าสู่ระบบก่อนดาวน์โหลด">
        <LockKeyhole size={14} aria-hidden="true" />
        <span className="sr-only">เข้าสู่ระบบเพื่อดาวน์โหลด</span>
        <span aria-hidden="true">ดาวน์โหลด</span>
      </a>
    );
  }

  async function onClick() {
    setWorking(true);
    setError("");
    const message = await startDownload(skill);
    setWorking(false);
    if (message) setError(message);
  }
  return (
    <>
      <button
        type="button"
        className={styles.download}
        disabled={phase === "working"}
        aria-busy={phase === "working"}
        onClick={phase === "ready" ? onClick : undefined}
      >
        <Download size={14} aria-hidden="true" />
        {phase === "working" ? "กำลังเตรียม…" : "ดาวน์โหลด"}
      </button>
      <p className={styles.error} role="status">
        {error}
      </p>
    </>
  );
}

/** Which agent and model made the clip: a small label on the poster. */
export function MadeByBadge({ madeBy }: { madeBy: ShowcaseMadeBy }) {
  const agent = SHOWCASE_AGENTS[madeBy.agent] ?? madeBy.agent;
  return (
    <p className={styles.madeBy}>
      <span className="sr-only">สร้างด้วย </span>
      <span className={styles.agent}>{agent}</span>
      <span className="sr-only"> โมเดล </span>
      <span className={styles.model} lang="en">{madeBy.model}</span>
    </p>
  );
}

function ToolIcons({ tools }: { tools: readonly StyleTool[] }) {
  if (tools.length === 0) return null;
  const shown = tools.slice(0, 3);
  const rest = tools.slice(3);
  return (
    <ul className={styles.tools} aria-label="เครื่องมือที่ใช้">
      {shown.map((t) => (
        <li key={t.slug} title={t.name}>
          <ToolLogo slug={t.slug} logo={t.logo} size="icon" morph={false} />
          <span className="sr-only">{t.name}</span>
        </li>
      ))}
      {rest.length > 0 && (
        <li className={styles.more} title={rest.map((t) => t.name).join(", ")}>
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">และอีก {rest.map((t) => t.name).join(", ")}</span>
        </li>
      )}
    </ul>
  );
}

function Card({
  entry,
  tools,
  signedIn,
  available,
  eager,
  copy,
}: {
  entry: ShelfEntry;
  tools: readonly StyleTool[];
  signedIn: boolean | undefined;
  available: boolean | undefined;
  eager: boolean;
  copy: boolean;
}) {
  const { clip, count } = entry;
  const style = SHOWCASE_STYLES[entry.style] ?? { name: entry.style, en: entry.style, detail: "", tools: [] };
  return (
    <li
      className={styles.card}
      data-style={entry.style}
      {...(copy ? { "data-copy": "", "aria-hidden": true, inert: true } : {})}
      onPointerEnter={(e: PointerEvent<HTMLLIElement>) => e.pointerType !== "touch" && play(e.currentTarget)}
      onPointerLeave={(e: PointerEvent<HTMLLIElement>) => stop(e.currentTarget)}
      onFocus={(e: FocusEvent<HTMLLIElement>) => play(e.currentTarget)}
      onBlur={(e: FocusEvent<HTMLLIElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stop(e.currentTarget);
      }}
    >
      <div className={styles.media}>
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
        <ToolIcons tools={tools} />
        <MadeByBadge madeBy={clip.madeBy} />
        <div className={styles.overlay}>
          {style.detail && <p className={styles.detail}>{style.detail}</p>}
          <CardActions entry={entry} signedIn={signedIn} available={available} />
        </div>
      </div>
      <p className={styles.name}>{style.name}</p>
      <p className={styles.meta}>
        <span lang="en">{style.en}</span>
        <br />
        {count} คลิป
      </p>
    </li>
  );
}

/**
 * One card per style: the style's cover clip, its name and how many clips use
 * it. The row slides slowly in a seamless loop (two equal halves; the track
 * moves by exactly one half). Hover, focus and the pause button stop it;
 * reduced motion shows a static, scrollable row instead.
 */
export function StyleShelf({
  items,
  styleTools = {},
}: {
  items: readonly ShowcaseItem[];
  /** Each style's tools with their logos, resolved on the server. */
  styleTools?: Readonly<Record<string, readonly StyleTool[]>>;
}) {
  const [paused, setPaused] = useState(false);
  const signedIn = useSignedIn();
  const shelf = styleShelf(items);
  const packaged = shelf.flatMap((e) => {
    const skill = SHOWCASE_STYLES[e.style]?.skill;
    return skill && approvedPackageFor(skill) ? [skill] : [];
  });
  const available = useAvailable(packaged);
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
            <Card
              key={`${entry.style}-${i}`}
              entry={entry}
              tools={styleTools[entry.style] ?? []}
              signedIn={signedIn}
              available={available[SHOWCASE_STYLES[entry.style]?.skill ?? ""]}
              eager={i < 6}
              copy={i >= shelf.length}
            />
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
