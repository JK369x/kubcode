import * as React from "react";

// Next's bundled React exports ViewTransition; plain React 19.2 (tests) does
// not. Without it children render with no transition.
const ViewTransition = (React as { ViewTransition?: React.ComponentType<React.ViewTransitionProps> }).ViewTransition;

/** An element that morphs between pages where the same `name` appears. */
export function Morph({ name, children }: { name: string; children: React.ReactElement }) {
  if (!ViewTransition) return children;
  return (
    <ViewTransition name={name} share="kb-title" default="none">
      {children}
    </ViewTransition>
  );
}
