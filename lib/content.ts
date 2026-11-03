import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { rawSkills } from "./catalog";

export type Tag = { slug: string; th: string; en: string; description: string };

export const REF_KINDS = ["article", "tool", "skill"] as const;
export type RefKind = (typeof REF_KINDS)[number];
export type Ref = { kind: RefKind; slug: string };

export type Article = {
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

/** Upstream credit; url is optional for private sources we cannot link. */
export type Source = { title: string; url?: string };

export type Content = { tags: Tag[]; articles: Article[] };

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

export function loadContent(root: string = DEFAULT_ROOT): Content {
  const problems: string[] = [];
  const tags = loadTags(root, problems);
  const tagSlugs = new Set(tags.map((t) => t.slug));

  const parsed = mdxFiles(path.join(root, "articles")).map((file) => {
    const { data, body } = splitFrontmatter(
      readFileSync(path.join(root, "articles", file), "utf8"),
    );
    const record = asRecord(data);
    const fm = new FieldReader(`articles/${file}`, record, problems);
    const article: Article = {
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
    return { fm, article };
  });

  const known: Record<RefKind, Set<string>> = {
    article: new Set(parsed.map((p) => p.article.slug)),
    tool: new Set(mdxFiles(path.join(root, "tools")).map((f) => path.basename(f, ".mdx"))),
    skill: new Set(rawSkills.map((s) => s.slug)),
  };
  for (const { fm, article } of parsed) {
    for (const ref of article.refs) {
      if (!known[ref.kind].has(ref.slug)) {
        fm.problem("refs", `has unknown entry "${ref.kind}:${ref.slug}"`);
      }
    }
  }

  // A redirect must never shadow a live page or point two ways.
  const owner = new Map<string, string>();
  for (const { fm, article } of parsed) {
    for (const old of article.redirects) {
      if (known.article.has(old)) {
        fm.problem("redirects", `entry "${old}" is a live article slug`);
      } else if (owner.has(old)) {
        fm.problem("redirects", `entry "${old}" is already claimed by ${owner.get(old)}`);
      } else owner.set(old, article.slug);
    }
  }

  if (problems.length > 0) throw new ContentError(problems);
  return { tags, articles: parsed.map((p) => p.article) };
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
