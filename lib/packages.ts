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
  /**
   * Upper bound for the download size: the unpacked package folder in KB,
   * rounded up (the zip is smaller). tests/skill-page-panel.test.ts checks it.
   */
  maxKb: number;
  /** Agents the package README names; the only source for "ใช้กับ" badges. */
  agents: readonly PackageAgent[];
};

export type PackageAgent = "claude-code" | "opencode";
export const AGENT_NAMES: Readonly<Record<PackageAgent, string>> = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
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
    maxKb: 113,
    agents: ["claude-code", "opencode"],
  }),
  pkg({
    slug: "podcast-tool-short",
    version: "0.1.0",
    licence: "MIT",
    credit: "kubcode.dev; yt-package and yt-seo helpers by Jake Schincariol (MIT)",
    approval: { by: "owner", date: "2026-11-06" },
    maxKb: 29,
    agents: ["claude-code"],
  }),
  pkg({
    slug: "make-short",
    version: "0.1.0",
    licence: "MIT",
    credit: "NoCodeHack (github.com/nocodehack/make-short); macOS patch by kubcode.dev",
    approval: { by: "owner", date: "2026-11-10" },
    maxKb: 15299,
    agents: ["claude-code"],
  }),
];

/** The package members may download for a skill, or null. */
export function approvedPackageFor(slug: string): SkillPackage | null {
  if (NEVER_DOWNLOADABLE.includes(slug)) return null;
  return PACKAGES.find((p) => p.slug === slug) ?? null;
}
