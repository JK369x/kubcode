import type { ComponentPropsWithoutRef, ReactElement } from "react";
import * as runtime from "react/jsx-runtime";
import { CopyButton } from "@/components/CopyButton";
import { KUBCODE_DARK, KUBCODE_LIGHT } from "./shiki-themes";

export type TocItem = { depth: 2 | 3; id: string; text: string };

/**
 * URL-fragment id for a heading: lower case, Thai letters and marks kept,
 * punctuation dropped, spaces to hyphens.
 */
export function headingId(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const textOf = (node: HastNode): string =>
  node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(textOf).join("");

/** Rehype plugin: gives h2/h3 unique ids plus a self-link, and records the TOC. */
function rehypeHeadings(toc: TocItem[]) {
  return () => (tree: HastNode) => {
    const seen = new Map<string, number>();
    const walk = (node: HastNode) => {
      if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
        const text = textOf(node).trim();
        const base = headingId(text) || "section";
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        const id = n === 1 ? base : `${base}-${n}`;
        // tabIndex -1: the TOC moves keyboard focus to the heading it scrolls to.
        node.properties = { ...node.properties, id, tabIndex: -1 };
        node.children = [
          {
            type: "element",
            tagName: "a",
            properties: { className: ["anchor"], href: `#${id}`, ariaLabel: `ลิงก์ไปหัวข้อ ${text}` },
            children: [{ type: "text", value: "#" }],
          },
          ...(node.children ?? []),
        ];
        toc.push({ depth: node.tagName === "h2" ? 2 : 3, id, text });
        return;
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

function ContentLink(props: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//.test(props.href ?? "");
  return external ? <a {...props} rel="noopener noreferrer" target="_blank" /> : <a {...props} />;
}

type PreProps = ComponentPropsWithoutRef<"pre"> & { "data-language"?: string; "data-title"?: string };

/** Code card: language and optional file name, copy button, highlighted code. */
function CodeBlock({ "data-language": lang, "data-title": title, ...pre }: PreProps) {
  return (
    <figure className="code-block">
      <figcaption className="code-head">
        <span className="code-lang">{lang || "text"}</span>
        {title && <span className="code-file">{title}</span>}
      </figcaption>
      <div className="code-body">
        <CopyButton />
        <pre {...pre} tabIndex={0} />
      </div>
    </figure>
  );
}

const components = {
  a: ContentLink,
  pre: CodeBlock,
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => <blockquote {...props} className="callout" />,
};

const SHIKI_LANGS = ["bash", "shell", "ts", "tsx", "js", "jsx", "json", "yaml", "python", "css", "html", "md"];

/**
 * Compiles a repo content body (trusted MDX from content/) on the server, at
 * build time for static pages. Headings get stable ids and feed the TOC in the
 * same pass; code is highlighted with Shiki in both colour schemes.
 */
export async function renderMdx(source: string): Promise<{ content: ReactElement; toc: TocItem[] }> {
  // Dynamic imports: these packages are ESM-only and the test runner loads .ts as CJS.
  const [{ evaluate }, { default: rehypeShiki }] = await Promise.all([
    import("@mdx-js/mdx"),
    import("@shikijs/rehype"),
  ]);
  const toc: TocItem[] = [];
  const { default: Body } = await evaluate(source, {
    ...runtime,
    rehypePlugins: [
      [
        rehypeShiki,
        {
          themes: { light: KUBCODE_LIGHT, dark: KUBCODE_DARK },
          defaultColor: false,
          langs: SHIKI_LANGS,
          defaultLanguage: "text",
          fallbackLanguage: "text",
          transformers: [
            {
              pre(this: { options: { lang: string; meta?: { __raw?: string } } }, node: HastNode) {
                node.properties = node.properties ?? {};
                node.properties["data-language"] = this.options.lang;
                const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? "")?.[1];
                if (title) node.properties["data-title"] = title;
              },
            },
          ],
        },
      ],
      rehypeHeadings(toc),
    ],
  });
  return { content: <Body components={components} />, toc };
}
