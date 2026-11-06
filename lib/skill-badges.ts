import type { Skill } from "./catalog";
import { AGENT_NAMES, approvedPackageFor } from "./packages";

/** A short fact a creator cares about, shown as a pill on cards and skill pages. */
export type SkillBadge = {
  key: "free" | "no-download" | "no-key" | "external-cost" | "agents";
  label: string;
  /** Longer explanation for a tooltip or the skill page. */
  title?: string;
};

/**
 * Badges from data only: downloads from the package allowlist, cost from the
 * catalogue, agents from the package (each one named in its README).
 */
export function skillBadges(skill: Pick<Skill, "slug" | "cost" | "costNote">): SkillBadge[] {
  const pkg = approvedPackageFor(skill.slug);
  const out: SkillBadge[] = [
    pkg
      ? { key: "free", label: "โหลดฟรี", title: "สมาชิกที่เข้าสู่ระบบดาวน์โหลดได้ฟรี" }
      : { key: "no-download", label: "ยังไม่เปิดโหลด" },
    skill.cost === "external"
      ? { key: "external-cost", label: "มีค่าใช้จ่ายภายนอก", title: skill.costNote }
      : { key: "no-key", label: "ไม่ต้องใช้ API key" },
  ];
  if (pkg && pkg.agents.length > 0) {
    out.push({ key: "agents", label: "ใช้กับ " + pkg.agents.map((a) => AGENT_NAMES[a]).join(" · ") });
  }
  return out;
}
