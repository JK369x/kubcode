import type { CSSProperties, ReactNode } from "react";

/*
 * ToolMark — the small mark beside a tool / author name.
 *
 * Two honest sources, never mixed up:
 *
 * 1. "brand" — an unmodified upstream logo file the parent fetched into
 *    public/tool-icons/ (commit, URL and sha256 are pinned in
 *    .qa/tool-icons-provenance.json; licences sit next to the assets).
 *    These are referenced by path, never redrawn here.
 *      - "image": rendered as <img>. Full-colour files keep their own colour;
 *        legitimately monochrome files (OpenCode, Three.js) are tagged
 *        tone="mono" so CSS can flip them for theme contrast — no invented
 *        brand colour.
 *      - "mask": monochrome simple-icons geometry (FFmpeg, GSAP) used as a CSS
 *        mask and filled with that project's own brand green in CSS.
 *
 * 2. "symbol" — a hand-authored functional drawing for names that have no
 *    fetched official logo (Canvas 2D, Editable SVG, captions, local speech
 *    synthesis, Remotion — upstream fetch 404'd — HyperFrames, a human local
 *    study, unknown). These are generic pictograms, are NOT brand logos, and
 *    must never be described as one. CSS gives each a distinct colour.
 *
 * `kind` records the role a name plays in this catalog's own metadata (who
 * authored an example, or what a renderer/requirement names). It is not a
 * claim of compatibility, endorsement, or that a tool is installed.
 *
 * Every mark is decorative (aria-hidden; img alt=""): the visible chip or
 * button text always carries the real name.
 */

export type ToolKind = "coding-agent" | "runtime" | "local" | "unknown";

export type ToolMarkKey =
  | "claude-code"
  | "codex-cli"
  | "opencode"
  | "react"
  | "remotion"
  | "threejs"
  | "gsap"
  | "hyperframes"
  | "canvas2d"
  | "ffmpeg"
  | "editable-svg"
  | "voice-synthesis"
  | "captions"
  | "local-study"
  | "unknown";

export type ToolMarkSource =
  | {
      source: "brand";
      render: "image" | "mask";
      src: string;
      tone: "color" | "mono";
    }
  | { source: "symbol" };

type MarkDef = { kind: ToolKind; mark: ToolMarkSource; draw?: ReactNode };

const ICONS = "/tool-icons/";

const brand = (
  file: string,
  render: "image" | "mask",
  tone: "color" | "mono",
): ToolMarkSource => ({ source: "brand", render, src: ICONS + file, tone });

const SYMBOL: ToolMarkSource = { source: "symbol" };

const dot = (cx: number, cy: number, r = 0.9) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

