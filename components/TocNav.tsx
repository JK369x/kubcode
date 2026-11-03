"use client";
import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/mdx";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Table of contents. With `spy`, the heading currently being read is marked
 * (aria-current) using an IntersectionObserver; clicks scroll smoothly unless
 * the reader prefers reduced motion.
 */
export function TocNav({ items, spy }: { items: TocItem[]; spy: boolean }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!spy) return;
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // The first heading in reading order that is inside the band wins;
        // otherwise keep the last one scrolled past.
        const inBand = items.find((i) => visible.has(i.id));
        if (inBand) setActive(inBand.id);
        else {
          const passed = headings.filter((h) => h.getBoundingClientRect().top < 120).at(-1);
          if (passed) setActive(passed.id);
        }
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items, spy]);

  return (
    <ol className="toc">
      {items.map((item) => (
        <li key={item.id} className={item.depth === 3 ? "toc-sub" : undefined}>
          <a
            href={`#${item.id}`}
            aria-current={spy && active === item.id ? "location" : undefined}
            onClick={(e) => {
              const target = document.getElementById(item.id);
              if (!target) return;
              e.preventDefault();
              target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
              history.replaceState(null, "", `#${item.id}`);
              if (spy) setActive(item.id);
              target.focus({ preventScroll: true });
            }}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}
