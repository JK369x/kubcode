import type { ComponentPropsWithoutRef, ReactElement } from "react";
import * as runtime from "react/jsx-runtime";

function ContentLink(props: ComponentPropsWithoutRef<"a">) {
  const external = /^https?:\/\//.test(props.href ?? "");
  return external ? (
    <a {...props} rel="noopener noreferrer" target="_blank" />
  ) : (
    <a {...props} />
  );
}

const components = { a: ContentLink };

/**
 * Compiles a repo content body (trusted MDX from content/) to a React
 * element. Runs on the server only, at build time for static pages.
 */
export async function renderMdx(source: string): Promise<ReactElement> {
  // Dynamic import: @mdx-js/mdx is ESM-only and the test runner loads .ts as CJS.
  const { evaluate } = await import("@mdx-js/mdx");
  const { default: Body } = await evaluate(source, runtime);
  return <Body components={components} />;
}
