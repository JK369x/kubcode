"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Star } from "lucide-react";

/** null while loading or when stars are off: counts stay hidden. */
const Counts = createContext<Record<string, number> | null>(null);

/** Loads the public star counts for every tool once per index view. */
export function StarCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/interactions/star-counts?kind=tool", { credentials: "omit", cache: "no-store" })
      // Always drain the body so the request completes.
      .then(async (res) => ((await res.json().catch(() => ({}))) as { available?: boolean; stars?: Record<string, number> }))
      .catch(() => ({}) as { available?: boolean; stars?: Record<string, number> })
      .then((body) => {
        if (live && body.available === true && body.stars) setCounts(body.stars);
      });
    return () => {
      live = false;
    };
  }, []);
  return <Counts.Provider value={counts}>{children}</Counts.Provider>;
}

export function ToolStars({ slug, className }: { slug: string; className?: string }) {
  const counts = useContext(Counts);
  if (!counts) return null;
  const n = counts[slug] ?? 0;
  return (
    <span className={className} aria-label={`${n} ดาว`}>
      <Star size={14} aria-hidden /> {n}
    </span>
  );
}