const MARKS: Record<ToolMarkKey, MarkDef> = {
  // Upstream: lobehub/lobe-icons claudecode-color.svg (orange Code mascot).
  "claude-code": {
    kind: "coding-agent",
    mark: brand("claudecode.svg", "image", "color"),
  },
  // Upstream: lobehub/lobe-icons codex-color.svg (gradient on white tile).
  "codex-cli": {
    kind: "coding-agent",
    mark: brand("codex.svg", "image", "color"),
  },
  // Upstream: lobehub/lobe-icons opencode.svg — the real mark is monochrome.
  opencode: {
    kind: "coding-agent",
    mark: brand("opencode.svg", "image", "mono"),
  },
  // Upstream: devicons/devicon react-original.svg (#61DAFB).
  react: { kind: "runtime", mark: brand("react.svg", "image", "color") },
  // Upstream: devicons/devicon threejs-original.svg — monochrome.
  threejs: { kind: "runtime", mark: brand("threejs.svg", "image", "mono") },
  // Upstream: simple-icons ffmpeg.svg geometry, filled #007808 in CSS.
  ffmpeg: { kind: "runtime", mark: brand("ffmpeg.svg", "mask", "color") },
  // Upstream: simple-icons gsap.svg geometry, filled #0AE448 in CSS.
  gsap: { kind: "runtime", mark: brand("gsap.svg", "mask", "color") },

  // ---- functional symbols (no fetched official logo; not brand marks) ----
  // Frame + play + playhead. Remotion's upstream logo fetch returned 404.
  remotion: {
    kind: "runtime",
    mark: SYMBOL,
    draw: (
      <>
        <rect x="2" y="2.5" width="12" height="8" rx="2" />
        <path d="M7 4.9v3.2l2.6-1.6z" />
        <path d="M2.5 13.25h11M6 12v2.5" />
      </>
    ),
  },
  // Stacked frames (frame-by-frame capture). Not a HyperFrames logo.
  hyperframes: {
    kind: "runtime",
    mark: SYMBOL,
    draw: (
      <>
        <rect x="5.25" y="2.5" width="8.25" height="7.5" rx="1.5" />
        <path d="M3 6v6c0 .85.65 1.5 1.5 1.5h6" />
      </>
    ),
  },
  // Frame with a free-hand stroke (immediate-mode drawing surface).
  canvas2d: {
    kind: "runtime",
    mark: SYMBOL,
    draw: (
      <>
        <rect x="2" y="2.5" width="12" height="11" rx="2" />
        <path d="M4.5 10.5c1.4-3 2.9-3.2 4-1.6 1 1.4 2.3.9 3-1.9" />
      </>
    ),
  },
  // Bézier path with anchor squares and a handle (editable vector).
  "editable-svg": {
    kind: "runtime",
    mark: SYMBOL,
    draw: (
      <>
        <path d="M3.5 12.5C5 6 9 9.5 12.5 3.5" />
        <path d="M12.5 3.5 9 4.75" opacity="0.6" />
        <rect x="2.25" y="11.25" width="2.5" height="2.5" rx="0.5" />
        <rect x="11.25" y="2.25" width="2.5" height="2.5" rx="0.5" />
        {dot(9, 4.75, 0.85)}
      </>
    ),
  },
  // Waveform bars (local speech synthesis). Not a VoxCPM / MLX logo.
  "voice-synthesis": {
    kind: "runtime",
    mark: SYMBOL,
    draw: <path d="M3 7v2M5.5 5v6M8 2.75v10.5M10.5 5.5v5M13 7v2" />,
  },
  // Screen with two subtitle lines.
  captions: {
    kind: "runtime",
    mark: SYMBOL,
    draw: (
      <>
        <rect x="2" y="3" width="12" height="10" rx="2" />
        <path d="M4.75 8.75h6.5M5.75 10.75h4.5" />
      </>
    ),
  },
  // Page with notes + pencil: a human local study, explicitly not an AI tool.
  "local-study": {
    kind: "local",
    mark: SYMBOL,
    draw: (
      <>
        <path d="M10 2.5H4c-.85 0-1.5.65-1.5 1.5v8c0 .85.65 1.5 1.5 1.5h3.5" />
        <path d="M5 6h4M5 8.5h2.5" />
        <path d="m13.5 7.75-4 4-1.75.5.5-1.75 4-4z" />
      </>
    ),
  },
  // Neutral dashed ring for names this file does not recognise.
  unknown: {
    kind: "unknown",
    mark: SYMBOL,
    draw: (
      <>
        <circle cx="8" cy="8" r="5.5" strokeDasharray="2.2 2.2" />
        {dot(8, 8)}
      </>
    ),
  },
};

/* Exact (normalised) names only — no substring guessing, so an unfamiliar
 * name can never be silently dressed up as a known tool. */
const ALIASES: Record<string, ToolMarkKey> = {
  claudecode: "claude-code",
  codexcli: "codex-cli",
  opencode: "opencode",
  react: "react",
  remotion: "remotion",
  threejs: "threejs",
  gsap: "gsap",
  hyperframes: "hyperframes",
  canvas2d: "canvas2d",
  ffmpeg: "ffmpeg",
  editablesvg: "editable-svg",
  voxcpm2mlx: "voice-synthesis",
  captions: "captions",
  rendereradapter: "captions",
  jklocalstudy: "local-study",
};

const normalise = (name: string) =>
  name.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

export function resolveToolMark(name: string): {
  key: ToolMarkKey;
  kind: ToolKind;
} {
  const key = ALIASES[normalise(name)] ?? "unknown";
  return { key, kind: MARKS[key].kind };
}

/** Where a name's mark comes from: a pinned upstream asset, or a symbol. */
export function toolMarkSource(name: string): ToolMarkSource {
  return MARKS[resolveToolMark(name).key].mark;
}

export function ToolMark({
  name,
  size = 16,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const { key } = resolveToolMark(name);
  const { mark, draw } = MARKS[key];
  const cls = className ? `tool-mark ${className}` : "tool-mark";

  if (mark.source === "brand" && mark.render === "image") {
    return (
      <img
        className={cls}
        src={mark.src}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        data-tool-mark={key}
        data-mark-source="brand"
        data-tone={mark.tone}
      />
    );
  }

  if (mark.source === "brand") {
    const maskImage = `url("${mark.src}")`;
    const glyph: CSSProperties = { maskImage, WebkitMaskImage: maskImage };
    return (
      <span
        className={cls}
        style={{ width: size, height: size }}
        aria-hidden="true"
        data-tool-mark={key}
        data-mark-source="brand"
        data-tone={mark.tone}
        data-mask-src={mark.src}
      >
        <span className="tool-mark-glyph" style={glyph} />
      </span>
    );
  }

  return (
    <svg
      className={cls}
      data-tool-mark={key}
      data-mark-source="symbol"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {draw}
    </svg>
  );
}
