import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { rawSkills } from "./catalog";

export type Tag = { slug: string; th: string; en: string; description: string };

export const REF_KINDS = ["article", "tool", "skill"] as const;
export type RefKind = (typeof REF_KINDS)[number];
export type Ref = { kind: RefKind; slug: string };

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
  body: string;
};

export type Article = PageBase & { kind: "article" };

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

export const LINK_KINDS = ["repo", "website", "docs"] as const;
export type ToolLinks = Partial<Record<(typeof LINK_KINDS)[number], string>>;

export type Tool = PageBase & {
  kind: "tool";
  category: ToolCategory;
  links: ToolLinks;
  /** Our short licence note, e.g. "MIT" or "free for teams ≤3". */
  license: string;
};

export type Page = Article | Tool;

/** Upstream credit; url is optional for private sources we cannot link. */
export type Source = { title: string; url?: string };

export type Content = { tags: Tag[]; articles: Article[]; tools: Tool[] };

/** Thrown when content files break the schema; lists every problem found. */
export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super("Invalid content:\n- " + problems.join("\n- "));
    this.name = "ContentError";
  }
}

const DEFAULT_ROOT = path.join(process.cwd(), "content");

export const LIMITS = { title: 60, description: 155, slugWords: 5 } as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
      body,
    };
    return { fm, page: build(fm, base) };
  });
}

export function loadContent(root: string = DEFAULT_ROOT): Content {
  const problems: string[] = [];
  const tags = loadTags(root, problems);
  const tagSlugs = new Set(tags.map((t) => t.slug));

  const articles = readPages(root, "articles", problems, (_fm, base): Article => ({
    kind: "article",
    ...base,
  }), tagSlugs);
  const tools = readPages(root, "tools", problems, (fm, base): Tool => ({
    kind: "tool",
    ...base,
    category: fm.oneOf("category", TOOL_CATEGORIES),
    links: fm.links(),
    license: fm.text("license", LIMITS.description),
  }), tagSlugs);
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

  if (problems.length > 0) throw new ContentError(problems);
  return {
    tags,
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
