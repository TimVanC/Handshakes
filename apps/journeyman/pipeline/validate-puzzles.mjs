#!/usr/bin/env node
/**
 * Puzzle-pool integrity guard. Run before committing any authoring batch
 * (also wired into `npm run build` so a bad pool can't deploy).
 *
 * Checks, per sport (active pools + benches):
 *  - DUPLICATE ANSWERS: no two puzzles in a sport's ACTIVE pool share an
 *    answer (case/accent-insensitive). The scheduler only dedups its own
 *    queue walk — a hand-authored duplicate would air twice without this.
 *    Bench arrays may repeat an active answer only deliberately (a re-air
 *    staged by moving the object back), so bench-vs-active collisions are
 *    reported as errors too: a player must live in exactly one place.
 *  - NBA ROSTER: no duplicate names (ROSTER is the schedule, so a repeat
 *    name = the same answer airing twice).
 *  - unique puzzle ids within each file
 *  - revealOrder is an exact permutation of the stint indices
 *  - every stint's (franchise, startYear) maps to a colorway era
 *  - every season covered by every stint has a W-L/playoff-result row
 *  - every stint accolade uses a key rendered by that sport
 *  - stat shape (nba: gp/mpg/ppg/rpg/apg; nfl/mlb: 5-cell statLine)
 */
import { readFileSync } from "node:fs";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function loadArray(path, name, optional = false) {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const st = src.indexOf(`export const ${name}`);
  if (st < 0) {
    if (optional) return [];
    throw new Error(`${name} not found in ${path}`);
  }
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", st)));
  let d = 0, e = -1;
  for (let i = open; i < src.length; i++) { if (src[i] === "[") d++; else if (src[i] === "]" && --d === 0) { e = i; break; } }
  return Function(`return (${src.slice(open, e + 1)});`)();
}

const SPORTS = {
  nba: {
    active: loadArray("src/data/puzzles.ts", "puzzles"),
    bench: [],
    cw: JSON.parse(readFileSync("src/data/colorways.json", "utf8")).franchises,
    seasons: JSON.parse(readFileSync("src/data/teamSeasons.json", "utf8")),
    accolades: new Set(["all_star","champion","mvp","fmvp","dpoy","sixth_man","roy","all_nba","all_defensive","all_rookie","dunk_champion","olympic_gold"]),
    nbaStats: true,
    roster: [...readFileSync("src/data/roster.ts", "utf8").matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]),
  },
  nfl: {
    active: loadArray("src/data/nfl/puzzles.ts", "nflPuzzles"),
    bench: loadArray("src/data/nfl/puzzles.ts", "nflBenchedPuzzles", true),
    cw: JSON.parse(readFileSync("src/data/nfl/colorways.json", "utf8")).franchises,
    seasons: JSON.parse(readFileSync("src/data/nfl/teamSeasons.json", "utf8")),
    accolades: new Set(["pro_bowl","champion","mvp","sb_mvp","all_pro","roy","droy","opoy","comeback","rushing_title","receiving_title","olympic_gold"]),
  },
  mlb: {
    active: loadArray("src/data/mlb/puzzles.ts", "mlbPuzzles"),
    bench: loadArray("src/data/mlb/puzzles.ts", "mlbBenchedPuzzles", true),
    cw: JSON.parse(readFileSync("src/data/mlb/colorways.json", "utf8")).franchises,
    seasons: JSON.parse(readFileSync("src/data/mlb/teamSeasons.json", "utf8")),
    accolades: new Set(["all_star","champion","mvp","ws_mvp","cy_young","roy","gold_glove","silver_slugger","batting_title","reliever_award","olympic_gold"]),
  },
};

let bad = 0;
const err = (msg) => { console.log(msg); bad++; };

for (const [sport, cfg] of Object.entries(SPORTS)) {
  // duplicate answers — active pool, then bench-vs-active collisions
  const activeAnswers = new Map();
  for (const p of cfg.active) {
    const key = norm(p.answer);
    if (activeAnswers.has(key)) err(`[${sport}] DUPLICATE ANSWER in active pool: "${p.answer}" (ids ${activeAnswers.get(key)} and ${p.id})`);
    else activeAnswers.set(key, p.id);
  }
  const benchAnswers = new Map();
  for (const p of cfg.bench) {
    const key = norm(p.answer);
    if (activeAnswers.has(key)) err(`[${sport}] "${p.answer}" is in BOTH the active pool (id ${activeAnswers.get(key)}) and the bench (id ${p.id}) — keep exactly one`);
    if (benchAnswers.has(key)) err(`[${sport}] DUPLICATE ANSWER on bench: "${p.answer}"`);
    else benchAnswers.set(key, p.id);
  }
  // NBA roster is the schedule — a repeated name airs twice
  if (cfg.roster) {
    const seen = new Map();
    cfg.roster.forEach((name, i) => {
      const key = norm(name);
      if (seen.has(key)) err(`[${sport}] DUPLICATE ROSTER NAME: "${name}" at days ${seen.get(key) + 1} and ${i + 1}`);
      else seen.set(key, i);
    });
  }
  // per-puzzle structural checks (active + bench)
  const ids = new Set();
  for (const p of [...cfg.active, ...cfg.bench]) {
    const tag = `[${sport}] #${p.id} ${p.answer}`;
    if (ids.has(p.id)) err(`${tag}: DUPLICATE id`);
    ids.add(p.id);
    const n = p.stints.length;
    const ro = [...(p.revealOrder || [])].sort((a, b) => a - b).join(",");
    const want = Array.from({ length: n }, (_, i) => i).join(",");
    if (ro !== want) err(`${tag}: revealOrder not a permutation of 0..${n - 1} (got [${p.revealOrder}])`);
    for (const s of p.stints) {
      const eras = cfg.cw[s.franchise];
      if (!eras) { err(`${tag}: unknown franchise tricode ${s.franchise}`); continue; }
      if (!eras.find((e) => s.startYear >= e.years[0] && s.startYear <= e.years[1]))
        err(`${tag}: NO ERA for ${s.franchise} ${s.startYear} (${s.displayTeam})`);
      if (s.endYear < s.startYear) err(`${tag}: endYear < startYear on ${s.franchise}`);
      for (let year = s.startYear; year <= s.endYear; year++) {
        if (!cfg.seasons[s.franchise]?.[year]) err(`${tag}: NO SEASON RESULT for ${s.franchise} ${year}`);
      }
      for (const accolade of s.accolades ?? []) {
        if (!cfg.accolades.has(accolade.type)) err(`${tag}: unsupported accolade ${accolade.type} on ${s.franchise}`);
        if (!Number.isInteger(accolade.count) || accolade.count < 1) err(`${tag}: invalid accolade count on ${s.franchise}`);
      }
      if (cfg.nbaStats) {
        for (const f of ["gp", "mpg", "ppg", "rpg", "apg"]) if (typeof s[f] !== "number") err(`${tag}: ${s.franchise} missing ${f}`);
      } else if (!Array.isArray(s.statLine) || s.statLine.length !== 5) {
        err(`${tag}: ${s.franchise} statLine must have 5 cells`);
      }
      if (!("jerseyNumber" in s)) err(`${tag}: ${s.franchise} missing jerseyNumber`);
    }
  }
  console.log(`[${sport}] ${cfg.active.length} active + ${cfg.bench.length} benched puzzles checked${cfg.roster ? `, roster ${cfg.roster.length} names` : ""}`);
}

if (bad) { console.error(`\n${bad} PROBLEM(S) — fix before committing/deploying`); process.exit(1); }
console.log("\nALL CLEAN");
