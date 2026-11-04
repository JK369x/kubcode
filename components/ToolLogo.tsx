import type { Logo } from "@/lib/content";
import { logoTransitionName } from "@/lib/view-transition-names";
import { Morph } from "./Morph";

/**
 * A tool's mark on a fixed white tile in both themes: brand files are shown
 * as supplied (never recoloured) with clear space around them. Decorative
 * here because the product name always sits right next to it.
 */
export function ToolLogo({
  slug,
  logo,
  size,
  morph = true,
}: {
  slug: string;
  logo: Logo;
  size: "icon" | "card" | "page";
  /** Off where the same logo can appear more than once on a page (names must be unique). */
  morph?: boolean;
}) {
  const px = { icon: 32, card: 56, page: 72 }[size];
  const tile = (
      <span className={`tool-logo tool-logo-${size}${logo.kind === "monogram" ? " is-monogram" : logo.includesClearSpace ? " is-edge" : ""}`} aria-hidden="true">
        {logo.kind === "image" ? (
          // Plain <img>: a small local file; SVGs must not go through the optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.src} alt="" width={px} height={px} decoding="async" />
        ) : (
          logo.text
        )}
      </span>
  );
  return morph ? <Morph name={logoTransitionName(slug)}>{tile}</Morph> : tile;
}
