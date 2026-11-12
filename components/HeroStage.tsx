"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { commonPrefix, graphemes, headlinePhrase, type HeroClip } from "@/lib/hero-stage";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import styles from "./HeroStage.module.css";

const AUTO_MS = 6000;

/** Reduced motion or Save-Data: posters only, no autoplay, no typing. */
function useStill(): boolean | null {
  // null until checked on the client: nothing plays or types before that.
  const [still, setStill] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const save = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    const sync = () => setStill(mq.matches || save);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return still;
}

/**
 * Line 2 of the headline types "ทำแนว<แนวเรื่อง>" of the selected clip by Thai
 * grapheme cluster: erase only the differing tail (~28ms each), then type
 * (70-120ms each), with a blinking caret. Screen readers get the full phrase
 * in a visually hidden span; the typed span is aria-hidden. Still: the final
 * phrase at once, no caret blink.
 */
function Typewriter({ text, still }: { text: string; still: boolean }) {
  const [shown, setShown] = useState(text);
  const shownRef = useRef(graphemes(text));
  useEffect(() => {
    const target = graphemes(text);
    if (still) {
      shownRef.current = target;
      setShown(text);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const keep = commonPrefix(shownRef.current, target);
    const set = (g: string[]) => {
      shownRef.current = g;
      setShown(g.join(""));
    };
    const type = () => {
      const now = shownRef.current;
      if (now.length < target.length) {
        set(target.slice(0, now.length + 1));
        timer = setTimeout(type, 70 + Math.random() * 50);
      }
    };
    const erase = () => {
      const now = shownRef.current;
      if (now.length > keep) {
        set(now.slice(0, -1));
        timer = setTimeout(erase, 28);
      } else type();
    };
    erase();
    return () => clearTimeout(timer);
  }, [text, still]);
  return (
    <span className={styles.line2}>
      <span className={styles.tw} data-still={still ? "" : undefined} aria-hidden="true">
        {shown}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** One crossfade layer: the poster, and the muted loop on top when allowed. */
function Layer({ clip, on, play, priority }: { clip: HeroClip; on: boolean; play: boolean; priority: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (play) {
      if (!v.src) v.src = v.dataset.src ?? "";
      v.play().catch(() => {});
    } else v.pause();
  }, [play]);
  return (
    <div className={styles.layer} data-on={on ? "" : undefined} data-playing={playing ? "" : undefined}>
      <Image
        src={clip.poster.src}
        alt=""
        fill
        sizes="(max-width: 759px) 200px, 320px"
        priority={priority}
        className={styles.poster}
        draggable={false}
      />
      {clip.preview && (
        <video
          ref={video}
          className={styles.video}
          data-src={clip.preview}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
        />
      )}
    </div>
  );
}

/**
 * Homepage hero, option B "phone stage" (owner 2026-11-11): a 9:16 phone in
 * the centre plays the selected clip over an aura in the clip's colours; a
 * picker (shadcn ToggleGroup, arrow keys / Home / End) chooses the clip, with
 * prev/next buttons and auto-advance that a visible toggle stops. Only the
 * active preview plays, only while visible; reduced motion / Save-Data show
 * posters only. Only the next clip's poster is preloaded.
 */
export function HeroStage({ clips, headingId }: { clips: readonly HeroClip[]; headingId: string }) {
  const checked = useStill();
  const still = checked !== false;
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [held, setHeld] = useState(false); // hover / focus in the picker pauses, without turning auto off
  const [visible, setVisible] = useState(true);
  const [live, setLive] = useState("");
  const [rendered, setRendered] = useState<number[]>([0]);
  const stage = useRef<HTMLDivElement>(null);
  const picks = useRef<HTMLDivElement>(null);
  const clip = clips[index];
  const next = clips[(index + 1) % clips.length];

  const select = useCallback(
    (i: number, opts: { user?: boolean } = {}) => {
      const n = (i + clips.length) % clips.length;
      setIndex(n);
      setRendered((r) => [...r.filter((x) => x !== n).slice(-1), n]);
      if (opts.user) {
        setAuto(false);
        const c = clips[n];
        setLive(`กำลังแสดง ${c.label} · แนวภาพ ${c.visualTh} · แนวเรื่อง ${c.storyTh}`);
        // Keep the chosen card in view on the scrolling mobile row.
        picks.current
          ?.querySelector<HTMLElement>(`[data-clip="${c.id}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: still ? "auto" : "smooth" });
      }
    },
    [clips, still],
  );

  // Visible on screen and tab shown: the only times a preview may play.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    const onVis = () => setVisible(!document.hidden && el.getBoundingClientRect().bottom > 0);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Auto-advance: off for good once someone picks; held while they browse.
  const running = auto && !held && !still && visible;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => select(index + 1), AUTO_MS);
    return () => clearTimeout(t);
  }, [running, index, select]);

  // Preload only the next clip's poster.
  useEffect(() => {
    if (still) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = `/_next/image?url=${encodeURIComponent(next.poster.src)}&w=640&q=75`;
    document.head.append(link);
    return () => link.remove();
  }, [next, still]);

  const aura = { "--deep": clip.deep, "--accent": clip.accent } as CSSProperties;
  const by = clip.agent;

  return (
    <div className={styles.stageArea} style={aura}>
      <div className={styles.aura} aria-hidden="true" />
      <div className={styles.grid}>
        <div className={styles.copy}>
          <h1 id={headingId} className={styles.title}>
            <span className={styles.line1}>เห็นคลิปไหนถูกใจ</span>{" "}
            <Typewriter text={headlinePhrase(clip)} still={still} />
          </h1>
          <p className={styles.lead}>ทุกคลิปในจอนี้ทำด้วยสกิลฟรีบน kubcode กับ AI agent ในคอมคุณเอง ไม่ต้องตัดต่อเอง</p>
          <div className={styles.actions}>
            <Button asChild variant="feature" className={cn("h-13 px-6 text-base md:h-13", styles.cta)}>
              <a href="#get-started">
                เริ่มทำคลิปแรก
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="link" className={cn("h-13 text-base text-foreground", styles.ghost)}>
              <a href="#skill-index">ดูทุกแนวคลิป</a>
            </Button>
          </div>
          <p className={styles.works}>
            ทำได้ด้วย{" "}
            <a href="/tools/claude-code">
              <img src="/tool-icons/claudecode.svg" alt="" width={18} height={18} decoding="async" loading="eager" />
              Claude Code
            </a>{" "}
            หรือ{" "}
            <a href="/tools/opencode">
              <img src="/tool-icons/opencode.svg" alt="" width={18} height={18} decoding="async" loading="eager" />
              OpenCode
            </a>
          </p>
        </div>

        <div className={styles.stageWrap}>
          <div className={styles.phone}>
            <div ref={stage} className={styles.screen} role="img" aria-label={`${clip.label} · ${clip.visualTh} · ${clip.storyTh}`}>
              {rendered.map((i) => (
                <Layer
                  key={clips[i].id}
                  clip={clips[i]}
                  on={i === index}
                  play={i === index && visible && !still}
                  priority={i === 0}
                />
              ))}
            </div>
            <Button type="button" variant="outline" size="icon" className={cn(styles.ctrl, styles.prev)} aria-label="คลิปก่อนหน้า" onClick={() => select(index - 1, { user: true })}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" size="icon" className={cn(styles.ctrl, styles.next)} aria-label="คลิปถัดไป" onClick={() => select(index + 1, { user: true })}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className={styles.side}>
          <p className={styles.eyebrow} aria-hidden="true">กำลังเล่น</p>
          <div className={styles.meta}>
            <strong>{clip.label}</strong>
            <p>
              {clip.visualTh} · {clip.storyTh} · ทำด้วย <b>{by}</b>
            </p>
          </div>
          <p className={styles.eyebrow} id={`${headingId}-picks`}>
            เลือกแนวคลิป
          </p>
          <ToggleGroup
            ref={picks}
            type="single"
            rovingFocus={false}
            value={clip.id}
            onValueChange={(id) => id && select(clips.findIndex((c) => c.id === id), { user: true })}
            aria-labelledby={`${headingId}-picks`}
            className={styles.picks}
            onKeyDown={(e) => {
              // Arrow keys / Home / End change the clip, not only the focus (DECISION.md).
              const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
              let n: number | null = null;
              if (e.key in keys) n = index + keys[e.key];
              else if (e.key === "Home") n = 0;
              else if (e.key === "End") n = clips.length - 1;
              if (n === null) return;
              e.preventDefault();
              const target = clips[(n + clips.length) % clips.length];
              select(n, { user: true });
              requestAnimationFrame(() => picks.current?.querySelector<HTMLElement>(`[data-clip="${target.id}"]`)?.focus());
            }}
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
            }}
          >
            {clips.map((c) => (
              <ToggleGroupItem
                key={c.id}
                value={c.id}
                data-clip={c.id}
                tabIndex={c.id === clip.id ? 0 : -1}
                className={styles.pick}
                style={{ "--accent": c.accent } as CSSProperties}
              >
                <Image src={c.poster.src} alt="" width={34} height={48} sizes="34px" className={styles.thumb} />
                <span className={styles.pickText}>
                  {c.label}
                  <small>{c.visualTh}</small>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!still && (
            <Toggle
              variant="outline"
              className={cn("mt-3.5 pr-4 pl-3.5 text-sm", styles.pause)}
              pressed={!auto}
              onPressedChange={(stopped) => setAuto(!stopped)}
              data-hero-auto=""
            >
              {auto ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {/* Fixed name; aria-pressed says whether it is stopped (WCAG 4.1.2). */}
              <span>หยุดสลับอัตโนมัติ</span>
            </Toggle>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
