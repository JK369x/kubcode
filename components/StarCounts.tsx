"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import type { PageKind } from "@/lib/interactions/store";

type StarsBody = { available?: boolean; stars?: Record<string, number> };

/** Public star counts of one page kind; null while loading or when stars are off. */
export async function fetchStarCounts(kind: PageKind): Promise<Record<string, number> | null> {
  const body = await fetch(`/api/interactions/star-counts?kind=${kind}`, { credentials: "omit", cache: "no-store" })
    // Always drain the body so the request completes.
    .then(async (res) => (await res.json().catch(() => ({}))) as StarsBody)
    .catch(() => ({}) as StarsBody);
  return body.available === true && body.stars ? body.stars : null;
}

/** null while loading or when stars are off: counts stay hidden. */
const Counts = createContext<Record<string, number> | null>(null);

/** Loads the public star counts for every page of one kind once per index view. */
export function StarCountsProvider({ kind = "tool", children }: { kind?: PageKind; children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    void fetchStarCounts(kind).then((c) => {
      if (live && c) setCounts(c);
    });
    return () => {
      live = false;
    };
  }, [kind]);
  return <Counts.Provider value={counts}>{children}</Counts.Provider>;
}

/** Star count on an index card (tool or article); hidden until counts load. */
export function PageStars({ slug, className }: { slug: string; className?: string }) {
  const counts = useContext(Counts);
  if (!counts) return null;
  const n = counts[slug] ?? 0;
  return (
    <span className={className} data-stars={n}>
      <Star size={14} aria-hidden /> {n}
      <span className="sr-only"> ดาว</span>
    </span>
  );
}

export const ToolStars = PageStars;
