// The "install with your own AI agent" section: its heading and TOC entry.
import type { Page } from "./content";
import { headingId, type TocItem } from "./mdx";

export const AGENT_INSTALL_TITLE = "ติดตั้งด้วย AI agent ของคุณ";
export const AGENT_INSTALL_ID = headingId(AGENT_INSTALL_TITLE);

/** The page TOC with the agent section first, when the page has one. */
export function tocWithAgentInstall(page: Page, toc: TocItem[]): TocItem[] {
  if (!page.agentInstall) return toc;
  return [{ depth: 2, id: AGENT_INSTALL_ID, text: AGENT_INSTALL_TITLE }, ...toc];
}
