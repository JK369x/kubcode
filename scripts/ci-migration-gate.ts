// CI only: turns the read-only `accounts-migrate --plan` output into the
// production pipeline decision (migrate? deploy?). Reads the plan output file
// given as argv[2]; context comes from the GitHub Actions environment.
// Writes migrate=/deploy= to $GITHUB_OUTPUT and exits 1 when the run must stop.
import { appendFileSync, readFileSync } from "node:fs";
import { decideMigration, type PlanReport } from "../lib/accounts/migration-gate";

const PREFIX = "[accounts-migrate] PLAN ";

function main(): number {
  const file = process.argv[2];
  if (!file) {
    console.error("::error::usage: ci-migration-gate <plan-output-file>");
    return 2;
  }
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(PREFIX));
  if (!line) {
    console.error("::error::migration plan output missing; refusing to migrate or deploy");
    return 1;
  }
  const report = JSON.parse(line.slice(PREFIX.length)) as PlanReport;
  const decision = decideMigration(report, {
    event: process.env.GITHUB_EVENT_NAME ?? "",
    actor: process.env.GITHUB_ACTOR ?? "",
    owner: process.env.GITHUB_REPOSITORY_OWNER ?? "",
    approval: process.env.MIGRATION_APPROVAL ?? "",
  });
  for (const w of decision.warnings) console.log(`::warning::${w}`);
  for (const d of report.destructive)
    console.log(`destructive ${d.version}: ${d.findings.map((f) => `${f.keyword}@L${f.line}`).join(", ")}`);
  console.log(`pending=${report.pending.join(",") || "none"} migrate=${decision.migrate} deploy=${decision.deploy}`);
  console.log(decision.reason);
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `migrate=${decision.migrate}\ndeploy=${decision.deploy}\n`);
  if (!decision.deploy) {
    console.error(`::error::${decision.reason}`);
    return 1;
  }
  return 0;
}

process.exit(main());
