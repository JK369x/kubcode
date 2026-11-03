"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { Skill } from "@/lib/catalog";
import { coverFor, MEDIA_COVERS } from "@/lib/media-covers";
import { shapeOf, type MediaShape } from "./Preview";
import { getSkillTools } from "./ToolChips";
import { ToolMark } from "./ToolMark";
import styles from "./KineticHero.module.css";

/* ------------------------------------------------------------------ data */

/**
 * Intrinsic pixel sizes of the local posters the stage may use, read from the
 * files themselves (tests/local-media/assets.test.ts re-reads their headers).
 * Known sizes let the stage reserve exact boxes before images load (no layout
 * shift) without cropping or guessing. A poster missing here is simply not
 * used on the stage; it still appears in the catalog.
 */
export const POSTER_SIZES: Readonly<Record<string, { w: number; h: number }>> = {
  ...Object.fromEntries(Object.values(MEDIA_COVERS).map(c => [c.poster, { w: c.width, h: c.height }])),
    "/previews/jk-soft-story.png": { w: 1920, h: 1080 },
    "/previews/freshstack-what-if-glm.jpg": { w: 960, h: 540 },
    "/previews/low-poly-urban.png": { w: 1080, h: 1920 },
    "/previews/growkaz-stickman-claude.jpg": { w: 960, h: 1706 },
    "/previews/thai-survival-claude.jpg": { w: 960, h: 1706 },
  };

/** Presentation preference only; slugs are the catalog's stable ids. */
const STAGE_ORDER = [
  "jk-soft-story",
  "low-poly-urban",
  "freshstack-what-if",
  "growkaz-stickman",
  "thai-survival",
];

/** Slot 0 is the wide dominant work; the rest alternate shape and scale. */
const SLOT_SHAPES: readonly MediaShape[] = [
  "landscape",
  "portrait",
  "landscape",
  "portrait",
];

export type StageItem = {
  slot: number;
  slug: string;
  name: string;
  poster: string;
  width: number;
  height: number;
  shape: MediaShape;
  tools: string[];
};

/**
 * Picks up to four real catalog works for the stage. Only skills with a local
 * poster of known size qualify, so zero-media skills are excluded instead of
 * receiving stand-in art. Each slug appears at most once. Input is not
 * mutated.
 */
export function composeStage(skills: readonly Skill[]): StageItem[] {
  const rank = (slug: string) => {
    const index = STAGE_ORDER.indexOf(slug);
    return index === -1 ? STAGE_ORDER.length : index;
  };
  const candidates = skills
    .map((skill, index) => ({ skill, index }))
    .sort((a, b) => rank(a.skill.slug) - rank(b.skill.slug) || a.index - b.index)
    .flatMap(({ skill }) => {
      const poster = coverFor(skill);
      const size = poster ? POSTER_SIZES[poster] : undefined;
      if (!poster || !size) return [];
      return [{ skill, poster, size, shape: shapeOf(size.w, size.h) }];
    });

  const used = new Set<string>();
  const items: StageItem[] = [];
  for (const shape of SLOT_SHAPES) {
    const pick = candidates.find(
      (c) => c.shape === shape && !used.has(c.skill.slug),
    );
    if (!pick) break;
    used.add(pick.skill.slug);
    items.push({
      slot: items.length,
      slug: pick.skill.slug,
      name: pick.skill.name,
      poster: pick.poster,
      width: pick.size.w,
      height: pick.size.h,
      shape: pick.shape,
      tools: getSkillTools(pick.skill).map((tool) => tool.name),
    });
  }
  return items;
}

/* ---------------------------------------------------------------- motion */

export type MotionInputs = {
  reducedMotion: boolean;
  userPaused: boolean;
  onScreen: boolean;
  documentHidden: boolean;
  finePointer: boolean;
};

export type MotionState = {
  drift: "running" | "paused" | "off";
  parallax: boolean;
  entrance: boolean;
};

/** Single gate for every continuous effect on the stage. */
export function resolveMotion(input: MotionInputs): MotionState {
  if (input.reducedMotion) {
    return { drift: "off", parallax: false, entrance: false };
  }
  const running = !input.userPaused && input.onScreen && !input.documentHidden;
  return {
    drift: running ? "running" : "paused",
    parallax: running && input.finePointer,
    entrance: true,
  };
}

type Rect = { left: number; top: number; width: number; height: number };

/** Pointer position relative to the stage centre, clamped to [-1, 1]. */
export function pointerShift(
  clientX: number,
  clientY: number,
  rect: Rect,
): { x: number; y: number } {
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const clamp = (value: number) => Math.max(-1, Math.min(1, value)) || 0;
  return {
    x: clamp(((clientX - rect.left) / rect.width) * 2 - 1),
    y: clamp(((clientY - rect.top) / rect.height) * 2 - 1),
  };
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}

/* ------------------------------------------------------------- component */

