import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import { parse as parseYaml } from "yaml";
import { rawSkills } from "./catalog";
import { PACKAGES } from "./packages";
import { isProductLogoPath } from "./publication";

export type Tag = { slug: string; th: string; en: string; description: string };

export const REF_KINDS = ["article", "tool", "skill"] as const;
export type RefKind = (typeof REF_KINDS)[number];
export type Ref = { kind: RefKind; slug: string };

/**
 * "Install with your own AI agent": one prompt the reader pastes into their
 * agent, which then installs the skill/plugin/kit itself (docs/content.md).
 */
export type AgentInstall = {
  /** Tool slugs of the agents the prompt is written for, e.g. claude-code. */
  agents: string[];
  /** The exact text to paste; Thai instructions plus the URL to install from. */
  prompt: string;
  /** Upstream repo (https) or skill:<slug> for one of our download packages. */
  source?: string;
  /** Our packages the prompt sends the reader to (they must sign in to download). */
  packages: string[];
};

/** Fields shared by every MDX page type. */
type PageBase = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  refs: Ref[];
  updated: string;
  sources: Source[];
  sourceNote?: string;
  redirects: string[];
  /** Short share codes: /go/<code> 301s to this page (for clip descriptions). */
  go: string[];
  agentInstall?: AgentInstall;
  body: string;
};

/** Article cover: a local image under public/covers with known provenance. */
export const COVER_SOURCES = ["generated", "own-clip", "own-screenshot"] as const;
export type Cover = {
  src: string;
  /** 1200×630 crop used as the Open Graph image. */
  og: string;
  alt: string;
  source: (typeof COVER_SOURCES)[number];
  width: number;
  height: number;
};

const COVER_PATH = /^\/covers\/[a-z0-9-]+(\/[a-z0-9-]+)*\.(png|jpe?g|webp)$/;

export type Category = { key: string; th: string; description: string };

export type Article = PageBase & {
  kind: "article";
  category: string;
  cover: Cover;
  featured: boolean;
  /** Link to a clip of this article (https), shown as a "มีคลิป" badge. */
  video?: string;
  readingMinutes: number;
};

/** The eight production stages a tool can belong to (PRD). */
export const TOOL_CATEGORIES = [
  "script",
  "image",
  "voice",
  "music",
  "render",
  "captions",
  "package",
  "publish",
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** Price model shown as a badge: free, a usable free plan, or paid only. */
export const PRICING = ["free", "free-tier", "paid"] as const;
export type Pricing = (typeof PRICING)[number];

/**
 * Product logo: the makers' own file, stored locally (never hotlinked) with
 * where it came from and which usage guideline applies; or, when there is no
 * official asset we may use, a neutral monogram and the reason.
 */
export type Logo =
  | {
      kind: "image";
      src: string;
      alt: string;
      sourceUrl: string;
      /** null when no guideline was found. */
      guidelineUrl: string | null;
      fetchedAt: string;
      /** The file already carries the clear space its guideline asks for: draw it edge to edge. */
      includesClearSpace: boolean;
    }
  | { kind: "monogram"; text: string; reason: string };

export const LINK_KINDS = ["repo", "website", "docs"] as const;
export type ToolLinks = Partial<Record<(typeof LINK_KINDS)[number], string>>;

export type Tool = PageBase & {
  kind: "tool";
  /** Product name as its makers write it, e.g. "Remotion" (JSON-LD name). */
  name: string;
  category: ToolCategory;
  links: ToolLinks;
  /** Our short licence note, e.g. "MIT" or "free for teams ≤3". */
  license: string;
  pricing: Pricing;
  logo: Logo;
};

export type Page = Article | Tool;

/** Upstream credit; url is optional for private sources we cannot link. */
export type Source = { title: string; url?: string };

export type Content = { tags: Tag[]; categories: Category[]; articles: Article[]; tools: Tool[] };

/** Thrown when content files break the schema; lists every problem found. */
export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super("Invalid content:\n- " + problems.join("\n- "));
    this.name = "ContentError";
  }
}

const DEFAULT_ROOT = path.join(process.cwd(), "content");

export const LIMITS = { title: 60, description: 155, slugWords: 5, agentPrompt: 1200 } as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GO_CODE = /^[a-z0-9-]{2,16}$/;

