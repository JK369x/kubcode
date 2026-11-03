// CI gate for pending migrations: flags statements that can destroy, rewrite,
// rename or expose existing data so the pipeline stops for an explicit owner
// approval. Additive DDL (CREATE ... IF NOT EXISTS, ADD COLUMN, GRANT/REVOKE,
// policies, triggers) passes. Deliberately conservative: a false positive only
// costs a manual approval, a false negative could cost data.
//
// Findings carry a keyword and a 1-based line number only, never SQL text.

export type DestructiveFinding = { keyword: string; line: number };

// Blank out comments, quoted literals and quoted identifiers while keeping
// every newline and offset, so keywords inside them never match and line
// numbers stay exact. Dollar-quoted bodies are kept: a DO block or function
// body can delete data too.
function maskNonCode(sql: string): string {
  const out = sql.split("");
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      // PostgreSQL block comments nest.
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") (depth++, (j += 2));
        else if (sql[j] === "*" && sql[j + 1] === "/") (depth--, (j += 2));
        else j++;
      }
      blank(i, j);
      i = j;
    } else if (c === "'") {
      // E'...' strings allow backslash escapes; standard strings double ''.
      const escapes = i > 0 && /[eE]/.test(sql[i - 1]) && (i < 2 || !/\w/.test(sql[i - 2]));
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === "\\") j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') break;
        else j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

// Not destructive even though they contain a flagged word.
const EXEMPT: RegExp[] = [
  /\bON\s+(?:DELETE|UPDATE)\b/gi, // foreign-key referential actions
  /\bFOR\s+(?:NO\s+KEY\s+UPDATE|UPDATE|DELETE)\b/gi, // row locks, CREATE POLICY ... FOR <cmd>
  /\b(?:BEFORE|AFTER|OF|OR)\s+(?:UPDATE|DELETE|TRUNCATE)\b/gi, // trigger events
  /\b(?:GRANT|REVOKE)\b[^;]*/gi, // privilege lists name UPDATE/DELETE/TRUNCATE
];

const RULES: Array<[string, RegExp]> = [
  ["DROP", /\bDROP\b/gi],
  ["DELETE", /\bDELETE\b/gi],
  ["TRUNCATE", /\bTRUNCATE\b/gi],
  ["RENAME", /\bRENAME\b/gi],
  ["UPDATE", /\bUPDATE\b/gi],
  ["ALTER COLUMN TYPE", /\bALTER\s+(?:COLUMN\s+)?[\w.]+\s+(?:SET\s+DATA\s+)?TYPE\b/gi],
  ["DISABLE ROW LEVEL SECURITY", /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/gi],
  ["NO FORCE ROW LEVEL SECURITY", /\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/gi],
  ["OR REPLACE", /\bOR\s+REPLACE\b/gi],
  ["SET SCHEMA", /\bSET\s+SCHEMA\b/gi],
];

export function findDestructiveStatements(sql: string): DestructiveFinding[] {
  let code = maskNonCode(sql);
  for (const pattern of EXEMPT) code = code.replace(pattern, (m) => m.replace(/[^\n]/g, " "));
  const found: Array<DestructiveFinding & { at: number }> = [];
  for (const [keyword, pattern] of RULES)
    for (const m of code.matchAll(pattern)) {
      const at = m.index ?? 0;
      found.push({ keyword, line: code.slice(0, at).split("\n").length, at });
    }
  return found.sort((a, b) => a.at - b.at).map(({ keyword, line }) => ({ keyword, line }));
}

// ------------------------------------------------------- pipeline decision

export type PlanReport = {
  pending: string[];
  destructive: Array<{ version: string; findings: DestructiveFinding[] }>;
  checksumMismatch: string[];
  unknownApplied: string[];
};

export type RunContext = {
  event: string; // github.event_name
  actor: string; // github.actor
  owner: string; // github.repository_owner
  approval: string; // workflow_dispatch input, empty on push
};

export type MigrationDecision = { migrate: boolean; deploy: boolean; reason: string; warnings: string[] };

// The exact phrase the owner must type into a manual run to approve the
// destructive pending versions, in plan order.
export const approvalPhrase = (report: PlanReport) => `approve ${report.destructive.map((d) => d.version).join(",")}`;

export function decideMigration(report: PlanReport, run: RunContext): MigrationDecision {
  const warnings = report.unknownApplied.length
    ? [`ledger has versions not in this checkout: ${report.unknownApplied.join(",")}`]
    : [];
  const stop = (reason: string): MigrationDecision => ({ migrate: false, deploy: false, reason, warnings });
  if (report.checksumMismatch.length)
    return stop(`applied migration edited (checksum mismatch): ${report.checksumMismatch.join(",")}; add a new migration instead`);
  if (!report.pending.length) return { migrate: false, deploy: true, reason: "no pending migrations", warnings };
  if (!report.destructive.length)
    return { migrate: true, deploy: true, reason: `additive pending: ${report.pending.join(",")}`, warnings };
  const phrase = approvalPhrase(report);
  const approved = run.event === "workflow_dispatch" && run.actor === run.owner && run.approval === phrase;
  if (approved) return { migrate: true, deploy: true, reason: `owner approved destructive: ${phrase}`, warnings };
  return stop(
    `destructive pending migration needs owner approval: run the production workflow manually with approval "${phrase}"`,
  );
}
