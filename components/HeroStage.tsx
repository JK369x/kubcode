"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { ArrowRight, BadgeCheck, CalendarClock, Check, ChevronLeft, ChevronRight, Clapperboard, MessageCircle, MessagesSquare, Pause, Play } from "lucide-react";
import { commonPrefix, graphemes, headlinePhrase, type HeroClip } from "@/lib/hero-stage";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import styles from "./HeroStage.module.css";
import { PLATFORMS, PlatformLogo } from "./PlatformLogo";
import { SOCIAL_SCREENS, SocialStage } from "./SocialStage";
import { PRODUCTS, productFromSearch, type ProductId } from "@/lib/products";

const AUTO_MS = 6000;
const SOCIAL_MS = 4000;
/** Social aura: a fixed brand palette (Instagram pink → kubcode purple → TikTok cyan) instead of clip colours. */
const SOCIAL_AURA = { deep: "#3b1a6b", accent: "#ff3d8b", cool: "#25f4ee" } as const;

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
  const line = useRef<HTMLSpanElement>(null);
  // Never clip (lead, 2026-11-12): the CSS size fits every phrase in the data;
  // if a longer one ever appears, shrink line 2 so the full phrase fits.
  useEffect(() => {
    const el = line.current;
    if (!el) return;
    const fit = () => {
      el.style.removeProperty("--tw-fit");
      const probe = document.createElement("span");
      probe.className = el.firstElementChild?.className ?? "";
      // max-width:none: the typed span is capped at the line width, the probe must not be.
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;max-width:none;width:max-content";
      probe.textContent = text;
      el.append(probe);
      const need = probe.getBoundingClientRect().width;
      probe.remove();
      const have = el.clientWidth;
      if (need > have && have > 0) el.style.setProperty("--tw-fit", String(Math.max(0.6, (have - 2) / need)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
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
    <span ref={line} className={styles.line2}>
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
export function HeroStage({ clips, headingId, pricing = false }: { clips: readonly HeroClip[]; headingId: string; pricing?: boolean }) {
  const [product, setProduct] = useState<ProductId>("studio");
  const copy = PRODUCTS[product];
  // ?product=studio|social, read after hydration so the static page stays one HTML.
  useEffect(() => setProduct(productFromSearch(window.location.search)), []);
  const chooseProduct = (p: ProductId) => {
    setProduct(p);
    const url = new URL(window.location.href);
    if (p === "studio") url.searchParams.delete("product");
    else url.searchParams.set("product", p);
    window.history.replaceState(window.history.state, "", url);
  };
  const checked = useStill();
  const still = checked !== false;
  // Social: line 2 types its phrases in turn (still: the first one only).
  const [socialIndex, setSocialIndex] = useState(0);
  const socialPhrase = PRODUCTS.social.line2[socialIndex % PRODUCTS.social.line2.length];
  useEffect(() => {
    if (product !== "social" || still) return;
    const t = setTimeout(() => setSocialIndex((i) => i + 1), 3200);
    return () => clearTimeout(t);
  }, [product, still, socialIndex]);
  const [index, setIndex] = useState(0);
  const [screen, setScreen] = useState(0);
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
    if (!running || product !== "studio") return;
    const t = setTimeout(() => select(index + 1), AUTO_MS);
    return () => clearTimeout(t);
  }, [running, index, select, product]);
  // Social demo: ~4 s per screen, same rules (stops on a pick, held while browsing, only when visible).
  const pickScreen = (n: number, opts: { user?: boolean } = {}) => {
    const k = (n + SOCIAL_SCREENS.length) % SOCIAL_SCREENS.length;
    setScreen(k);
    if (opts.user) {
      setAuto(false);
      setLive(`กำลังโชว์ ${SOCIAL_SCREENS[k].title}`);
    }
  };
  useEffect(() => {
    if (!running || product !== "social") return;
    const t = setTimeout(() => setScreen((k) => (k + 1) % SOCIAL_SCREENS.length), SOCIAL_MS);
    return () => clearTimeout(t);
  }, [running, screen, product]);

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

  const aura: Record<string, string> =
    product === "social"
      ? { "--deep": SOCIAL_AURA.deep, "--accent": SOCIAL_AURA.accent, "--cool": SOCIAL_AURA.cool }
      : { "--deep": clip.deep, "--accent": clip.accent };
  const by = clip.agent;

  return (
    <div className={styles.stageArea} style={aura as CSSProperties} data-product={product}>
      <div className={styles.aura} aria-hidden="true" />
      <div className={styles.grid}>
        <div className={styles.copy}>
          {/* Owner 2026-11-13: two product families; ?product=studio|social. */}
          <ToggleGroup
            type="single"
            value={product}
            onValueChange={(v) => v && chooseProduct(v as ProductId)}
            aria-label="เลือกผลิตภัณฑ์"
            className={styles.products}
          >
            <ToggleGroupItem value="studio" data-product="studio" className={styles.productTab}>
              <Clapperboard aria-hidden="true" />
              <span>
                <b>Studio</b> · {PRODUCTS.studio.tab}
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem value="social" data-product="social" className={styles.productTab}>
              <MessagesSquare aria-hidden="true" />
              <span>
                <b>Social</b> · {PRODUCTS.social.tab}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
          <p className={styles.productEyebrow}>{copy.eyebrow}</p>
          <h1 id={headingId} className={styles.title} data-product={product}>
            <span className={styles.line1}>{copy.line1}</span>{" "}
            <Typewriter text={product === "studio" ? headlinePhrase(clip) : socialPhrase} still={still} />
          </h1>
          <p className={styles.lead}>{copy.lead}</p>
          <ul className={styles.points} aria-label={`${copy.name} เหมาะกับ`}>
            {copy.points.map((pt) => (
              <li key={pt}>
                <Check aria-hidden="true" />
                {pt}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            {/* Primary: solid brand purple (MASTER.md --primary / --primary-foreground,
                9.4 / 7.2:1); secondary: outline of the same 48px height. Buttons
                never carry the link underline (components/ui/button.tsx). */}
            <Button asChild size="lg" className={cn("rounded-full px-6 text-base font-semibold", styles.cta)}>
              <a href={copy.cta.href}>
                {copy.cta.label}
                <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            {pricing ? (
              <Button asChild size="lg" variant="outline" className="rounded-full bg-background/40 px-6 text-base">
                <a href="/pricing">ดูราคา</a>
              </Button>
            ) : product === "studio" ? (
              <Button asChild size="lg" variant="outline" className="rounded-full bg-background/40 px-6 text-base">
                <a href="#skill-index">ดูทุกแนวคลิป</a>
              </Button>
            ) : null}
          </div>
          {product === "studio" ? (
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
          ) : null}
          {/* Owner 2026-11-13: posting and replies run through kubcode, in one place. */}
          <p className={styles.social}>
            <span>ตั้งเวลาโพสต์และตอบคอมเมนต์ผ่าน kubcode ได้ในที่เดียว</span>
            {(["youtube", "instagram", "tiktok"] as const).map((p) => (
              <span key={p} className={styles.socialChip}>
                <PlatformLogo platform={p} size={16} decorative />
                {PLATFORMS[p].name}
              </span>
            ))}
          </p>
        </div>

        <div className={styles.stageWrap}>
          <div className={styles.phone}>
            {/* Both stages stay mounted in the same box: switching products only
                crossfades (≤200 ms, none under reduced motion), so nothing jumps. */}
            <div ref={stage} className={styles.screen}>
              <div
                className={styles.stageLayer}
                data-on={product === "studio" ? "" : undefined}
                aria-hidden={product !== "studio"}
                role="img"
                aria-label={`${clip.label} · ${clip.visualTh} · ${clip.storyTh}`}
              >
                {rendered.map((i) => (
                  <Layer
                    key={clips[i].id}
                    clip={clips[i]}
                    on={i === index}
                    play={product === "studio" && i === index && visible && !still}
                    priority={i === 0}
                  />
                ))}
              </div>
              <div
                className={styles.stageLayer}
                data-on={product === "social" ? "" : undefined}
                aria-hidden={product !== "social"}
                role="img"
                aria-label={`ตัวอย่างบนช่องของคุณ: ${SOCIAL_SCREENS[screen].title}`}
              >
                {product === "social" && <SocialStage screen={screen} />}
              </div>
            </div>
            {product === "studio" ? (
              <>
                <Button type="button" variant="outline" size="icon" className={cn(styles.ctrl, styles.prev)} aria-label="คลิปก่อนหน้า" onClick={() => select(index - 1, { user: true })}>
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon" className={cn(styles.ctrl, styles.next)} aria-label="คลิปถัดไป" onClick={() => select(index + 1, { user: true })}>
                  <ChevronRight aria-hidden="true" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" size="icon" className={cn(styles.ctrl, styles.prev)} aria-label="ตัวอย่างก่อนหน้า" onClick={() => pickScreen(screen - 1, { user: true })}>
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon" className={cn(styles.ctrl, styles.next)} aria-label="ตัวอย่างถัดไป" onClick={() => pickScreen(screen + 1, { user: true })}>
                  <ChevronRight aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className={styles.side}>
          {product === "studio" ? (
            <>
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
            </>
          ) : (
            <>
          <p className={styles.eyebrow} aria-hidden="true">กำลังโชว์</p>
          <div className={styles.meta}>
            <strong>{SOCIAL_SCREENS[screen].title}</strong>
            <p>{SOCIAL_SCREENS[screen].detail}</p>
          </div>
          <p className={styles.eyebrow} id={`${headingId}-social`}>
            ดูทีละขั้น
          </p>
          <ToggleGroup
            type="single"
            value={SOCIAL_SCREENS[screen].id}
            onValueChange={(id) => id && pickScreen(SOCIAL_SCREENS.findIndex((x) => x.id === id), { user: true })}
            aria-labelledby={`${headingId}-social`}
            className={cn(styles.picks, styles.socialPicks)}
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
            }}
          >
            {SOCIAL_SCREENS.map((x, k) => (
              <ToggleGroupItem key={x.id} value={x.id} data-screen={x.id} className={styles.pick}>
                <span className={styles.stepIcon} aria-hidden="true">
                  {k === 0 ? <CalendarClock /> : k === 1 ? <BadgeCheck /> : <MessageCircle />}
                </span>
                <span className={styles.pickText}>
                  {x.card}
                  <small>ขั้นที่ {k + 1}</small>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
            </>
          )}
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