/** Stable URL slug rule shared by every content type (PRD: SEO slugs). */
export function slugProblem(slug: unknown): string | null {
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    return "must be ASCII lower-kebab (a-z, 0-9, -)";
  }
  if (slug.split("-").length > LIMITS.slugWords) {
    return `must be at most ${LIMITS.slugWords} words`;
  }
  return null;
}

function splitFrontmatter(source: string): { data: unknown; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) return { data: undefined, body: source };
  return { data: parseYaml(match[1]), body: source.slice(match[0].length) };
}

/** Collects problems for one file so a bad build reports everything at once. */
class FieldReader {
  constructor(
    private readonly file: string,
    private readonly data: Record<string, unknown>,
    private readonly problems: string[],
  ) {}

  problem(field: string, message: string) {
    this.problems.push(`${this.file}: ${field} ${message}`);
  }

  text(field: string, max: number): string {
    const value = this.data[field];
    if (typeof value !== "string" || value.trim() === "") {
      this.problem(field, "is required");
      return "";
    }
    if ([...value].length > max) {
      this.problem(field, `must be at most ${max} characters`);
    }
    return value;
  }

  slug(fileSlug: string): string {
    const value = this.data.slug;
    const problem = slugProblem(value);
    if (problem) this.problem("slug", problem);
    else if (value !== fileSlug) {
      this.problem("slug", `must match the file name (${fileSlug})`);
    }
    return typeof value === "string" ? value : fileSlug;
  }

  /** A list of known slugs, e.g. tags that must exist in tags.yaml. */
  slugList(field: string, known: ReadonlySet<string>): string[] {
    const value = this.data[field] ?? [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      this.problem(field, "must be a list of slugs");
      return [];
    }
    for (const item of value as string[]) {
      if (!known.has(item)) this.problem(field, `has unknown entry "${item}"`);
    }
    return value as string[];
  }

  /** YYYY-MM-DD that is a real calendar date. */
  date(field: string): string {
    const value = this.data[field];
    const ok =
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
      new Date(value + "T00:00:00Z").toISOString().startsWith(value);
    if (!ok) this.problem(field, "must be a real date (YYYY-MM-DD)");
    return typeof value === "string" ? value : "";
  }

  optionalText(field: string, max: number): string | undefined {
    return this.data[field] === undefined ? undefined : this.text(field, max);
  }

  sources(): Source[] {
    const value = this.data.sources ?? [];
    if (!Array.isArray(value)) {
      this.problem("sources", "must be a list of {title, url}");
      return [];
    }
    return value.map((entry, i) => {
      const { title, url } = asRecord(entry);
      if (typeof title !== "string" || title.trim() === "") {
        this.problem("sources", `entry ${i + 1} needs a title`);
      }
      if (url !== undefined && !isHttpsUrl(url)) {
        this.problem("sources", `entry ${i + 1} url must be https: ${String(url)}`);
      }
      const source: Source = { title: String(title ?? "") };
      if (typeof url === "string") source.url = url;
      return source;
    });
  }

  bool(field: string): boolean {
    const value = this.data[field];
    if (value === undefined) return false;
    if (typeof value !== "boolean") this.problem(field, "must be true or false");
    return value === true;
  }

  optionalHttps(field: string): string | undefined {
    const value = this.data[field];
    if (value === undefined) return undefined;
    if (!isHttpsUrl(value)) {
      this.problem(field, "must be an https URL");
      return undefined;
    }
    return value;
  }

