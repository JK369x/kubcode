/*
 * Route-level loading UI (the loading.tsx files under app/). Shown by Next while a route
 * segment streams, mostly on client navigation before prefetch completes.
 *
 * Each variant mirrors the real page's outer box (same main class, max-width,
 * padding and media aspect-ratio), so swapping in the page does not move the
 * header or jump the layout. Built from the shared shimmer in globals.css
 * (.skeleton-line / .img-skeleton, docs/images.md); reduced motion gets a
 * still block. One polite status message per page for screen readers.
 *
 * Not under /account: those routes answer 404 (feature off / not allowed) and
 * 307 (signed out, non-canonical host) from the page itself. A loading
 * boundary starts the stream first, which would turn them into 200 soft
 * responses (see docs/design/uiux-audit-2026-11-11.md).
 */
import type { CSSProperties } from "react";

const line = (width: string, height?: number): CSSProperties => ({
  width,
  ...(height ? { height } : {}),
});

function Lines({ widths, height }: { widths: string[]; height?: number }) {
  return (
    <>
      {widths.map((w, i) => (
        <span key={i} className="skeleton-line" style={line(w, height)} />
      ))}
    </>
  );
}

/** A media box with a fixed aspect ratio and the image shimmer inside it. */
function Media({
  ratio,
  radius = 22,
  style,
}: {
  ratio: string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="route-skeleton-media"
      style={{ aspectRatio: ratio, borderRadius: radius, ...style }}
    >
      <span className="img-skeleton" />
    </div>
  );
}

function Status({ label }: { label: string }) {
  return (
    <p className="sr-only" role="status">
      {label}
    </p>
  );
}

type Variant = "reading" | "article-index" | "detail" | "community";

export function RouteSkeleton({
  variant,
  label = "กำลังโหลด",
}: {
  variant: Variant;
  label?: string;
}) {
  if (variant === "reading")
    return (
      <main id="main" className="reading-page route-skeleton" aria-busy="true">
        <Status label={label} />
        <div
          className="route-skeleton-stack"
          aria-hidden="true"
          style={{ maxWidth: 760 }}
        >
          <Lines widths={["30%"]} height={12} />
          <Lines widths={["22%"]} height={14} />
          <Lines widths={["92%", "64%"]} height={40} />
          <Lines widths={["86%", "58%"]} height={16} />
          <Media ratio="16 / 9" style={{ marginTop: 20 }} />
          <div className="route-skeleton-stack" style={{ marginTop: 28 }}>
            <Lines widths={["100%", "96%", "98%", "72%"]} height={16} />
          </div>
        </div>
      </main>
    );
  if (variant === "article-index")
    return (
      <main
        id="main"
        className="route-skeleton route-skeleton-index"
        aria-busy="true"
      >
        <Status label={label} />
        <div className="route-skeleton-stack" aria-hidden="true">
          <Lines widths={["24%"]} height={44} />
          <Lines widths={["60%"]} height={16} />
          <div className="route-skeleton-chips">
            {[72, 96, 84, 90].map((w) => (
              <span
                key={w}
                className="skeleton-line"
                style={{ width: w, height: 36, borderRadius: 999 }}
              />
            ))}
          </div>
          <div className="route-skeleton-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="route-skeleton-stack">
                <Media ratio="16 / 9" radius={16} />
                <Lines widths={["24%"]} height={12} />
                <Lines widths={["90%", "60%"]} height={18} />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  if (variant === "detail")
    return (
      <main id="main" className="detail-page route-skeleton" aria-busy="true">
        <Status label={label} />
        <div className="route-skeleton-stack" aria-hidden="true">
          <Lines widths={["40%"]} height={40} />
          <div className="route-skeleton-detail">
            <Media ratio="9 / 16" style={{ maxHeight: "min(780px, 88svh)" }} />
            <div className="route-skeleton-stack">
              <Lines widths={["70%", "100%", "94%", "80%"]} height={16} />
              <span
                className="skeleton-line"
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 12,
                  marginTop: 12,
                }}
              />
            </div>
          </div>
        </div>
      </main>
    );
  // community
  return (
    <main
      id="main"
      className="route-skeleton route-skeleton-narrow"
      aria-busy="true"
    >
      <Status label={label} />
      <div className="route-skeleton-stack" aria-hidden="true">
        <Lines widths={["22%"]} height={44} />
        <Lines widths={["64%"]} height={16} />
        <div className="skeleton-rows">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row">
              <span className="skeleton-line" style={{ width: "38%" }} />
              <span
                className="skeleton-line"
                style={{ width: i % 2 ? "72%" : "88%" }}
              />
              <span className="skeleton-line skeleton-line-short" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
