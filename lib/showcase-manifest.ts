import manifestData from "./showcase.json";

/** One generated clip record (written by scripts/showcase-media.ts). */
export type ShowcaseManifestEntry = {
  id: string;
  title: string;
  aspect: "portrait" | "landscape";
  poster: { src: string; width: number; height: number; bytes: number; sha256: string };
  preview: {
    src: string; width: number; height: number; seconds: number; bytes: number; sha256: string;
  } | null;
  link: { url: string; platform: "youtube" | "instagram"; evidence: string } | null;
  madeWith: Readonly<Record<string, string>>;
  source: { path: string; sha256: string };
};

export const SHOWCASE_MANIFEST = manifestData as unknown as readonly ShowcaseManifestEntry[];

export const SHOWCASE_LIMITS = { previewBytes: 400_000, posterBytes: 120_000 } as const;

/** Public paths of every generated showcase file. */
export function showcaseMediaPaths(manifest: readonly ShowcaseManifestEntry[]): string[] {
  return manifest.flatMap((e) => (e.preview ? [e.poster.src, e.preview.src] : [e.poster.src]));
}
