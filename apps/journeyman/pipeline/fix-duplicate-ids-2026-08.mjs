#!/usr/bin/env node
// Reassign unique puzzle ids to the 2026-08 S-tier batch entries whose
// configured startId collided with existing mid-file ids (MLB + NFL), then
// patch the same ids inside the scheduled_puzzles JSON so bundle and DB agree.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

const BATCH = {
  mlb: {
    path: "src/data/mlb/puzzles.ts",
    answers: JSON.parse(readFileSync("pipeline/out/mlb-stier-config.json", "utf8")).players
      .map((n) => (n === "A.J. Burnett" ? "A. J. Burnett" : n === "B.J. Upton" ? "B. J. Upton" : n)),
  },
  nfl: {
    path: "src/data/nfl/puzzles.ts",
    answers: JSON.parse(readFileSync("pipeline/out/nfl-stier-config.json", "utf8")).players,
  },
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  for (const [sport, cfg] of Object.entries(BATCH)) {
    let src = readFileSync(cfg.path, "utf8");
    const allIds = [...src.matchAll(/^    id: (\d+),/gm)].map((m) => Number(m[1]));
    const counts = new Map();
    for (const id of allIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    let next = Math.max(...allIds) + 1;
    let fixed = 0;
    for (const answer of cfg.answers) {
      const at = src.indexOf(`answer: ${JSON.stringify(answer)}`);
      if (at < 0) throw new Error(`${sport}: ${answer} not found`);
      // The id line sits a couple of lines above the answer within this object.
      const objStart = src.lastIndexOf("\n  {", at);
      const idMatch = src.slice(objStart, at).match(/    id: (\d+),/);
      if (!idMatch) throw new Error(`${sport}: no id line for ${answer}`);
      const oldId = Number(idMatch[1]);
      if ((counts.get(oldId) ?? 0) < 2) continue; // this one is already unique
      const newId = next++;
      src = src.slice(0, objStart) + src.slice(objStart, at).replace(`    id: ${oldId},`, `    id: ${newId},`) + src.slice(at);
      counts.set(oldId, counts.get(oldId) - 1);
      const res = await client.query(
        "update public.scheduled_puzzles set puzzle = jsonb_set(puzzle, '{id}', to_jsonb($1::int)) where sport = $2 and answer = $3 and not frozen",
        [newId, sport, answer]
      );
      if (res.rowCount !== 1) throw new Error(`${sport}: ${answer} updated ${res.rowCount} DB rows (expected 1)`);
      fixed++;
    }
    writeFileSync(cfg.path, src);
    console.log(`${sport}: reassigned ${fixed} ids (new range up to ${next - 1})`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  console.error("ROLLED BACK:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
