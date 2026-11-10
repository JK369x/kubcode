"use client";
import { useId } from "react";
import type { TocItem } from "@/lib/mdx";
import { CommentSheet, CommentsPanel, StarControl, useInteractions, type InteractionTarget } from "./PageInteractions";
import { TocNav } from "./TocNav";

/**
 * Right rail on wide screens: star → table of contents (fixed height, follows
 * the reader) → comments filling the rest of the viewport. Narrower screens
 * hide the rail; comments open from a floating button instead.
 */
export function PageRail({ toc, target }: { toc: TocItem[]; target?: InteractionTarget }) {
  return target ? <RailWithInteractions toc={toc} target={target} /> : <Rail toc={toc} />;
}

function TocBlock({ toc, compact = false }: { toc: TocItem[]; compact?: boolean }) {
  if (toc.length < 2) return null;
  if (compact)
    return (
      // Next to comments the TOC folds away and stays short, so it never
      // squeezes the comment list (owner 2026-11-11).
      <details className="rail-toc rail-toc--compact" open>
        <summary className="toc-label">สารบัญ · {toc.length} หัวข้อ</summary>
        <TocNav items={toc} spy follow />
      </details>
    );
  return (
    <section className="rail-toc" aria-label="สารบัญ">
      <p className="toc-label">สารบัญ</p>
      <TocNav items={toc} spy follow />
    </section>
  );
}

function Rail({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;
  return (
    <aside className="page-rail">
      <TocBlock toc={toc} />
    </aside>
  );
}

function RailWithInteractions({ toc, target }: { toc: TocItem[]; target: InteractionTarget }) {
  const it = useInteractions(target);
  const headingId = useId();
  return (
    <>
      <aside className="page-rail page-rail--full">
        <StarControl target={target} it={it} />
        <TocBlock toc={toc} compact />
        <CommentsPanel target={target} it={it} headingId={headingId} />
      </aside>
      <CommentSheet target={target} it={it} />
    </>
  );
}
