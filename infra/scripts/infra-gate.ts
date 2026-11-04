// CI only: reads `pulumi preview --json` output (argv[2]) and decides whether
// `pulumi up` may run. Context comes from the GitHub Actions environment.
//   infra-gate.ts summary <file>  -> markdown summary on stdout (PR comment)
//   infra-gate.ts gate <file>     -> writes apply=true|false to $GITHUB_OUTPUT,
//                                    exits 1 when the run must stop
import { appendFileSync, readFileSync } from "node:fs";
import { decideInfra, parsePreview, summarize } from "../src/preview-gate";

function main(): number {
  const [mode, file] = process.argv.slice(2);
  if (!file || (mode !== "summary" && mode !== "gate")) {
    console.error("::error::usage: infra-gate <summary|gate> <preview.json>");
    return 2;
  }
  let report;
  try {
    report = parsePreview(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`::error::${(e as Error).message}`);
    return 1;
  }
  const md = summarize(report);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) appendFileSync(summaryFile, `${md}\n`);
  if (mode === "summary") {
    console.log(md);
    return 0;
  }
  const decision = decideInfra(report, {
    event: process.env.GITHUB_EVENT_NAME ?? "",
    actor: process.env.GITHUB_ACTOR ?? "",
    owner: process.env.GITHUB_REPOSITORY_OWNER ?? "",
    approval: process.env.INFRA_APPROVAL ?? "",
  });
  for (const s of report.destructive) console.log(`destructive: ${s.op} ${s.urn}`);
  console.log(decision.reason);
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `apply=${decision.apply}\n`);
  if (!decision.apply) {
    console.error(`::error::${decision.reason}`);
    return 1;
  }
  return 0;
}

process.exit(main());
