import * as React from "react";
import { titleTransitionName } from "@/lib/view-transition-names";

// Next's bundled React exports ViewTransition; plain React 19.2 (tests) does
// not. Without it the title simply renders with no transition.
const ViewTransition = (React as { ViewTransition?: React.ComponentType<React.ViewTransitionProps> }).ViewTransition;

/** Title that morphs between a list row and its page heading. */
export function TitleTransition({ kind, slug, children }: { kind: "article" | "tool"; slug: string; children: React.ReactElement }) {
  if (!ViewTransition) return children;
  return (
    <ViewTransition name={titleTransitionName(kind, slug)} share="kb-title" default="none">
      {children}
    </ViewTransition>
  );
}
