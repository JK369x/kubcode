"use client";
import { useEffect, useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";
import { ArrowUpRight, Download, LockKeyhole, Pause, Play } from "lucide-react";
import { approvedPackageFor } from "@/lib/packages";
import { fetchAvailable, fetchSignedIn, startDownload } from "@/lib/downloads/client";
import { downloadPhase } from "@/lib/downloads/view";
import { visualShelf, type ShelfEntry, type ShowcaseItem, type StyleTool } from "@/lib/showcase";
import { STORY_FORMATS, VISUAL_STYLES, type StoryKey } from "@/lib/taxonomy";
import { ToolLogo } from "./ToolLogo";
import { SkeletonImage } from "./SkeletonImage";
import { playPreview as play, stopPreview as stop } from "./hoverPreview";
import { SHOWCASE_AGENTS, SHOWCASE_VISUALS, type ShowcaseCredit, type ShowcaseMadeBy } from "@/lib/showcase-allowlist";
import styles from "./VisualShelf.module.css";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/** Card actions sit on the dark media scrim in both themes: pill Buttons, 44px on touch. */
const ACTION = "h-11 min-w-0 flex-1 basis-0 rounded-full px-2.5 text-[13px] md:h-10";
/** The primary pill keeps the dark-theme chip colours: the media is dark in both themes (MASTER.md --card-media). */
const ON_MEDIA_PRIMARY = "bg-[#d1b9ff] text-[#291640] [a]:hover:bg-[#bb98ff] [a]:hover:text-[#291640] focus-visible:outline-[#d1b9ff]";
const ON_SCRIM = "border-white/45 bg-black/35 text-white hover:enabled:border-white hover:enabled:bg-black/50 [a]:hover:border-white [a]:hover:bg-black/50 focus-visible:outline-[#d1b9ff]";

const PLATFORM = { youtube: "YouTube", instagram: "Instagram" } as const;

/** Rendered poster width (CSS --card-w), for the optimiser's srcset. */
const SHELF_SIZES = "(max-width: 719px) 42vw, 232px";

/** Widest a desktop card gets (CSS clamp upper bound) plus the gap. */
const CARD_SPAN = 232 + 20;
/** Each half of the loop must be wider than any screen, or the seam shows. */
const MIN_HALF_WIDTH = 2600;
/** Slow: seconds a card takes to travel its own width. */
const SECONDS_PER_CARD = 6;

/** How many times the visual styles repeat inside one half of the looping track. */
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
function useSignedIn(): boolean | undefined {
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
function useAvailable(skills: readonly string[]): Readonly<Record<string, boolean>> {
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
 * A card's actions. Visual styles with a skill: "ดู template" plus a download that
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
  const style = SHOWCASE_VISUALS[entry.visual];
  const { clip } = entry;
  if (style?.skill) {
    return (
      <div className={styles.actions}>
        <Button asChild className={cn(ACTION, ON_MEDIA_PRIMARY, styles.action)}>
          <a href={`/skills/${style.skill}`}>ดู template</a>
        </Button>
        <SkillDownload skill={style.skill} signedIn={signedIn} available={available} />
      </div>
    );
  }
  if (!clip.link) return null;
  return (
    <div className={styles.actions}>
      <Button asChild className={cn(ACTION, ON_MEDIA_PRIMARY, styles.action)}>
        <a href={clip.link.url} target="_blank" rel="noopener noreferrer">
          ดูคลิป
          <ArrowUpRight size={14} aria-hidden="true" />
          <span className="sr-only">บน {PLATFORM[clip.link.platform]} (เปิดแท็บใหม่)</span>
        </a>
      </Button>
    </div>
  );
}

/**
 * The card's download control (ADR 0002). A skill with no approved package
 * says it is coming for everyone, since signing in would not help.
 */
function SkillDownload({ skill, signedIn, available }: { skill: string; signedIn: boolean | undefined; available?: boolean }) {
  const [working, setWorking] = useState(false);
  const phase = downloadPhase({ hasPackage: approvedPackageFor(skill) !== null, signedIn, available, working });

  if (phase === "none" || phase === "closed") {
    return (
      <Button type="button" variant="outline" className={cn(ACTION, ON_SCRIM, styles.lock)} disabled>
        <span className="sr-only">ดาวน์โหลดเร็วๆ นี้</span>
        <span aria-hidden="true">เร็วๆ นี้</span>
      </Button>
    );
  }
  // Until the session is known, offer sign-in: most visitors are signed out.
  if (phase === "signin" || phase === "checking") {
    return (
      <Button asChild variant="outline" className={cn(ACTION, ON_SCRIM, styles.lock)}>
        <a href="/account" title="สมัครหรือเข้าสู่ระบบก่อนดาวน์โหลด">
          <LockKeyhole size={14} aria-hidden="true" />
          <span className="sr-only">เข้าสู่ระบบเพื่อดาวน์โหลด</span>
          <span aria-hidden="true">ดาวน์โหลด</span>
        </a>
      </Button>
    );
  }

  async function onClick() {
    setWorking(true);
    const message = await startDownload(skill);
    setWorking(false);
    if (message) toast.error("ดาวน์โหลดไม่สำเร็จ", { description: message });
  }
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(ACTION, ON_SCRIM, "border-[#d1b9ff] hover:enabled:bg-[#d1b9ff] hover:enabled:text-[#291640]", styles.download)}
      disabled={phase === "working"}
      aria-busy={phase === "working"}
      onClick={phase === "ready" ? onClick : undefined}
    >
      <Download size={14} aria-hidden="true" />
      {phase === "working" ? "กำลังเตรียม…" : "ดาวน์โหลด"}
    </Button>
  );
}

