#!/usr/bin/env node
/**
 * Session 5 — standalone data validator, the CI gate.
 *
 * Node-only re-implementation of the dev-console guards in
 * src/data/validatePuzzles.ts (which need the Vite/React runtime), extended
 * per SESSION_5 §5.3. Runs against the committed data files; exits 1 on any
 * ERROR. Checks, per sport:
 *
 *  1. duplicate answers (a puzzle airing twice)
 *  2. every stint's franchise has a colorways entry
 *  3. no stint spans a franchise identity change (relocation/rebrand)
 *  4. displayTeam matches the era identity at startYear
 *  5. teamSeasons row exists for every stint season (blank card backs)
 *  6. NFL/MLB: exactly 5 stat cells per stint
 *  7. revealOrder is a permutation of the stints
 *  8. every answer resolves in that sport's playerIndex (type-ahead)
 *  9. every hint-ladder field non-null/non-empty
 * 10. jerseyNumber present or explicitly null (never undefined/0)
 *
 * Known pre-existing warnings (Foxx CHC 1943, Irvin NWE 1944 — wartime gaps,
 * deliberate) are downgraded to WARN via the allowlist below.
 */
import { readFileSync } from "node:fs";

const ALLOW_MISSING_SEASONS = new Set(["mlb|CHC|1943", "mlb|NWE|1944"]);
const HINT_KEYS = {
  nba: ["position", "height", "draftYear", "draftPick", "college"],
  nfl: ["position", "height", "draftYear", "draftPick", "college"],
  mlb: ["position", "batsThrows", "height", "debutYear", "born"],
};
const SPORTS = {
  nba: { puzzles: ["src/data/puzzles.ts", "puzzles"], colorways: "src/data/colorways.json", seasons: "src/data/teamSeasons.json", index: "src/data/playerIndex.json", statCells: false },
  nfl: { puzzles: ["src/data/nfl/puzzles.ts", "nflPuzzles"], colorways: "src/data/nfl/colorways.json", seasons: "src/data/nfl/teamSeasons.json", index: "src/data/nfl/playerIndex.json", statCells: true },
  mlb: { puzzles: ["src/data/mlb/puzzles.ts", "mlbPuzzles"], colorways: "src/data/mlb/colorways.json", seasons: "src/data/mlb/teamSeasons.json", index: "src/data/mlb/playerIndex.json", statCells: true },
};

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.'’]/g, "").toLowerCase().trim();
const base = (s) => s.replace(/\s*\(.*\)$/, "").trim();
function loadArray(path, name) {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf(`export const ${name}`);
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", start)));
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]" && --depth === 0) { end = i; break; }
  }
  return Function(`"use strict"; return (${src.slice(open, end + 1)});`)();
}

let errors = 0, warns = 0;
const err = (m) => { console.error("ERROR " + m); errors++; };
const warn = (m) => { console.error("warn  " + m); warns++; };

for (const [sport, cfg] of Object.entries(SPORTS)) {
  const puzzles = loadArray(...cfg.puzzles);
  const cw = JSON.parse(readFileSync(cfg.colorways, "utf8")).franchises;
  const ts = JSON.parse(readFileSync(cfg.seasons, "utf8"));
  const index = new Set(JSON.parse(readFileSync(cfg.index, "utf8")).map((x) => norm(x[0])));
  const tag = `[${sport}]`;
  const seen = new Map();

  for (const p of puzzles) {
    const key = norm(p.answer);
    if (seen.has(key)) err(`${tag} "${p.answer}" is both puzzle ${seen.get(key)} and ${p.id} — airs twice`);
    seen.set(key, p.id);
    if (!index.has(key)) err(`${tag} "${p.answer}" not in playerIndex — the guess box cannot accept it`);
    const ro = p.revealOrder || [];
    const ok = ro.length === p.stints.length && new Set(ro).size === ro.length && Math.min(...ro) === 0 && Math.max(...ro) === ro.length - 1;
    if (!ok) err(`${tag} "${p.answer}" revealOrder is not a permutation of ${p.stints.length} stints`);
    for (const k of HINT_KEYS[sport]) {
      if (!p.hints || p.hints[k] == null || p.hints[k] === "") err(`${tag} "${p.answer}" hint "${k}" missing — hint ladder breaks mid-puzzle`);
    }
    for (const s of p.stints) {
      const eras = cw[s.franchise];
      if (!eras) { err(`${tag} "${p.answer}": no colorways for franchise "${s.franchise}"`); continue; }
      const at = (y) => { const e = eras.find((e) => y >= e.years[0] && y <= e.years[1]); return e ? base(e.identity) : null; };
      const a = at(s.startYear), b = at(s.endYear);
      if (!a || !b) err(`${tag} "${p.answer}": no colorway era covers ${s.franchise} ${s.startYear}-${s.endYear}`);
      else if (a !== b) err(`${tag} "${p.answer}": stint ${s.franchise} ${s.startYear}-${s.endYear} spans "${a}" -> "${b}" — split it`);
      else if (base(s.displayTeam) !== a) err(`${tag} "${p.answer}": displayTeam "${s.displayTeam}" != era identity "${a}" (${s.franchise} ${s.startYear})`);
      for (let y = s.startYear; y <= s.endYear; y++) {
        if (!(ts[s.franchise] && ts[s.franchise][y])) {
          const k = `${sport}|${s.franchise}|${y}`;
          (ALLOW_MISSING_SEASONS.has(k) ? warn : err)(`${tag} "${p.answer}": no teamSeasons row ${s.franchise} ${y} — blank card back`);
        }
      }
      if (cfg.statCells && (s.statLine?.length ?? 0) !== 5) err(`${tag} "${p.answer}": ${s.franchise} ${s.startYear} has ${s.statLine?.length ?? 0} stat cells (need 5)`);
      // 0 is a REAL number in authored data (Marion wore #0 in Dallas) —
      // the "0 = missing" rule applies only to nflverse SOURCE rows.
      if (s.jerseyNumber === undefined) err(`${tag} "${p.answer}": ${s.franchise} ${s.startYear} jerseyNumber undefined — must be a number or explicit null`);
    }
  }
  console.error(`${tag} ${puzzles.length} puzzles checked`);
}
console.error(`\n${errors} errors, ${warns} warnings`);
process.exit(errors ? 1 : 0);
