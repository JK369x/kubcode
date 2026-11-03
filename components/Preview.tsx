"use client";
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Skill } from "@/lib/catalog";
import { SkillIcon } from "./ToolChips";
import { ToolMark } from "./ToolMark";

/* Media shape comes from the real file's intrinsic size (video metadata or
 * image natural size) — never from a hard-coded guess per skill. Until it is
 * known the compact well assumes portrait, which is what most examples are. */
export type MediaShape =
  "pending" | "portrait" | "square" | "landscape" | "none";

export function shapeOf(width: number, height: number): MediaShape {
  if (!width || !height) return "pending";
  const ratio = width / height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

export function Preview({
  skill,
  compact = false,
  children,
}: {
  skill: Skill;
  compact?: boolean;
  /** Compact only: context + action rendered beside (desktop) or directly
   * under (mobile) the player, ahead of provenance/credits. */
  children?: ReactNode;
}) {
  const [choice, setChoice] = useState(skill.examples[0]?.id);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const example =
    skill.examples.find((item) => item.id === choice) || skill.examples[0];

  const measure = useCallback((w: number, h: number) => {
    if (!w || !h) return;
    setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
  }, []);
  // Media may finish loading before hydration; read it from the element too.
  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && el.readyState >= 1) measure(el.videoWidth, el.videoHeight);
    },
    [measure],
  );
  const imageRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (el && el.complete) measure(el.naturalWidth, el.naturalHeight);
    },
    [measure],
  );

  const hasMedia = Boolean(example?.video || example?.poster);
  const shape: MediaShape = !hasMedia
    ? "none"
    : size
      ? shapeOf(size.w, size.h)
      : "pending";
  const stageStyle: CSSProperties | undefined =
    hasMedia && size
      ? { aspectRatio: `${size.w} / ${size.h}`,
          ...(!compact && shapeOf(size.w, size.h) !== "portrait" ? { height: "auto" } : {}) }
      : undefined;

  const stage = (
    <div
      className="media-stage"
      key={skill.slug + "-" + example?.id}
      style={stageStyle}
    >
      {example?.video ? (
        <video
          key={example.video}
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={example.poster}
          controlsList="nodownload"
          aria-label={skill.name + " " + example.label}
          onLoadedMetadata={(event) =>
            measure(
              event.currentTarget.videoWidth,
              event.currentTarget.videoHeight,
            )
          }
        >
          <source src={example.video} type="video/mp4" />
          <p>เบราว์เซอร์นี้เล่นวิดีโอไม่ได้</p>
        </video>
      ) : example?.poster ? (
        <img
          ref={imageRef}
          src={example.poster}
          alt={"ภาพตัวอย่างจริง " + skill.name}
          onLoad={(event) =>
            measure(
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            )
          }
        />
      ) : (
        <div className="no-media">
          <SkillIcon category={skill.category} size={compact ? 40 : 48} />
          {!compact && <h2>{skill.name}</h2>}
          <p>ยังไม่มีสื่อพรีวิว</p>
          <p>อ่านวิธีใช้และข้อกำหนดแทนการแสดงสื่อที่ไม่เกี่ยวข้อง</p>
        </div>
      )}
    </div>
  );

  const variants = skill.examples.length > 1 && (
    <div className="variants" role="group" aria-label="เลือกผู้เขียนตัวอย่าง">
      {skill.examples.map((item) => (
        <button
          key={item.id}
          aria-pressed={example?.id === item.id}
          onClick={() => setChoice(item.id)}
        >
          <ToolMark name={item.author} size={18} />
          <span>
            {item.id === "claude"
              ? "Claude"
              : item.id === "codex"
                ? "Codex"
                : item.author}
          </span>
        </button>
      ))}
    </div>
  );

  const caption = (
    <div className="artifact-caption">
      <span>{example?.label || "เวิร์กโฟลว์ในเครื่อง"}</span>
      {!compact && <span>เพื่อศึกษาในเครื่อง · สิทธิ์เผยแพร่ยังไม่ยืนยัน</span>}
    </div>
  );

  const credits = example && (
    <details className="credits">
      <summary>ที่มาและเครื่องมือของตัวอย่าง</summary>
      <dl>
        <dt>ผู้เขียน / โมเดล</dt>
        <dd>
          {example.author} / {example.model}
        </dd>
        <dt>Renderer</dt>
        <dd>{example.renderer}</dd>
        <dt>เสียง</dt>
        <dd>{example.voice}</dd>
      </dl>
      <p>{example.notes}</p>
    </details>
  );

  if (!compact) {
    return (
      <section
        className="exhibit"
        id="selected-example"
        tabIndex={-1}
        aria-label={"ผลงานตัวอย่าง " + skill.name}
      >
        {stage}
        {variants}
        {caption}
        {credits}
      </section>
    );
  }

  return (
    <section
      className="exhibit compact-preview"
      id="selected-example"
      tabIndex={-1}
      aria-label={"ผลงานตัวอย่าง " + skill.name}
      data-shape={shape}
    >
      <div className="exhibit-media">
        {stage}
        {variants}
      </div>
      <div className="exhibit-aside">
        {children}
        <div className="exhibit-provenance">
          {caption}
          {credits}
        </div>
      </div>
    </section>
  );
}