  /**
   * Cover rules: a file under public/covers, alt text, a known source, at
   * least 1200px wide and either 16:9 or exactly 1200×630.
   */
  cover(publicDir: string): Cover {
    const raw = this.data.cover;
    const empty: Cover = { src: "", og: "", alt: "", source: "generated", width: 0, height: 0 };
    if (raw === undefined) {
      this.problem("cover", "is required");
      return empty;
    }
    const { src, og, alt, source } = asRecord(raw);
    let ok = true;
    if (typeof alt !== "string" || alt.trim() === "") (this.problem("cover.alt", "is required"), (ok = false));
    if (!COVER_SOURCES.includes(source as Cover["source"])) {
      this.problem("cover.source", `must be one of ${COVER_SOURCES.join(", ")}`);
      ok = false;
    }
    const sizeOf = (field: string, file: unknown): { width: number; height: number } | null => {
      if (typeof file !== "string" || !COVER_PATH.test(file)) {
        this.problem(field, "must be a /covers/<...>.png|jpg|webp path under public/");
        return null;
      }
      try {
        const size = imageSize(readFileSync(path.join(publicDir, file)));
        return { width: size.width ?? 0, height: size.height ?? 0 };
      } catch {
        this.problem(field, `not found or unreadable: ${file}`);
        return null;
      }
    };
    const size = sizeOf("cover.src", src);
    if (!size) return empty;
    const { width, height } = size;
    if (og === undefined) (this.problem("cover.og", "is required (a 1200×630 crop for social cards)"), (ok = false));
    else {
      const ogSize = sizeOf("cover.og", og);
      if (!ogSize) ok = false;
      else if (ogSize.width !== 1200 || ogSize.height !== 630) {
        this.problem("cover.og", `must be exactly 1200×630 (${ogSize.width}×${ogSize.height})`);
        ok = false;
      }
    }
    if (width < 1200) (this.problem("cover", `must be at least 1200px wide (${width}×${height})`), (ok = false));
    else if (!(Math.abs(width / height - 16 / 9) < 0.01 || (width === 1200 && height === 630))) {
      this.problem("cover", `must be 16:9 or 1200×630 (${width}×${height})`);
      ok = false;
    }
    return ok ? { src: src as string, og: og as string, alt: alt as string, source: source as Cover["source"], width, height } : empty;
  }

  /** Product logo rules (see Logo and isProductLogoPath). */
  logo(publicDir: string, toolSlug: string, name: string): Logo {
    const raw = this.data.logo;
    if (raw === undefined) {
      this.problem("logo", "is required");
      return { kind: "monogram", text: monogram(name), reason: "" };
    }
    const r = asRecord(raw);
    if (r.fallback !== undefined) {
      if (r.fallback !== "monogram") this.problem("logo.fallback", 'must be "monogram"');
      const reason = typeof r.reason === "string" ? r.reason.trim() : "";
      if (!reason) this.problem("logo.reason", "is required (say why there is no official logo)");
      if (r.text !== undefined && !(typeof r.text === "string" && /^[A-Za-z0-9]{1,3}$/.test(r.text))) {
        this.problem("logo.text", "must be 1-3 letters or digits");
      }
      return { kind: "monogram", text: typeof r.text === "string" ? r.text : monogram(name), reason };
    }
    const { src, alt, source_url, guideline_url, fetched_at, includes_clear_space } = r;
    if (includes_clear_space !== undefined && typeof includes_clear_space !== "boolean") {
      this.problem("logo.includes_clear_space", "must be true or false");
    }
    if (typeof alt !== "string" || alt.trim() === "") this.problem("logo.alt", "is required");
    if (!isHttpsUrl(source_url)) this.problem("logo.source_url", "must be an https URL (the page the file came from)");
    if (guideline_url !== "none found" && !isHttpsUrl(guideline_url)) {
      this.problem("logo.guideline_url", 'must be an https URL or "none found"');
    }
    const fetchedAt = new FieldReader(this.file, { "logo.fetched_at": fetched_at }, this.problems).date("logo.fetched_at");
    if (typeof src !== "string" || !isProductLogoPath(src, toolSlug)) {
      this.problem("logo.src", `must be /tools/${toolSlug}/logo.svg or .png (a local copy, never a hotlink)`);
    } else {
      let file: Buffer | null = null;
      try {
        file = readFileSync(path.join(publicDir, src));
      } catch {
        this.problem("logo.src", `not found: ${src}`);
      }
      if (file && src.endsWith(".svg")) {
        if (svgIsActive(file.toString("utf8"))) this.problem("logo.src", "SVG has active or external content (scripts, handlers, external links)");
      } else if (file) {
        try {
          const { width = 0, height = 0 } = imageSize(file);
          if (width < 128 || height < 128) this.problem("logo.src", `PNG must be at least 128×128 (${width}×${height})`);
        } catch {
          this.problem("logo.src", `unreadable image: ${src}`);
        }
      }
    }
    return {
      kind: "image",
      src: String(src ?? ""),
      alt: String(alt ?? ""),
      sourceUrl: String(source_url ?? ""),
      guidelineUrl: guideline_url === "none found" ? null : String(guideline_url ?? ""),
      fetchedAt,
      includesClearSpace: includes_clear_space === true,
    };
  }

