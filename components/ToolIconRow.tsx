import Link from "next/link";
import type { Tool } from "@/lib/content";
import { ToolLogo } from "./ToolLogo";

/**
 * The tools an article uses, as their makers' logos (the same files and
 * monogram fallbacks as /tools), each linking to its tool page.
 */
export function ToolIconRow({ tools, className }: { tools: Tool[]; className?: string }) {
  if (tools.length === 0) return null;
  return (
    <ul className={className ? `tool-icons ${className}` : "tool-icons"} aria-label="เครื่องมือที่ใช้">
      {tools.map((t) => (
        <li key={t.slug}>
          <Link href={`/tools/${t.slug}`} aria-label={t.name} title={t.name} transitionTypes={["nav-forward"]}>
            <ToolLogo slug={t.slug} logo={t.logo} size="icon" morph={false} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
