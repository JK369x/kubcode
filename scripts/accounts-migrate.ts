// Explicit operator command: applies pending account migrations to DATABASE_URL.
//   npm run db:migrate:accounts               -> dry run (lists versions, no DB access)
//   npm run db:migrate:accounts -- --check-url -> shape check of DATABASE_URL for the
//                                                Supabase Session pooler (no connection);
//                                                MIGRATION_EXPECT_PROJECT_REF pins the project
//   npm run db:migrate:accounts -- --plan     -> read-only ledger check: pending versions,
//                                                checksum drift and destructive findings as
//                                                one JSON line (used by the CI gate)
//   npm run db:migrate:accounts -- --apply    -> applies under an advisory lock
// Never prints the connection string or any part of it, SQL text, error
// messages or row data: failures are reported as a fixed phase + code.
import { createPool } from "../lib/accounts/db";
import { checkMigrationUrlShape, classifyDbError, URL_SHAPE_HINTS } from "../lib/accounts/db-diagnostics";
import { loadMigrations, migrate, planMigrations, readLedger, MigrationChecksumError } from "../lib/accounts/migrate";
import { findDestructiveStatements } from "../lib/accounts/migration-gate";

async function main(): Promise<number> {
  const migrations = loadMigrations();
  const plan = process.argv.includes("--plan");
  const checkUrl = process.argv.includes("--check-url");
  if (!process.argv.includes("--apply") && !plan && !checkUrl) {
    console.log(`[accounts-migrate] DRY_RUN versions=${migrations.map((m) => m.version).join(",")}`);
    console.log("[accounts-migrate] pass --check-url, --plan (read-only) or --apply to use DATABASE_URL");
    return 0;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[accounts-migrate] DATABASE_URL_MISSING");
    return 2;
  }
  if (checkUrl) {
    const shape = checkMigrationUrlShape(url, process.env.MIGRATION_EXPECT_PROJECT_REF || undefined);
    if (shape.ok) {
      console.log("[accounts-migrate] URL_SHAPE_OK session-pooler");
      return 0;
    }
    console.error(`[accounts-migrate] URL_SHAPE_INVALID problems=${shape.problems.join(",")}`);
    for (const p of shape.problems) console.error(`  - ${p}: ${URL_SHAPE_HINTS[p]}`);
    return 4;
  }
  let pool: ReturnType<typeof createPool> | undefined;
  try {
    pool = createPool(url, { max: 1 });
    if (plan) {
      const result = planMigrations(migrations, await readLedger(pool));
      const report = {
        pending: result.pending.map((m) => m.version),
        destructive: result.pending
          .map((m) => ({ version: m.version, findings: findDestructiveStatements(m.sql) }))
          .filter((d) => d.findings.length > 0),
        checksumMismatch: result.checksumMismatch,
        unknownApplied: result.unknownApplied,
      };
      console.log(`[accounts-migrate] PLAN ${JSON.stringify(report)}`);
      return result.checksumMismatch.length ? 3 : 0;
    }
    const { applied } = await migrate(pool, migrations);
    console.log(`[accounts-migrate] OK applied=${applied.length ? applied.join(",") : "none"}`);
    return 0;
  } catch (error) {
    if (error instanceof MigrationChecksumError) {
      console.error(`[accounts-migrate] CHECKSUM_MISMATCH ${error.version}`);
      return 1;
    }
    const failure = classifyDbError(error);
    console.error(`[accounts-migrate] FAILED phase=${failure.phase} code=${failure.code}`);
    return 1;
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

main().then((code) => process.exit(code));
