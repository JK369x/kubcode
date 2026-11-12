import Link from "next/link";
import type { AgentInstall as AgentInstallData, Tool } from "@/lib/content";
import { AGENT_INSTALL_ID, AGENT_INSTALL_TITLE } from "@/lib/agent-install";
import { CopyButton } from "./CopyButton";
import { ToolLogo } from "./ToolLogo";
import { BreakableText } from "./BreakableText";

/**
 * One prompt the reader pastes into their own AI agent, which then installs
 * the skill, plugin or kit for them. Sits at the top of the reading column.
 */
export function AgentInstall({ install, tools }: { install: AgentInstallData; tools: Tool[] }) {
  const agents = install.agents.map((slug) => tools.find((t) => t.slug === slug)).filter((t): t is Tool => !!t);
  return (
    <section className="agent-install" aria-labelledby={AGENT_INSTALL_ID}>
      <h2 id={AGENT_INSTALL_ID} tabIndex={-1}>
        {AGENT_INSTALL_TITLE}
      </h2>
      <p className="agent-install-lead">
        ไม่ต้องพิมพ์คำสั่งเอง: คัดลอก prompt นี้ไปวางใน AI agent ของคุณ แล้วมันจะติดตั้งให้
      </p>
      <ul className="agent-install-agents" aria-label="ใช้กับ agent">
        {agents.map((t) => (
          <li key={t.slug}>
            <Link href={`/tools/${t.slug}`} transitionTypes={["nav-forward"]}>
              <ToolLogo slug={t.slug} logo={t.logo} size="icon" morph={false} />
              <span>{t.name}</span>
            </Link>
          </li>
        ))}
      </ul>
      <figure className="code-block agent-install-prompt">
        <div className="code-body">
          <CopyButton label="คัดลอก prompt" />
          <pre tabIndex={0}>
            <code>
              <BreakableText text={install.prompt} />
            </code>
          </pre>
        </div>
      </figure>
      <ul className="agent-install-notes">
        <li>agent จะอธิบายว่าจะติดตั้งอะไรและขออนุญาตก่อนรันคำสั่งทุกครั้ง อ่านก่อนกดอนุญาต</li>
        {install.packages.map((slug) => (
          <li key={slug}>
            prompt นี้ใช้ชุดดาวน์โหลดของเรา:{" "}
            <Link href={`/skills/${slug}`}>เข้าสู่ระบบแล้วดาวน์โหลดที่หน้า skill</Link> แล้วบอก path ของไฟล์ให้ agent
          </li>
        ))}
      </ul>
    </section>
  );
}
