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

function TocBlock({ toc }: { toc: TocItem[] }) {
  if (toc.length < 2) return null;
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
        <TocBlock toc={toc} />
        <CommentsPanel target={target} it={it} headingId={headingId} />
      </aside>
      <CommentSheet target={target} it={it} />
    </>
  );
}
