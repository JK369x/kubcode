// Explicit operator command: applies pending account migrations to DATABASE_URL.
//   npm run db:migrate:accounts            -> dry run (lists versions, no DB access)
//   npm run db:migrate:accounts -- --plan  -> read-only ledger check: pending versions,
//                                             checksum drift and destructive findings as
//                                             one JSON line (used by the CI gate)
//   npm run db:migrate:accounts -- --apply -> applies under an advisory lock
// Never prints the connection string, SQL text, SQL errors or row data.
import { createPool, pgErrorCode } from "../lib/accounts/db";
import { loadMigrations, migrate, planMigrations, readLedger, MigrationChecksumError } from "../lib/accounts/migrate";
import { findDestructiveStatements } from "../lib/accounts/migration-gate";

async function main(): Promise<number> {
  const migrations = loadMigrations();
  const plan = process.argv.includes("--plan");
  if (!process.argv.includes("--apply") && !plan) {
    console.log(`[accounts-migrate] DRY_RUN versions=${migrations.map((m) => m.version).join(",")}`);
    console.log("[accounts-migrate] pass --plan (read-only) or --apply to use DATABASE_URL");
    return 0;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[accounts-migrate] DATABASE_URL_MISSING");
    return 2;
  }
  const pool = createPool(url, { max: 1 });
  try {
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
    if (error instanceof MigrationChecksumError) console.error(`[accounts-migrate] CHECKSUM_MISMATCH ${error.version}`);
    else console.error(`[accounts-migrate] FAILED${pgErrorCode(error) ? ` SQLSTATE_${pgErrorCode(error)}` : ""}`);
    return 1;
  } finally {
    await pool.end();
  }
}

main().then((code) => process.exit(code));
