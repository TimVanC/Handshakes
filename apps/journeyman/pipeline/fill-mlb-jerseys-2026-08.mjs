#!/usr/bin/env node
/**
 * Fill the pre-2000 MLB jersey numbers missing from MLB's electronic roster
 * data, sourced 2026-08-11 from Baseball Almanac's per-year uniform tables
 * (same source as the documented Matt Stairs overrides). Updates the stint
 * in src/data/mlb/puzzles.ts and the puzzle JSON of the matching UNAIRED
 * scheduled_puzzles row. Sheffield's Brewers stint split #1 (1988-89) and
 * #11 (1990-91); #11 covers far more games and represents the stint.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
}

const FILLS = [
  ["Kenny Lofton", "HOU", 1991, 28], ["Kenny Lofton", "CLE", 1992, 7], ["Kenny Lofton", "ATL", 1997, 7],
  ["Gary Sheffield", "MIL", 1988, 11], ["Gary Sheffield", "SD", 1992, 10], ["Gary Sheffield", "MIA", 1993, 10],
  ["Fred McGriff", "TOR", 1986, 19], ["Fred McGriff", "SD", 1991, 29], ["Fred McGriff", "ATL", 1993, 27],
  ["Moisés Alou", "PIT", 1990, 52], ["Moisés Alou", "WSH", 1990, 18], ["Moisés Alou", "WSH", 1992, 18], ["Moisés Alou", "MIA", 1997, 18],
  ["Cliff Floyd", "WSH", 1993, 30],
  ["Luis Gonzalez", "HOU", 1990, 26], ["Luis Gonzalez", "CHC", 1995, 25], ["Luis Gonzalez", "HOU", 1997, 26], ["Luis Gonzalez", "DET", 1998, 28],
  ["David Wells", "TOR", 1987, 36], ["David Wells", "DET", 1993, 16], ["David Wells", "CIN", 1995, 49], ["David Wells", "BAL", 1996, 36],
  ["Sammy Sosa", "TEX", 1989, 17], ["Sammy Sosa", "CHW", 1989, 25],
  ["José Canseco", "OAK", 1985, 33], ["José Canseco", "TEX", 1992, 33], ["José Canseco", "BOS", 1995, 33], ["José Canseco", "OAK", 1997, 33], ["José Canseco", "TOR", 1998, 44],
];

// 1. Bundle: patch the null inside each answer's stint block.
let src = readFileSync("src/data/mlb/puzzles.ts", "utf8");
let patched = 0;
for (const [answer, franchise, startYear, number] of FILLS) {
  const at = src.indexOf(`answer: ${JSON.stringify(answer)}`);
  if (at < 0) throw new Error(`bundle: ${answer} not found`);
  const objStart = src.lastIndexOf("\n  {", at);
  let i = src.indexOf("{", objStart), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (!depth) break; } }
  const block = src.slice(objStart, i);
  const stintRe = new RegExp(`(franchise: "${franchise}",\\s*\\n\\s*displayTeam: "[^"]*",\\s*\\n\\s*startYear: ${startYear},[\\s\\S]*?jerseyNumber: )null`);
  if (!stintRe.test(block)) throw new Error(`bundle: no null jersey for ${answer} ${franchise} ${startYear}`);
  const nextBlock = block.replace(stintRe, `$1${number}`);
  src = src.slice(0, objStart) + nextBlock + src.slice(i);
  patched++;
}
writeFileSync("src/data/mlb/puzzles.ts", src);
console.log(`bundle: filled ${patched} jersey numbers`);

// 2. DB: patch the same stints inside the unaired scheduled rows' JSON.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  const answers = [...new Set(FILLS.map((f) => f[0]))];
  for (const answer of answers) {
    const res = await client.query(
      "select schedule_id, puzzle from public.scheduled_puzzles where sport = 'mlb' and answer = $1 and not frozen",
      [answer]
    );
    if (res.rowCount !== 1) throw new Error(`db: ${answer} matched ${res.rowCount} unaired rows`);
    const { schedule_id, puzzle } = res.rows[0];
    let changed = 0;
    for (const [name, franchise, startYear, number] of FILLS) {
      if (name !== answer) continue;
      const stint = puzzle.stints.find((s) => s.franchise === franchise && s.startYear === startYear);
      if (!stint) throw new Error(`db: ${answer} missing stint ${franchise} ${startYear}`);
      if (stint.jerseyNumber !== null && stint.jerseyNumber !== undefined) throw new Error(`db: ${answer} ${franchise} ${startYear} already has a number`);
      stint.jerseyNumber = number;
      changed++;
    }
    await client.query("update public.scheduled_puzzles set puzzle = $1::jsonb where schedule_id = $2", [JSON.stringify(puzzle), schedule_id]);
    console.log(`db: ${answer} — ${changed} stints filled`);
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  console.error("ROLLED BACK:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
