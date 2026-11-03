// Explicit operator command: applies pending account migrations to DATABASE_URL.
//   npm run db:migrate:accounts            -> dry run (lists versions, no DB access)
//   npm run db:migrate:accounts -- --apply -> applies under an advisory lock
// Never prints the connection string, SQL errors or row data.
import { createPool, pgErrorCode } from "../lib/accounts/db";
import { loadMigrations, migrate, MigrationChecksumError } from "../lib/accounts/migrate";

async function main(): Promise<number> {
  const migrations = loadMigrations();
  if (!process.argv.includes("--apply")) {
    console.log(`[accounts-migrate] DRY_RUN versions=${migrations.map((m) => m.version).join(",")}`);
    console.log("[accounts-migrate] pass --apply to run against DATABASE_URL");
    return 0;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[accounts-migrate] DATABASE_URL_MISSING");
    return 2;
  }
  const pool = createPool(url, { max: 1 });
  try {
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
