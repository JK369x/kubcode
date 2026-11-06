// Skill packages members may download (ADR 0002). This list is the allowlist:
// a slug that is not here is never downloadable. Adding an entry is the owner's
// package approval for that exact version, so it lands only through a PR the
// owner merges, together with the files in packages/<slug>/<version>/.
// Data only: safe to import from client components.

export type SkillPackage = {
  slug: string;
  version: string;
  /** Object key in the private media bucket. */
  key: string;
  /** Name the browser saves the file as. */
  filename: string;
  licence: string;
  credit: string;
  approval: { by: string; date: string };
};

/** Skills with no licence to redistribute. Tests keep them out of PACKAGES. */
export const NEVER_DOWNLOADABLE: readonly string[] = ["growkaz-stickman", "thai-survival"];

const pkg = (p: Omit<SkillPackage, "key" | "filename">): SkillPackage => ({
  ...p,
  key: `packages/${p.slug}/${p.version}.zip`,
  filename: `${p.slug}-${p.version}.zip`,
});

export const PACKAGES: readonly SkillPackage[] = [
  pkg({
    slug: "freshstack-what-if",
    version: "0.1.0",
    licence: "MIT",
    credit: "FreshStack (freshstack.ai)",
    approval: { by: "owner", date: "2026-11-05" },
  }),
  pkg({
    slug: "podcast-tool-short",
    version: "0.1.0",
    licence: "MIT",
    credit: "kubcode.dev; yt-package and yt-seo helpers by Jake Schincariol (MIT)",
    approval: { by: "owner", date: "2026-11-06" },
  }),
];

/** The package members may download for a skill, or null. */
export function approvedPackageFor(slug: string): SkillPackage | null {
  if (NEVER_DOWNLOADABLE.includes(slug)) return null;
  return PACKAGES.find((p) => p.slug === slug) ?? null;
}
