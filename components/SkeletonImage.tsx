"use client";
import Image, { type ImageProps } from "next/image";
import { useCallback, useState, type ImgHTMLAttributes, type SyntheticEvent } from "react";

/*
 * An image with a shimmer placeholder (globals.css .img-skeleton) under it
 * until it has loaded. The parent must be a positioned box with its own size
 * (aspect-ratio), so nothing shifts when the image arrives.
 *
 * Lazy images fade in. Eager ones (the hero, the first cards) never start
 * hidden: hiding them would only delay LCP. Without JavaScript nothing is
 * hidden either; the image simply paints over the shimmer.
 */

type State = "ssr" | "loading" | "loaded";

function useLoadState() {
  const [state, setState] = useState<State>("ssr");
  // Images can finish before hydration: read `complete` from the element.
  const ref = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    setState((s) => (s !== "ssr" ? s : el.complete && el.naturalWidth > 0 ? "loaded" : "loading"));
  }, []);
  const done = () => setState("loaded");
  return { state, ref, done };
}

function Skeleton({ state }: { state: State }) {
  return state === "loaded" ? null : <span className="img-skeleton" aria-hidden="true" />;
}

const fadeAttrs = (state: State, eager: boolean) =>
  eager ? {} : { "data-img-state": state === "loaded" ? "loaded" : state === "loading" ? "loading" : undefined };

/** Our own raster (covers, posters): next/image (AVIF/WebP, resized) with a skeleton. */
export function SkeletonImage(props: ImageProps) {
  const { state, ref, done } = useLoadState();
  const eager = props.loading === "eager" || Boolean(props.priority) || Boolean(props.preload);
  const { onLoad, onError } = props;
  return (
    <>
      <Skeleton state={state} />
      <Image
        {...props}
        ref={ref}
        {...fadeAttrs(state, eager)}
        onLoad={(e) => {
          done();
          onLoad?.(e);
        }}
        onError={(e) => {
          done();
          onError?.(e);
        }}
      />
    </>
  );
}

/**
 * Third-party thumbnails and avatars stay plain <img> (no proxy through our
 * optimiser; callers keep referrerPolicy="no-referrer"). Lazy, async, sized.
 */
export function SkeletonImg(
  props: ImgHTMLAttributes<HTMLImageElement> & { width: number; height: number },
) {
  const { state, ref, done } = useLoadState();
  const { onLoad, onError, loading = "lazy", decoding = "async" } = props;
  return (
    <>
      <Skeleton state={state} />
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img
        {...props}
        loading={loading}
        decoding={decoding}
        ref={ref}
        {...fadeAttrs(state, loading === "eager")}
        onLoad={(e: SyntheticEvent<HTMLImageElement>) => {
          done();
          onLoad?.(e);
        }}
        onError={(e: SyntheticEvent<HTMLImageElement>) => {
          done();
          onError?.(e);
        }}
      />
    </>
  );
}

/** Placeholder rows for a client-fetched list while it loads. */
export function SkeletonRows({ rows = 3, label = "กำลังโหลด" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-rows" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="skeleton-line" style={{ width: "38%" }} />
          <span className="skeleton-line" style={{ width: i % 2 ? "72%" : "88%" }} />
          <span className="skeleton-line skeleton-line-short" />
        </div>
      ))}
    </div>
  );
}