/** The clip's story format (แนวเรื่อง): a small label on the poster's top-left. */
export function StoryLabel({ story, className = styles.story }: { story: StoryKey; className?: string }) {
  return (
    <p className={className} data-story={story}>
      <span className="sr-only">แนวเรื่อง </span>
      {STORY_FORMATS[story]?.th ?? story}
      {STORY_FORMATS[story] && <span lang="en"> · {STORY_FORMATS[story].en}</span>}
    </p>
  );
}

/** Which agent and model made the clip: a small label on the poster. */
function MadeByBadge({ madeBy }: { madeBy: ShowcaseMadeBy }) {
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
  first,
  copy,
}: {
  entry: ShelfEntry;
  tools: readonly StyleTool[];
  signedIn: boolean | undefined;
  available: boolean | undefined;
  eager: boolean;
  /** The first cards on screen: the page's LCP candidates. */
  first: boolean;
  copy: boolean;
}) {
  const { clip, count } = entry;
  const style = SHOWCASE_VISUALS[entry.visual] ?? { detail: "", tools: [] };
  const name = VISUAL_STYLES[entry.visual] ?? { th: entry.visual, en: entry.visual };
  return (
    <li
      className={styles.card}
      data-visual={entry.visual}
      {...(copy ? { "data-copy": "", "aria-hidden": true, inert: true } : {})}
      onPointerEnter={(e: PointerEvent<HTMLLIElement>) => e.pointerType !== "touch" && play(e.currentTarget)}
      onPointerLeave={(e: PointerEvent<HTMLLIElement>) => stop(e.currentTarget)}
      onFocus={(e: FocusEvent<HTMLLIElement>) => play(e.currentTarget)}
      onBlur={(e: FocusEvent<HTMLLIElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) stop(e.currentTarget);
      }}
    >
      <div className={styles.media}>
        <SkeletonImage
          className={styles.poster}
          src={clip.poster.src}
          alt={clip.label}
          fill
          sizes={SHELF_SIZES}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={first ? "high" : undefined}
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
        <StoryLabel story={clip.story} />
        <ToolIcons tools={tools} />
        <MadeByBadge madeBy={clip.madeBy} />
        <div className={styles.overlay}>
          {style.detail && <p className={styles.detail}>{style.detail}</p>}
          <CardActions entry={entry} signedIn={signedIn} available={available} />
        </div>
      </div>
      <p className={styles.name}>{name.th}</p>
      <p className={styles.meta}>
        <span lang="en">{name.en}</span>
        <br />
        {count} คลิป
      </p>
      <p className={styles.stories}>
        <span className="sr-only">แนวเรื่อง: </span>
        {entry.stories.map((k) => STORY_FORMATS[k]?.th ?? k).join(" · ")}
      </p>
    </li>
  );
}

/**
 * One card per visual style (แนวภาพ): the style's cover clip with its story
 * format (แนวเรื่อง) as a small label, the style's name, how many clips use
 * it and which story formats they tell. The row slides slowly in a seamless loop (two equal halves; the track
 * moves by exactly one half). Hover, focus and the pause button stop it;
 * reduced motion shows a static, scrollable row instead.
 */
export function VisualShelf({
  items,
  styleTools = {},
}: {
  items: readonly ShowcaseItem[];
  /** Each visual style's tools with their logos, resolved on the server. */
  styleTools?: Readonly<Record<string, readonly StyleTool[]>>;
}) {
  const [paused, setPaused] = useState(false);
  const signedIn = useSignedIn();
  const shelf = visualShelf(items);
  const packaged = shelf.flatMap((e) => {
    const skill = SHOWCASE_VISUALS[e.visual]?.skill;
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
        <ul className={styles.track} style={duration} aria-label="ตัวอย่างคลิป แนวภาพละหนึ่งคลิป">
          {track.map((entry, i) => (
            <Card
              key={`${entry.visual}-${i}`}
              entry={entry}
              tools={styleTools[entry.visual] ?? []}
              signedIn={signedIn}
              available={available[SHOWCASE_VISUALS[entry.visual]?.skill ?? ""]}
              eager={i < 6}
              first={i < 2}
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
        <Toggle
          variant="outline"
          className={cn("pr-4 pl-3.5 text-sm", styles.toggle)}
          pressed={paused}
          data-motion-toggle=""
          onPressedChange={setPaused}
        >
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          <span>หยุดเลื่อน</span>
        </Toggle>
      </div>
    </div>
  );
}