  oneOf<T extends string>(field: string, allowed: readonly T[]): T {
    const value = this.data[field];
    if (!allowed.includes(value as T)) {
      this.problem(field, `must be one of ${allowed.join(", ")} (got "${String(value)}")`);
    }
    return value as T;
  }

  links(): ToolLinks {
    const value = asRecord(this.data.links);
    const links: ToolLinks = {};
    for (const [kind, url] of Object.entries(value)) {
      if (!LINK_KINDS.includes(kind as (typeof LINK_KINDS)[number])) {
        this.problem("links", `has unknown kind "${kind}" (use ${LINK_KINDS.join(", ")})`);
      } else if (!isHttpsUrl(url)) {
        this.problem("links", `${kind} must be an https URL`);
      } else links[kind as keyof ToolLinks] = url;
    }
    return links;
  }

  goCodes(): string[] {
    const value = this.data.go ?? [];
    if (!Array.isArray(value)) {
      this.problem("go", "must be a list of short codes");
      return [];
    }
    for (const code of value) {
      if (typeof code !== "string" || !GO_CODE.test(code)) {
        this.problem("go", `entry "${String(code)}" must be 2-16 chars of a-z, 0-9, -`);
      }
    }
    return value.map(String);
  }

  /** Shape of agentInstall; agent slugs and the requirement are checked in loadContent. */
  agentInstall(): AgentInstall | undefined {
    const raw = this.data.agentInstall;
    if (raw === undefined) return undefined;
    const r = asRecord(raw);
    const agents = Array.isArray(r.agents) && r.agents.every((a) => typeof a === "string") ? (r.agents as string[]) : [];
    if (agents.length === 0) this.problem("agentInstall.agents", "must be a non-empty list of tool slugs");
    const prompt = typeof r.prompt === "string" ? r.prompt.trim() : "";
    if (!prompt) this.problem("agentInstall.prompt", "is required");
    else if ([...prompt].length > LIMITS.agentPrompt) {
      this.problem("agentInstall.prompt", `must be at most ${LIMITS.agentPrompt} characters (${[...prompt].length})`);
    }
    let source: string | undefined;
    if (r.source !== undefined) {
      const pkg = typeof r.source === "string" && r.source.startsWith("skill:") ? r.source.slice(6) : null;
      if (pkg !== null) {
        if (!PACKAGES.some((p) => p.slug === pkg)) this.problem("agentInstall.source", `skill:${pkg} is not a download package (lib/packages.ts)`);
        else if (!prompt.includes(`kubcode.dev/skills/${pkg}`)) this.problem("agentInstall.prompt", `must give the download page https://kubcode.dev/skills/${pkg}`);
      } else if (!isHttpsUrl(r.source)) this.problem("agentInstall.source", "must be an https repo URL or skill:<slug>");
      else if (!prompt.includes(r.source)) this.problem("agentInstall.prompt", `must contain the source URL ${r.source}`);
      if (typeof r.source === "string") source = r.source;
    }
    for (const key of Object.keys(r)) {
      if (!["agents", "prompt", "source"].includes(key)) this.problem("agentInstall", `has unknown field "${key}"`);
    }
    const packages = PACKAGES.map((p) => p.slug).filter(
      (slug) => source === `skill:${slug}` || new RegExp(`kubcode\\.dev/skills/${slug}(?![a-z0-9-])`).test(prompt),
    );
    return { agents, prompt, ...(source ? { source } : {}), packages };
  }

  redirects(): string[] {
    const value = this.data.redirects ?? [];
    if (!Array.isArray(value)) {
      this.problem("redirects", "must be a list of old slugs");
      return [];
    }
    for (const old of value) {
      const problem = slugProblem(old);
      if (problem) this.problem("redirects", `entry "${String(old)}" ${problem}`);
    }
    return value.map(String);
  }
}