export function KineticHero({
  skills,
  activeSlug,
  onSelectSkill,
  children,
}: {
  skills: readonly Skill[];
  activeSlug: string;
  onSelectSkill: (slug: string) => void;
  /** Search / browse actions owned by the page (query state stays there). */
  children?: ReactNode;
}) {
  const headingId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLUListElement>(null);
  const items = composeStage(skills);
  const active = skills.find((skill) => skill.slug === activeSlug);
  const activeHasMedia = Boolean(
    active?.examples.some((example) => example.video || example.poster),
  );

  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const [userPaused, setUserPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(false);
  const hasStage = items.length > 0;
  // No publishable works: nothing moves, so no motion loop or parallax.
  const motion: MotionState = hasStage
    ? resolveMotion({
        reducedMotion,
        userPaused,
        onScreen,
        documentHidden,
        finePointer,
      })
    : { drift: "off", parallax: false, entrance: false };

  // Offscreen: stop the loop while the stage is not visible.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry.isIntersecting),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // Hidden tab: stop the loop.
  useEffect(() => {
    const update = () => setDocumentHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Shallow pointer depth. Rect is read on enter (or after scroll/resize
  // invalidates it), never per move; writes are batched into one rAF.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !motion.parallax) return;
    let rect: Rect | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;
    const measure = () => {
      const r = root.getBoundingClientRect();
      rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    const write = () => {
      frame = 0;
      root.style.setProperty("--px", x.toFixed(3));
      root.style.setProperty("--py", y.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (!rect) measure();
      ({ x, y } = pointerShift(event.clientX, event.clientY, rect!));
      schedule();
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      schedule();
    };
    const invalidate = () => {
      rect = null;
    };
    root.addEventListener("pointerenter", measure);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    return () => {
      root.removeEventListener("pointerenter", measure);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      if (frame) cancelAnimationFrame(frame);
      root.style.setProperty("--px", "0");
      root.style.setProperty("--py", "0");
    };
  }, [motion.parallax]);

  function scrollRail(direction: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.8,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }

  if (!hasStage) {
    // Public build without rights-verified works: an honest, compact hero.
    // No stand-in artwork, no carousel or motion controls with nothing to
    // drive, and no claim that real work is visible here.
    return (
      <section
        ref={rootRef}
        className={styles.hero}
        aria-labelledby={headingId}
        data-media="none"
        data-drift={motion.drift}
        data-parallax="off"
        data-entrance="off"
        style={{ minHeight: "auto", paddingBottom: 36 }}
      >
        <div className={styles.copy}>
          <h1 id={headingId} className={styles.title}>
            <span>คลัง skill</span> <span>สำหรับลองทำเอง</span>
          </h1>
          <p className={styles.lead}>
            ตัวอย่างผลงานรอยืนยันสิทธิ์เผยแพร่ จึงยังไม่แสดงบนเว็บนี้
            ค้นหา skill และดูเครื่องมือกับสิ่งที่ต้องมีของแต่ละรายการได้ด้านล่าง
          </p>
          {children && <div className={styles.actions}>{children}</div>}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className={styles.hero}
      aria-labelledby={headingId}
      data-drift={motion.drift}
      data-parallax={motion.parallax ? "on" : "off"}
      data-entrance={motion.entrance ? "on" : "off"}
    >
      <div className={styles.copy}>
        <h1 id={headingId} className={styles.title}>
          <span>ดูงานจริง</span> <span>แล้วลองทำเอง</span>
        </h1>
        <p className={styles.lead}>
          เลือกงานที่ชอบจากผลงานจริง ดูว่าใช้เครื่องมืออะไร แล้วค้นหา skill
          ที่ทำมันขึ้นมา
        </p>
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

      <ul ref={railRef} className={styles.scene} aria-label="ผลงานจริงในคลัง">
        {items.map((item) => {
          const selected = item.slug === activeSlug;
          return (
            <li
              key={item.slug}
              className={styles.frag}
              data-slot={item.slot}
              data-shape={item.shape}
              style={
                {
                  "--i": item.slot,
                  "--ar": `${item.width} / ${item.height}`,
                } as CSSProperties
              }
            >
              <div className={styles.parallax}>
                <div className={styles.drift}>
                  <button
                    type="button"
                    className={styles.work}
                    data-slug={item.slug}
                    aria-pressed={selected}
                    aria-label={`${item.name} · ${item.tools.join(", ")} — เลือกแล้วเล่นตัวอย่างด้านล่าง`}
                    onClick={() => onSelectSkill(item.slug)}
                  >
                    <img
                      src={item.poster}
                      alt=""
                      width={item.width}
                      height={item.height}
                      decoding="async"
                      fetchPriority={item.slot === 0 ? "high" : "auto"}
                      draggable={false}
                    />
                    <span className={styles.plate} aria-hidden="true">
                      <span className={styles.plateName}>{item.name}</span>
                      <span className={styles.plateTools}>
                        {item.tools.map((tool) => (
                          <span key={tool} className={styles.plateTool}>
                            <ToolMark name={tool} size={16} />
                            <span className={styles.plateToolName}>{tool}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                    {selected && (
                      <span className={styles.selectedTag} aria-hidden="true">
                        กำลังเลือก
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.controls}>
        <span className={styles.railHint}>ปัดเพื่อดูงานอื่น</span>
        <button
          type="button"
          className={styles.railButton}
          aria-label="เลื่อนไปงานก่อนหน้า"
          onClick={() => scrollRail(-1)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.railButton}
          aria-label="เลื่อนไปงานถัดไป"
          onClick={() => scrollRail(1)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
        {reducedMotion ? (
          <span className={styles.motionNote}>
            ปิดภาพเคลื่อนไหวตามการตั้งค่าเครื่อง
          </span>
        ) : (
          <button
            type="button"
            className={styles.motionToggle}
            aria-pressed={userPaused}
            data-motion-toggle=""
            onClick={() => setUserPaused((paused) => !paused)}
          >
            {userPaused ? (
              <Play size={16} aria-hidden="true" />
            ) : (
              <Pause size={16} aria-hidden="true" />
            )}
            <span>หยุดภาพเคลื่อนไหว</span>
          </button>
        )}
      </div>
    </section>
  );
}
