#!/usr/bin/env node
/**
 * Hand-authoring helper for pre-nflverse NFL careers (2026-08-10 batch:
 * Warner, Bledsoe, Cunningham, Jeff George, Eddie George, Plummer,
 * Vinatieri). nflverse weekly stats begin in 1999, so these seven use
 * ESPN's official career tables (per-season, per-team) as the stat source —
 * the same feed the batch script already trusts for defensive lines.
 *
 * Stints, identities, and jersey numbers are DECLARED below (checked against
 * Pro-Football-Reference and per-franchise Wikipedia pages by hand) and the
 * script verifies every ESPN season row lands inside a declared stint, and
 * that aggregated career totals match the documented figures.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CACHE = "pipeline/.cache";
const OUT = "pipeline/out";
mkdirSync(OUT, { recursive: true });

const TEAM_MAP = { ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", SL: "LAR", STL: "LAR", LA: "LAR", OAK: "LV", SD: "LAC", WSH: "WAS", WAS: "WAS", TEN: "TEN", HOU: "HOU" };
const franchise = (abbr) => TEAM_MAP[abbr] || abbr;

const PLAYERS = [
  {
    answer: "Kurt Warner", espnId: 1682, mode: "passing",
    hints: { position: "QB", height: "6'2\"", draftYear: "1994", draftPick: "Undrafted", college: "Northern Iowa" },
    careerCheck: { field: "Yds", total: 32344 },
    accolades: [["LAR", 1999, "champion"], ["LAR", 1999, "sb_mvp"]],
    stints: [
      { franchise: "LAR", displayTeam: "St. Louis Rams", from: 1998, to: 2003, jersey: 13 },
      { franchise: "NYG", displayTeam: "New York Giants", from: 2004, to: 2004, jersey: 13 },
      { franchise: "ARI", displayTeam: "Arizona Cardinals", from: 2005, to: 2009, jersey: 13 },
    ],
  },
  {
    answer: "Drew Bledsoe", espnId: 393, mode: "passing",
    hints: { position: "QB", height: "6'5\"", draftYear: "1993", draftPick: "Round 1, #1", college: "Washington State" },
    careerCheck: { field: "Yds", total: 44611 },
    accolades: [["NE", 2001, "champion"]],
    stints: [
      { franchise: "NE", displayTeam: "New England Patriots", from: 1993, to: 2001, jersey: 11 },
      { franchise: "BUF", displayTeam: "Buffalo Bills", from: 2002, to: 2004, jersey: 11 },
      { franchise: "DAL", displayTeam: "Dallas Cowboys", from: 2005, to: 2006, jersey: 11 },
    ],
  },
  {
    answer: "Randall Cunningham", espnId: 8, mode: "passing",
    hints: { position: "QB", height: "6'4\"", draftYear: "1985", draftPick: "Round 2, #37", college: "UNLV" },
    careerCheck: { field: "Yds", total: 29979 },
    accolades: [],
    stints: [
      { franchise: "PHI", displayTeam: "Philadelphia Eagles", from: 1985, to: 1995, jersey: 12 },
      { franchise: "MIN", displayTeam: "Minnesota Vikings", from: 1997, to: 1999, jersey: 7 },
      { franchise: "DAL", displayTeam: "Dallas Cowboys", from: 2000, to: 2000, jersey: 7 },
      { franchise: "BAL", displayTeam: "Baltimore Ravens", from: 2001, to: 2001, jersey: 7 },
    ],
  },
  {
    answer: "Jeff George", espnId: 69, mode: "passing",
    hints: { position: "QB", height: "6'4\"", draftYear: "1990", draftPick: "Round 1, #1", college: "Illinois" },
    careerCheck: { field: "Yds", total: 27602 },
    accolades: [],
    stints: [
      { franchise: "IND", displayTeam: "Indianapolis Colts", from: 1990, to: 1993, jersey: 11 },
      { franchise: "ATL", displayTeam: "Atlanta Falcons", from: 1994, to: 1996, jersey: 3 },
      { franchise: "LV", displayTeam: "Oakland Raiders", from: 1997, to: 1998, jersey: 3 },
      { franchise: "MIN", displayTeam: "Minnesota Vikings", from: 1999, to: 1999, jersey: 7 },
      { franchise: "WAS", displayTeam: "Washington Redskins", from: 2000, to: 2001, jersey: 3 },
    ],
  },
  {
    answer: "Eddie George", espnId: 930, mode: "rushing",
    hints: { position: "RB", height: "6'3\"", draftYear: "1996", draftPick: "Round 1, #14", college: "Ohio State" },
    careerCheck: { field: "Rush Yds", total: 10441 },
    accolades: [["TEN", 1996, "roy"]],
    stints: [
      { franchise: "TEN", displayTeam: "Houston Oilers", from: 1996, to: 1996, jersey: 27 },
      { franchise: "TEN", displayTeam: "Tennessee Oilers", from: 1997, to: 1998, jersey: 27 },
      { franchise: "TEN", displayTeam: "Tennessee Titans", from: 1999, to: 2003, jersey: 27 },
      { franchise: "DAL", displayTeam: "Dallas Cowboys", from: 2004, to: 2004, jersey: 27 },
    ],
  },
  {
    answer: "Jake Plummer", espnId: 1177, mode: "passing",
    hints: { position: "QB", height: "6'2\"", draftYear: "1997", draftPick: "Round 2, #42", college: "Arizona State" },
    careerCheck: { field: "Yds", total: 29253 },
    accolades: [],
    stints: [
      { franchise: "ARI", displayTeam: "Arizona Cardinals", from: 1997, to: 2002, jersey: 16 },
      { franchise: "DEN", displayTeam: "Denver Broncos", from: 2003, to: 2006, jersey: 16 },
    ],
  },
  {
    answer: "Adam Vinatieri", espnId: 1097, mode: "kicking",
    hints: { position: "K", height: "6'0\"", draftYear: "1996", draftPick: "Undrafted", college: "South Dakota State" },
    careerCheck: { field: "Pts", total: 2673 },
    accolades: [["NE", 2001, "champion"], ["NE", 2003, "champion"], ["NE", 2004, "champion"], ["IND", 2006, "champion"]],
    stints: [
      { franchise: "NE", displayTeam: "New England Patriots", from: 1996, to: 2005, jersey: 4 },
      { franchise: "IND", displayTeam: "Indianapolis Colts", from: 2006, to: 2019, jersey: 4 },
    ],
  },
];

async function espnStats(id) {
  const path = `${CACHE}/espn_nfl_player_stats_${id}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const response = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/stats`);
  if (!response.ok) throw new Error(`ESPN ${id}: ${response.status}`);
  const payload = await response.json();
  writeFileSync(path, JSON.stringify(payload));
  return payload;
}

const num = (v) => Number(String(v ?? 0).replace(/,/g, "")) || 0;
const stat = (names, row, key) => num(row.stats[names.indexOf(key)]);
const oneDp = (v) => (Math.round(v * 10) / 10).toFixed(1);

function statLineFor(mode, names, rows) {
  const gp = rows.reduce((s, r) => s + stat(names, r, "gamesPlayed"), 0);
  if (mode === "passing") {
    const cmp = rows.reduce((s, r) => s + stat(names, r, "completions"), 0);
    const att = rows.reduce((s, r) => s + stat(names, r, "passingAttempts"), 0);
    return [
      { label: "GP", value: gp },
      { label: "Cmp%", value: att ? oneDp(cmp / att * 100) : "0.0" },
      { label: "Yds", value: rows.reduce((s, r) => s + stat(names, r, "passingYards"), 0) },
      { label: "TD", value: rows.reduce((s, r) => s + stat(names, r, "passingTouchdowns"), 0) },
      { label: "INT", value: rows.reduce((s, r) => s + stat(names, r, "interceptions"), 0) },
    ];
  }
  if (mode === "rushing") {
    const att = rows.reduce((s, r) => s + stat(names, r, "rushingAttempts"), 0);
    const yds = rows.reduce((s, r) => s + stat(names, r, "rushingYards"), 0);
    return [
      { label: "GP", value: gp },
      { label: "Att", value: att },
      { label: "Rush Yds", value: yds },
      { label: "YPC", value: att ? oneDp(yds / att) : "0.0" },
      { label: "TD", value: rows.reduce((s, r) => s + stat(names, r, "rushingTouchdowns"), 0) },
    ];
  }
  // ESPN reports made-attempts as one "24-30" cell.
  const madeAtt = (row) => String(row.stats[names.indexOf("fieldGoalsMade-fieldGoalAttempts")] ?? "0-0").split("-").map((v) => num(v));
  const fgm = rows.reduce((s, r) => s + madeAtt(r)[0], 0);
  const fga = rows.reduce((s, r) => s + madeAtt(r)[1], 0);
  return [
    { label: "GP", value: gp },
    { label: "FGM", value: fgm },
    { label: "FGA", value: fga },
    { label: "FG%", value: fga ? oneDp(fgm / fga * 100) : "0.0" },
    { label: "Pts", value: rows.reduce((s, r) => s + stat(names, r, "totalKickingPoints"), 0) },
  ];
}

const CATEGORY = { passing: "passing", rushing: "rushing", kicking: "kicking" };
const quote = JSON.stringify;
const accoladeLabels = {
  champion: "Super Bowl champion", pro_bowl: "Pro Bowl", all_pro: "First-Team All-Pro",
  sb_mvp: "Super Bowl MVP", roy: "Rookie of the Year",
};

const puzzles = [];
const config = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : {};
let nextId = config.startId ?? 79;
for (const player of PLAYERS) {
  const payload = await espnStats(player.espnId);
  const category = payload.categories?.find((c) => c.name === CATEGORY[player.mode]);
  if (!category) throw new Error(`${player.answer}: ESPN ${player.mode} category missing`);
  const teamById = new Map(Object.values(payload.teams ?? {}).map((t) => [String(t.id), franchise(t.abbreviation)]));
  const rows = category.statistics
    .filter((r) => r.teamId)
    .map((r) => ({ season: Number(r.season?.year || 0), franchise: teamById.get(String(r.teamId)), stats: r.stats }));

  for (const row of rows) {
    const home = player.stints.find((s) => s.franchise === row.franchise && row.season >= s.from && row.season <= s.to);
    if (!home) throw new Error(`${player.answer}: ESPN row ${row.franchise} ${row.season} outside declared stints`);
  }

  const stints = player.stints.map((s) => {
    const mine = rows.filter((r) => r.franchise === s.franchise && r.season >= s.from && r.season <= s.to);
    if (!mine.length) throw new Error(`${player.answer}: no ESPN rows for ${s.franchise} ${s.from}-${s.to}`);
    const startYear = Math.min(...mine.map((r) => r.season));
    const endYear = Math.max(...mine.map((r) => r.season));
    return {
      franchise: s.franchise, displayTeam: s.displayTeam, startYear, endYear,
      jerseyNumber: s.jersey, statLine: statLineFor(player.mode, category.names, mine),
    };
  });

  const checkLabel = player.careerCheck.field;
  const total = stints.reduce((sum, s) => sum + num(s.statLine.find((c) => c.label === checkLabel)?.value), 0);
  if (Math.abs(total - player.careerCheck.total) > player.careerCheck.total * 0.01) {
    throw new Error(`${player.answer}: career ${checkLabel} ${total} != documented ${player.careerCheck.total}`);
  }

  const accoladeTotals = new Map();
  for (const [team, year, type] of player.accolades) {
    const stint = stints.find((s) => s.franchise === team && year >= s.startYear && year <= s.endYear);
    if (!stint) throw new Error(`${player.answer}: no ${team} stint containing ${year}`);
    stint.accolades ??= [];
    const existing = stint.accolades.find((a) => a.type === type);
    if (existing) existing.count += 1; else stint.accolades.push({ type, count: 1 });
    accoladeTotals.set(type, (accoladeTotals.get(type) ?? 0) + 1);
  }

  const revealOrder = stints.map((_, i) => i).sort((a, b) => num(stints[a].statLine[0].value) - num(stints[b].statLine[0].value) || b - a);
  puzzles.push({
    id: nextId++, answer: player.answer, stints, revealOrder,
    accolades: [...accoladeTotals].map(([type, count]) => `${count}× ${accoladeLabels[type]}`),
    hints: player.hints,
    checked: "ESPN career tables + PFR/Wikipedia stint audit, 2026-08-10",
  });
}

function renderPuzzle(puzzle) {
  const lines = ["  {", `    // ${puzzle.checked}.`, `    id: ${puzzle.id},`, '    pathType: "team",', `    answer: ${quote(puzzle.answer)},`];
  if (puzzle.accolades?.length) lines.push(`    accolades: [${puzzle.accolades.map(quote).join(", ")}],`);
  lines.push("    stints: [");
  for (const stint of puzzle.stints) {
    lines.push("      {", `        franchise: ${quote(stint.franchise)},`, `        displayTeam: ${quote(stint.displayTeam)},`,
      `        startYear: ${stint.startYear},`, `        endYear: ${stint.endYear},`, `        jerseyNumber: ${stint.jerseyNumber},`);
    if (stint.accolades?.length) lines.push(`        accolades: [${stint.accolades.map((a) => `{ type: ${quote(a.type)}, count: ${a.count} }`).join(", ")}],`);
    lines.push("        statLine: [");
    for (const cell of stint.statLine) lines.push(`          { label: ${quote(cell.label)}, value: ${quote(cell.value)} },`);
    lines.push("        ],", "      },");
  }
  lines.push("    ],", `    revealOrder: [${puzzle.revealOrder.join(", ")}],`, "    hints: {");
  for (const [key, value] of Object.entries(puzzle.hints)) lines.push(`      ${key}: ${quote(value)},`);
  lines.push("    },", "  },");
  return lines.join("\n");
}

writeFileSync(`${OUT}/nfl-legacy-2026-08.json`, JSON.stringify({ generatedAt: "2026-08-10", puzzles }, null, 2) + "\n");
writeFileSync(`${OUT}/nfl-legacy-2026-08.tsfrag`, puzzles.map(renderPuzzle).join("\n") + "\n");
console.log(`Wrote ${puzzles.length} legacy NFL puzzles.`);