/** Initials of the first two words, e.g. "What If Animation" → "WI". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("");
}

/**
 * Logos are served from our own origin, where an SVG opened directly runs
 * like a page. Refuse anything that can execute or load from elsewhere;
 * only same-document (#id) references are allowed.
 */
function svgIsActive(svg: string): boolean {
  if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|<iframe|<embed|<object|<set\b|<animate|@import|javascript:/i.test(svg)) return true;
  if (/\son[a-z]+\s*=/i.test(svg)) return true;
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!m[1].startsWith("#")) return true;
  for (const m of svg.matchAll(/url\(\s*['"]?([^'")]*)/gi)) if (!m[1].startsWith("#")) return true;
  return false;
}

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function loadCategories(root: string, problems: string[]): Category[] {
  const data = asRecord(parseYaml(readFileSync(path.join(root, "categories.yaml"), "utf8")));
  return Object.entries(data).map(([key, entry]) => {
    const fm = new FieldReader(`categories.yaml: ${key}`, asRecord(entry), problems);
    const problem = slugProblem(key);
    if (problem) fm.problem("key", problem);
    return { key, th: fm.text("th", LIMITS.title), description: fm.text("description", LIMITS.description) };
  });
}

/** Rough reading time: ~800 Thai characters a minute; code blocks excluded. */
export function readingMinutes(body: string): number {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/[#>*_`\-[\]()]/g, "").replace(/\s+/g, "");
  return Math.max(1, Math.round(prose.length / 800));
}

function loadTags(root: string, problems: string[]): Tag[] {
  const data = asRecord(parseYaml(readFileSync(path.join(root, "tags.yaml"), "utf8")));
  return Object.entries(data).map(([slug, entry]) => {
    const fm = new FieldReader(`tags.yaml: ${slug}`, asRecord(entry), problems);
    const problem = slugProblem(slug);
    if (problem) fm.problem("slug", problem);
    return {
      slug,
      th: fm.text("th", LIMITS.title),
      en: fm.text("en", LIMITS.title),
      description: fm.text("description", LIMITS.description),
    };
  });
}

function mdxFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort();
  } catch {
    return [];
  }
}

/** Parses "kind:slug" refs; resolution against known slugs happens later. */
function readRefs(fm: FieldReader, value: unknown): Ref[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fm.problem("refs", "must be a list of kind:slug entries");
    return [];
  }
  const refs: Ref[] = [];
  for (const raw of value) {
    const [kind, slug, extra] = String(raw).split(":");
    if (!REF_KINDS.includes(kind as RefKind) || !slug || extra !== undefined) {
      fm.problem("refs", `has invalid entry "${raw}" (use ${REF_KINDS.join("|")}:slug)`);
      continue;
    }
    refs.push({ kind: kind as RefKind, slug });
  }
  return refs;
}

function readPages<T extends Page>(
  root: string,
  dir: "articles" | "tools",
  problems: string[],
  build: (fm: FieldReader, base: PageBase) => T,
  tagSlugs: ReadonlySet<string>,
): Array<{ fm: FieldReader; page: T }> {
  return mdxFiles(path.join(root, dir)).map((file) => {
    const { data, body } = splitFrontmatter(
      readFileSync(path.join(root, dir, file), "utf8"),
    );
    const record = asRecord(data);
    const fm = new FieldReader(`${dir}/${file}`, record, problems);
    const agentInstall = fm.agentInstall();
    const base: PageBase = {
      slug: fm.slug(path.basename(file, ".mdx")),
      title: fm.text("title", LIMITS.title),
      description: fm.text("description", LIMITS.description),
      tags: fm.slugList("tags", tagSlugs),
      refs: readRefs(fm, record.refs),
      updated: fm.date("updated"),
      sources: fm.sources(),
      sourceNote: fm.optionalText("sourceNote", LIMITS.description),
      redirects: fm.redirects(),
      go: fm.goCodes(),
      ...(agentInstall ? { agentInstall } : {}),
      body,
    };
    return { fm, page: build(fm, base) };
  });
}

export function loadContent(root: string = DEFAULT_ROOT): Content {
  const problems: string[] = [];
  const tags = loadTags(root, problems);
  const tagSlugs = new Set(tags.map((t) => t.slug));

  const categories = loadCategories(root, problems);
  const publicDir = path.join(root, "..", "public");
  const articles = readPages(root, "articles", problems, (fm, base): Article => {
    const video = fm.optionalHttps("video");
    return {
      kind: "article",
      ...base,
      category: fm.oneOf("category", categories.map((c) => c.key)),
      cover: fm.cover(publicDir),
      featured: fm.bool("featured"),
      ...(video ? { video } : {}),
      readingMinutes: readingMinutes(base.body),
    };
  }, tagSlugs);
  const tools = readPages(root, "tools", problems, (fm, base): Tool => {
    const name = fm.text("name", LIMITS.title);
    return {
      kind: "tool",
      ...base,
      name,
      category: fm.oneOf("category", TOOL_CATEGORIES),
      links: fm.links(),
      license: fm.text("license", LIMITS.description),
      pricing: fm.oneOf("pricing", PRICING),
      logo: fm.logo(publicDir, base.slug, name),
    };
  }, tagSlugs);
  const pages = [...articles, ...tools];

  const known: Record<RefKind, Set<string>> = {
    article: new Set(articles.map((p) => p.page.slug)),
    tool: new Set(tools.map((p) => p.page.slug)),
    skill: new Set(rawSkills.map((s) => s.slug)),
  };
  for (const { fm, page } of pages) {
    for (const ref of page.refs) {
      if (!known[ref.kind].has(ref.slug)) {
        fm.problem("refs", `has unknown entry "${ref.kind}:${ref.slug}"`);
      }
    }
  }

  // Agent install prompts: agents are real tool pages, and every article that
  // points readers at something installable carries a prompt. Installable =
  // one of our download packages, or a kit tool: a tool page with a repo and
  // its own agentInstall (skills, plugins and kits; tests/agent-install.test.ts
  // pins which tools those are). Agents and apps such as Claude Code or FFmpeg
  // have repos too but are not kits, so mentioning them needs no prompt.
  const kitTools = new Set(tools.filter((p) => p.page.links.repo && p.page.agentInstall).map((p) => p.page.slug));
  const packageSlugs = new Set(PACKAGES.map((p) => p.slug));
  for (const { fm, page } of pages) {
    for (const agent of page.agentInstall?.agents ?? []) {
      if (!known.tool.has(agent)) fm.problem("agentInstall.agents", `has unknown tool "${agent}"`);
    }
    if (page.kind !== "article" || page.agentInstall) continue;
    const kit = page.refs.find((r) => (r.kind === "tool" && kitTools.has(r.slug)) || (r.kind === "skill" && packageSlugs.has(r.slug)));
    if (kit) fm.problem("agentInstall", `is required: refs include ${kit.kind}:${kit.slug} (a skill kit or download package)`);
  }

  // A redirect must never shadow a live page or point two ways.
  const owner = new Map<string, string>();
  for (const { fm, page } of pages) {
    for (const old of page.redirects) {
      const key = `${page.kind}:${old}`;
      if (known[page.kind].has(old)) {
        fm.problem("redirects", `entry "${old}" is a live ${page.kind} slug`);
      } else if (owner.has(key)) {
        fm.problem("redirects", `entry "${old}" is already claimed by ${owner.get(key)}`);
      } else owner.set(key, page.slug);
    }
  }

  const goOwner = new Map<string, string>();
  for (const { fm, page } of pages) {
    for (const code of page.go) {
      const claimed = goOwner.get(code);
      if (claimed) fm.problem("go", `entry "${code}" is already used by ${claimed}`);
      else goOwner.set(code, `${page.kind}:${page.slug}`);
    }
  }

  if (problems.length > 0) throw new ContentError(problems);
  return {
    tags,
    categories,
    articles: articles.map((p) => p.page),
    tools: tools.map((p) => p.page),
  };
}

let cached: Content | undefined;

/** Repo content, validated once per build; re-read on every call in dev. */
export function getContent(): Content {
  if (process.env.NODE_ENV === "development") return loadContent();
  cached ??= loadContent();
  return cached;
}

export function getArticle(slug: string): Article | undefined {
  return getContent().articles.find((a) => a.slug === slug);
}

export function getTool(slug: string): Tool | undefined {
  return getContent().tools.find((t) => t.slug === slug);
}
