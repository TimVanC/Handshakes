#!/usr/bin/env node
/**
 * Loads every pipeline/out/*.sql artifact into Supabase over a direct
 * Postgres connection, in dependency order. Exists because the dashboard
 * SQL editor caps paste size well below the ~1.4MB these loads total.
 *
 * Setup (once): put DATABASE_URL=<connection string> in .env at the repo
 * root (Supabase dashboard → Connect → Session pooler URI, password filled
 * in). .env is gitignored; the credential never leaves this machine.
 *
 * Usage: node pipeline/load.mjs
 * Idempotent: every statement in the artifacts is an upsert/do-nothing, so
 * re-running after a partial failure is safe and expected.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import pg from "pg";

// minimal .env parse — no dotenv dependency for one variable
if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL. Put it in .env (see header comment).");
  process.exit(1);
}

const ORDER = [
  /^players_/, /^stints_/, /^fseasons_/, /^source_records/,
  /^puzzles_import/, /^scheduled_puzzles/, /^priority_queue/,
];
const files = readdirSync("pipeline/out").filter((f) => f.endsWith(".sql") && ORDER.some((re) => re.test(f)));
files.sort((a, b) => ORDER.findIndex((re) => re.test(a)) - ORDER.findIndex((re) => re.test(b)) || a.localeCompare(b));

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
let ok = 0, failed = 0;
for (const f of files) {
  try {
    await client.query(readFileSync(`pipeline/out/${f}`, "utf8"));
    ok++;
    process.stderr.write(`  ok  ${f}\n`);
  } catch (e) {
    failed++;
    process.stderr.write(`FAIL  ${f}: ${e.message}\n`);
  }
}
const counts = await client.query(
  `select (select count(*) from public.players) players,
          (select count(*) from public.stints) stints,
          (select count(*) from public.franchise_seasons) franchise_seasons,
          (select count(*) from public.puzzles_import) puzzles_import,
          (select count(*) from public.scheduled_puzzles) scheduled_puzzles,
          (select count(*) from public.priority_queue) priority_queue`
);
await client.end();
console.log(`\n${ok} files loaded, ${failed} failed`);
console.table(counts.rows[0]);
if (failed) process.exit(1);
