import { Film, Mic2, Captions } from "lucide-react";
import type { Skill } from "@/lib/catalog";
import { ToolMark, resolveToolMark, type ToolKind } from "./ToolMark";

export function SkillIcon({
  category,
  size = 24,
}: {
  category: string;
  size?: number;
}) {
  const Icon =
    category === "audio" ? Mic2 : category === "captions" ? Captions : Film;
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />;
}

export type SkillTool = { name: string; kind: ToolKind };

/*
 * Authors come only from real examples (deduplicated, in order). A skill with
 * no examples has no authors — nothing is invented.
 *
 * Runtimes are derived from the first example's renderer, falling back to the
 * skill's declared requirements. They are what the catalog *names*, not
 * proof that anything is installed. Order matters: "Python SVG + GSAP /
 * HyperFrames" must resolve to GSAP before the plain-SVG rule.
 */
export function getSkillTools(skill: Skill, authors = false): SkillTool[] {
  const names = authors
    ? [...new Set(skill.examples.map((example) => example.author))]
    : runtimeNames(skill);
  return names.map((name) => ({ name, kind: resolveToolMark(name).kind }));
}

function runtimeNames(skill: Skill): string[] {
  const renderer = skill.examples[0]?.renderer || skill.requirements.join(" ");
  if (/Remotion/.test(renderer)) return ["React", "Remotion"];
  if (/Three/.test(renderer)) return ["Three.js", "HyperFrames"];
  if (/GSAP/.test(renderer)) return ["GSAP", "HyperFrames"];
  if (/Canvas/.test(renderer)) return ["Canvas 2D", "FFmpeg"];
  if (/SVG/.test(renderer)) return ["Editable SVG"];
  if (skill.category === "audio") return ["VoxCPM2 / MLX"];
  return ["Renderer adapter"];
}

export function ToolChips({
  skill,
  authors = false,
}: {
  skill: Skill;
  authors?: boolean;
}) {
  const tools = getSkillTools(skill, authors);
  if (tools.length === 0) return null;
  return (
    <div
      className="tool-chips"
      role="group"
      aria-label={authors ? "ผู้เขียนโค้ด" : "เครื่องมือที่ต้องใช้"}
      data-tool-group={authors ? "authors" : "runtime"}
    >
      {tools.map(({ name, kind }) => (
        <span
          className="tool-chip"
          key={name}
          data-tool={resolveToolMark(name).key}
          data-tool-kind={kind}
        >
          <ToolMark name={name} size={18} />
          <span className="tool-name">{name}</span>
        </span>
      ))}
    </div>
  );
}
