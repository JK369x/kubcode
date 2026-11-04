// Turns `pulumi preview --json` into the CI decision for `pulumi up`, using
// the same pattern as the production migration gate: anything that deletes or
// replaces a resource stops push runs, and the owner approves by re-running
// the workflow manually with a phrase bound to the exact destructive set.
// The phrase is an interlock against accidents, not an authorization boundary.
import { createHash } from "node:crypto";

export type PreviewStep = { op: string; urn: string };
export type PreviewReport = { steps: PreviewStep[]; changes: PreviewStep[]; destructive: PreviewStep[] };
export type GateContext = { event: string; actor: string; triggeringActor: string; owner: string; approval: string };
export type GateDecision = { apply: boolean; reason: string };

// Pulumi step ops that remove or recreate something that exists today.
const DESTRUCTIVE_OPS = new Set([
  "delete",
  "replace",
  "create-replacement",
  "delete-replaced",
  "discard",
  "discard-replaced",
  "remove-pending-replace",
]);
const UNCHANGED_OPS = new Set(["same", "read"]);

export function parsePreview(json: string): PreviewReport {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("pulumi preview output is not JSON; refusing to apply");
  }
  const raw = (data as { steps?: unknown }).steps;
  if (!Array.isArray(raw)) throw new Error("pulumi preview output has no steps (the preview failed); refusing to apply");
  const steps = raw.map((s) => {
    const { op, urn } = s as Partial<PreviewStep>;
    if (typeof op !== "string" || typeof urn !== "string") throw new Error("malformed preview step");
    return { op, urn };
  });
  return {
    steps,
    changes: steps.filter((s) => !UNCHANGED_OPS.has(s.op)),
    destructive: steps.filter((s) => DESTRUCTIVE_OPS.has(s.op)),
  };
}

export function approvalPhrase(report: PreviewReport): string {
  const lines = report.destructive.map((s) => `${s.op} ${s.urn}`).sort();
  const digest = createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 12);
  return `approve infra ${digest}`;
}

export function decideInfra(report: PreviewReport, ctx: GateContext): GateDecision {
  if (report.destructive.length === 0) return { apply: true, reason: "no deletes or replaces: applying" };
  const phrase = approvalPhrase(report);
  const blocked = (why: string): GateDecision => ({
    apply: false,
    reason:
      `${why}. The preview deletes or replaces ${report.destructive.length} resource(s). ` +
      `To approve, the repository owner runs the Infra workflow manually on main with approval "${phrase}".`,
  });
  if (ctx.event !== "workflow_dispatch") return blocked("blocked");
  // A re-run keeps the original actor, so whoever triggered this attempt must be the owner too.
  for (const who of [ctx.actor, ctx.triggeringActor])
    if (!ctx.owner || who !== ctx.owner) return blocked(`blocked: ${who || "unknown actor"} is not the repository owner`);
  if (ctx.approval !== phrase) return blocked("blocked: approval phrase does not match this preview");
  return { apply: true, reason: `owner approved destructive changes (${phrase})` };
}

const splitUrn = (urn: string) => {
  // urn:pulumi:<stack>::<project>::<type>::<name>
  const parts = urn.split("::");
  return { type: parts.at(-2) ?? "?", name: parts.at(-1) ?? "?" };
};

/** Markdown for the PR comment and the job summary. */
export function summarize(report: PreviewReport): string {
  const counts = new Map<string, number>();
  for (const s of report.steps) counts.set(s.op, (counts.get(s.op) ?? 0) + 1);
  const lines = ["### Pulumi preview (stack `prod`)", ""];
  lines.push([...counts].map(([op, n]) => `${op}: ${n}`).join(" · ") || "no steps");
  lines.push("");
  if (report.changes.length === 0) lines.push("No changes.");
  else {
    lines.push("| op | type | name |", "|---|---|---|");
    for (const s of report.changes) {
      const { type, name } = splitUrn(s.urn);
      lines.push(`| ${s.op} | ${type} | ${name} |`);
    }
  }
  if (report.destructive.length > 0) {
    lines.push(
      "",
      `**Deletes/replaces: ${report.destructive.length}.** After merge, \`pulumi up\` stops until the owner runs the Infra workflow on main with approval \`${approvalPhrase(report)}\` (if main's preview is unchanged).`,
    );
  }
  return lines.join("\n");
}
