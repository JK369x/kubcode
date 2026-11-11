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
  /**
   * "repo": files in packages/<slug>/<version>/, zipped and uploaded by the infra stack.
   * "private": a proprietary kit whose files never enter this public repo; the owner builds
   * and uploads the zip with scripts/upload-private-package.ts (sha256 and bytes pinned here).
   */
  kind: "repo" | "private";
  /** Private packages only: sha256 (hex) and byte size of the uploaded zip. */
  zip?: { sha256: string; bytes: number };
};

export type PackageAgent = "claude-code" | "opencode";
export const AGENT_NAMES: Readonly<Record<PackageAgent, string>> = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
};

/** Skills with no licence to redistribute. Tests keep them out of PACKAGES. */
export const NEVER_DOWNLOADABLE: readonly string[] = ["growkaz-stickman", "thai-survival"];

const pkg = (p: Omit<SkillPackage, "key" | "filename" | "kind">, kind: SkillPackage["kind"] = "repo"): SkillPackage => ({
  ...p,
  kind,
  key: `packages/${p.slug}/${p.version}.zip`,
  filename: `${p.slug}-${p.version}.zip`,
});

export const PACKAGES: readonly SkillPackage[] = [
  pkg({
    slug: "freshstack-what-if",
    version: "0.2.0",
    licence: "MIT",
    credit: "FreshStack (freshstack.ai); vertical Thai pipeline and voice-by-name helper by kubcode.dev (MIT)",
    approval: { by: "owner", date: "2026-11-11" },
    maxKb: 859,
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
  pkg({
    slug: "elephant-goldfish-model",
    version: "0.1.1",
    licence: "Apache-2.0",
    credit: "Google LLC (github.com/google/elephant-goldfish-model); not an officially supported Google product",
    approval: { by: "owner", date: "2026-11-10" },
    maxKb: 266,
    agents: ["claude-code"],
  }),
];

/**
 * Proprietary kits for signed-in members (licence: kubcode members only, no
 * redistribution). Their source lives in a private repo and never in this
 * public one; the owner uploads the zip to packages/<slug>/<version>.zip with
 * scripts/upload-private-package.ts, which checks it against `zip` below.
 * The infra stack does not manage these objects.
 */
export const PRIVATE_PACKAGES: readonly SkillPackage[] = [
  pkg(
    {
      slug: "deep-sea-docs",
      version: "0.1.0",
      licence: "kubcode members only (no redistribution)",
      credit: "kubcode.dev (original kit, all rights reserved)",
      approval: { by: "owner", date: "2026-11-11" },
      maxKb: 256,
      agents: ["claude-code", "opencode"],
      // Built from JK369x/jk-animation-studio packages/deep-sea-docs/0.1.0 @ a99a7b5.
      zip: { sha256: "eeb4b4de4eb9bd23226191da71c9385225fa43dd4904b2e2d223032a71d490ae", bytes: 114587 },
    },
    "private",
  ),
];

/** Every downloadable package: repo-built first, then private. */
export const ALL_PACKAGES: readonly SkillPackage[] = [...PACKAGES, ...PRIVATE_PACKAGES];

/** A private package is live only once its uploaded zip is pinned (sha256 + bytes). */
export const isPinned = (p: SkillPackage) => p.kind === "repo" || (!!p.zip && /^[0-9a-f]{64}$/.test(p.zip.sha256) && p.zip.bytes > 0);

/** The package members may download for a skill, or null (then the route answers 404). */
export function approvedPackageFor(slug: string): SkillPackage | null {
  if (NEVER_DOWNLOADABLE.includes(slug)) return null;
  const p = ALL_PACKAGES.find((x) => x.slug === slug);
  return p && isPinned(p) ? p : null;
}
