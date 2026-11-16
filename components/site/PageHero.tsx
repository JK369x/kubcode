import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./PageHero.module.css";

/**
 * Site-wide page header in the pricing-A language (owner, 2026-11-15):
 * eyebrow, headline with an optional gradient second line, lead, a subtle
 * full-bleed aura behind it. `tone` picks the accent: studio purple, social
 * pink → violet → teal, or the neutral brand mix. Server component; no motion.
 */
export function PageHero({
  eyebrow,
  title,
  accent,
  lead,
  tone = "brand",
  align = "start",
  children,
  className,
  id,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Second headline line, painted with the tone's gradient. */
  accent?: ReactNode;
  lead?: ReactNode;
  tone?: "brand" | "studio" | "social";
  align?: "start" | "center";
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <header className={cn(styles.hero, className)} data-tone={tone} data-align={align}>
      <div className={styles.aura} aria-hidden="true" />
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 id={id} className={styles.title}>
        {title}
        {accent && <span className={styles.accent}>{accent}</span>}
      </h1>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </header>
  );
}

/** A rounded icon square, coloured by product family. */
export function IconTile({ children, tone = "brand", size = 48 }: { children: ReactNode; tone?: "brand" | "studio" | "social" | "muted"; size?: number }) {
  return (
    <span className={styles.tile} data-tone={tone} style={{ width: size, height: size }} aria-hidden="true">
      {children}
    </span>
  );
}

/** "kubcode Studio" / "kubcode Social" chip. */
export function FamilyChip({ family, children }: { family: "studio" | "social"; children: ReactNode }) {
  return (
    <span className={styles.family} data-family={family}>
      {children}
    </span>
  );
}
