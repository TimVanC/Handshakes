#!/usr/bin/env node
/**
 * Session 4 — import every authored puzzle into puzzles_import, byte-faithful.
 *
 * Two rules (SESSION_4 doc §4.2):
 *  - AIRED days (day <= today for that sport) import frozen=true. The DB
 *    trigger from migration 20260728063247 then rejects any UPDATE/DELETE.
 *  - Unaired authored puzzles import frozen=false, source='authored'.
 *
 * Day mapping: NFL/MLB are release-mode (puzzles[day-1] airs day N).
 * NBA is roster-mode: ROSTER[day-1] names the answer; a puzzle airs on the
 * day whose roster name matches its answer (case/accent-insensitive).
 * Roster days with no built puzzle produce no row (the fallback pool is a
 * client behavior, not a schedule fact).
 *
 * Emits pipeline/out/puzzles_import.sql (idempotent upsert; frozen rows are
 * excluded from the upsert's update path — they cannot be touched anyway).
 * Launch dates: NBA 2026-07-15, NFL/MLB 2026-07-22 (00_CONSTRAINTS.md §2,
 * confirmed against play data in Session 2).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("pipeline/out", { recursive: true });

const LAUNCH = { nba: "2026-07-15", nfl: "2026-07-22", mlb: "2026-07-22" };
const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNum = (sport) => Math.floor((Date.parse(todayET) - Date.parse(LAUNCH[sport])) / 86400000) + 1;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Parse puzzles out of the TS files without executing them: extract the
// array literal and eval it in a bare scope (files are data-only literals).
function loadPuzzles(path, exportName) {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf(`export const ${exportName}`);
  // the first "[" after the ASSIGNMENT, not the one in the `Puzzle[]` type
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", start)));
  // find matching close bracket at depth 0
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open, end + 1);
  return Function(`"use strict"; return (${body});`)();
}

const sets = {
  nba: loadPuzzles("src/data/puzzles.ts", "puzzles"),
  nfl: loadPuzzles("src/data/nfl/puzzles.ts", "nflPuzzles"),
  mlb: loadPuzzles("src/data/mlb/puzzles.ts", "mlbPuzzles"),
};

// NBA roster for answer->day mapping
const rosterSrc = readFileSync("src/data/roster.ts", "utf8");
const ROSTER = [...rosterSrc.matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]);

const rows = [];
for (const [sport, puzzles] of Object.entries(sets)) {
  const today = dayNum(sport);
  if (sport === "nba") {
    const byAnswer = new Map(puzzles.map((p) => [norm(p.answer), p]));
    ROSTER.forEach((name, i) => {
      const p = byAnswer.get(norm(name));
      if (!p) return;
      rows.push({ sport, day: i + 1, p, frozen: i + 1 <= today });
    });
  } else {
    puzzles.forEach((p, i) => rows.push({ sport, day: i + 1, p, frozen: i + 1 <= today }));
  }
}
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const sql = rows.map((r) =>
  `insert into public.puzzles_import (sport, day, answer, puzzle, source, frozen) values (${esc(r.sport)}, ${r.day}, ${esc(r.p.answer)}, ${esc(JSON.stringify(r.p))}::jsonb, 'authored', ${r.frozen}) on conflict (sport, day) do nothing;`
).join("\n");
writeFileSync("pipeline/out/puzzles_import.sql", sql + "\n");
const frozen = rows.filter((r) => r.frozen).length;
console.error(`puzzles_import.sql: ${rows.length} rows (${frozen} frozen/aired) — NBA day today=${dayNum("nba")}, NFL/MLB=${dayNum("nfl")}`);
console.error(`NOTE: on conflict DO NOTHING — an import can never modify an existing day; frozen rows are additionally trigger-guarded.`);
