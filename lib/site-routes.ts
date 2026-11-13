import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Whether an optional page ships in this build (checked at build time from
 * the app directory), so links to pages that land in other PRs, such as
 * /pricing and /roadmap (#89), appear only once the page exists.
 */
export function hasPage(route: "/pricing" | "/roadmap"): boolean {
  return existsSync(path.join(process.cwd(), "app", route.slice(1), "page.tsx"));
}
