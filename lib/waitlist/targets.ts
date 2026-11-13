// What a member can join the waitlist for: a coming-soon plan or a roadmap
// item that is not open yet. Anything else is rejected before the database.
import { PLANS } from "../plans";
import { ROADMAP } from "../roadmap";

export type WaitlistKind = "plan" | "roadmap";
export type WaitlistTarget = { kind: WaitlistKind; id: string };

export const isWaitlistKind = (v: unknown): v is WaitlistKind => v === "plan" || v === "roadmap";

export function waitlistTargetOpen(t: WaitlistTarget): boolean {
  if (t.kind === "plan") return PLANS.some((p) => p.id === t.id && p.status === "coming_soon");
  return ROADMAP.some((i) => i.id === t.id && i.status !== "now");
}

/** Every target a member can join, with its Thai label (owner counts page). */
export function waitlistTargets(): (WaitlistTarget & { label: string })[] {
  return [
    ...PLANS.filter((p) => p.status === "coming_soon").map((p) => ({ kind: "plan" as const, id: p.id, label: `แพ็กเกจ ${p.nameTh} (${p.nameEn})` })),
    ...ROADMAP.filter((i) => i.status !== "now").map((i) => ({ kind: "roadmap" as const, id: i.id, label: i.titleTh })),
  ];
}
