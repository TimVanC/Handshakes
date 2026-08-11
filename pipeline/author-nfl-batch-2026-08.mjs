#!/usr/bin/env node
/**
 * Research/authoring helper for the NFL batch beginning 2026-08-08.
 * Sources: nflverse weekly regular-season player stats + weekly rosters,
 * season rosters for bio fields, and nfldata draft_picks.csv.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const config = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : null;

const PLAYERS = config?.players ?? [
  "Pierre Garçon", "Ted Ginn Jr.", "Brandin Cooks", "Donte Moncrief",
  "Jerick McKinnon", "C.J. Anderson", "Emmanuel Sanders", "Delanie Walker",
  "LeGarrette Blount", "Latavius Murray", "Ben Watson", "Golden Tate",
  "Kenny Stills", "Mohamed Sanu", "Eric Decker", "Martellus Bennett",
  "Cordarrelle Patterson", "Jared Cook", "Carlos Hyde", "Kyle Rudolph",
  "Danny Amendola", "Chris Ivory",
];

const SOURCE_NAME = {
  "Pierre Garçon": "Pierre Garcon",
  "Ted Ginn Jr.": "Ted Ginn",
  "Ben Watson": "Benjamin Watson",
  ...(config?.sourceNames ?? {}),
};
const ANSWER_NAME = { "Ben Watson": "Benjamin Watson", ...(config?.answerNames ?? {}) };
const RB = new Set(config?.rushing ?? [
  "Jerick McKinnon", "C.J. Anderson", "LeGarrette Blount", "Latavius Murray",
  "Cordarrelle Patterson", "Carlos Hyde", "Chris Ivory",
]);
const DEF = new Set(config?.defensive ?? []);
const QB = new Set(config?.passing ?? []);
const POSITION = {
  "Cordarrelle Patterson": "RB / WR / KR",
  "Ted Ginn Jr.": "WR / KR",
  ...(config?.positions ?? {}),
};
const TEAM_MAP = { ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", SL: "LAR", STL: "LAR", LA: "LAR", OAK: "LV", SD: "LAC", WSH: "WAS", WAS: "WAS" };
const franchise = (team) => TEAM_MAP[team] || team;

const CACHE = "pipeline/.cache";
const OUT = "pipeline/out";
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function cached(name, url) {
  const path = `${CACHE}/${name}`;
  if (!existsSync(path)) {
    console.error(`fetch ${name}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  return readFileSync(path, "utf8");
}

function csv(text) {
  const lines = text.split("\n").filter(Boolean);
  const head = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line); const row = {};
    head.forEach((key, i) => { row[key] = cells[i] ?? ""; });
    return row;
  });
  function split(line) {
    const cells = []; let value = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === "," && !quoted) { cells.push(value); value = ""; }
      else value += ch;
    }
    cells.push(value.replace(/\r$/, "")); return cells;
  }
}

const targetBySource = new Map(PLAYERS.map((name) => [SOURCE_NAME[name] || name, name]));
const bios = new Map();
const firstSeason = config?.firstSeason ?? 2004;
for (let season = firstSeason; season <= 2025; season++) {
  for (const row of csv(readFileSync(`${CACHE}/roster_${season}.csv`, "utf8"))) {
    const target = targetBySource.get(row.full_name);
    if (!target) continue;
    if (config?.gsisIds?.[target] && row.gsis_id !== config.gsisIds[target]) continue;
    if (!bios.has(target)) bios.set(target, { id: row.gsis_id, rows: [] });
    bios.get(target).rows.push(row);
  }
}
for (const name of PLAYERS) if (!bios.has(name)) throw new Error(`No season-roster identity for ${name}`);

const ids = new Set([...bios.values()].map((bio) => bio.id));
const weeklyStats = [];
const weeklyRosters = [];
const seasonalStats = [];
for (let season = firstSeason; season <= 2025; season++) {
  const [weekStatsText, seasonStatsText] = await Promise.all([
    cached(`stats_player_week_${season}.csv`, `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`),
    cached(`stats_player_reg_${season}.csv`, `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_${season}.csv`),
  ]);
  // nflverse weekly rosters begin in 2002; earlier jersey numbers fall back
  // to the season-roster rows inside representativeNumber.
  let weekRosterText = "";
  try {
    weekRosterText = await cached(`roster_weekly_${season}.csv`, `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`);
  } catch (error) {
    if (season >= 2002) throw error;
  }
  weeklyStats.push(...csv(weekStatsText).filter((row) => ids.has(row.player_id) && row.season_type === "REG"));
  if (weekRosterText) weeklyRosters.push(...csv(weekRosterText).filter((row) => ids.has(row.gsis_id) && (!row.game_type || row.game_type === "REG")));
  seasonalStats.push(...csv(seasonStatsText).filter((row) => ids.has(row.player_id) && row.season_type === "REG"));
}

// ESPN's public career tables include official appearances even when a
// defender recorded no counting stat. nflverse remains the independent
// weekly/season-total check, while ESPN supplies the card's defensive line.
const espnDefense = new Map();
for (const name of PLAYERS.filter((player) => DEF.has(player))) {
  const espnId = config?.espnIds?.[name] ?? bios.get(name).rows.map((row) => row.espn_id).find(Boolean);
  if (!espnId) throw new Error(`${name}: no ESPN identity for defensive stats`);
  const payload = JSON.parse(await cached(
    `espn_nfl_player_stats_${espnId}.json`,
    `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/stats`,
  ));
  const category = payload.categories?.find((item) => item.name === "defensive");
  if (!category) throw new Error(`${name}: ESPN defensive category missing`);
  const teamById = new Map(Object.values(payload.teams ?? {}).map((team) => [String(team.id), franchise(team.abbreviation)]));
  espnDefense.set(name, category.statistics.map((row) => ({
    season: Number(row.season?.year || 0),
    franchise: teamById.get(String(row.teamId)),
    stats: Object.fromEntries(category.names.map((key, index) => [key, row.stats[index]])),
  })));
}

const num = (value) => Number(value || 0);
function verifyPlayerTotals(name, id, rushing, defensive, passing) {
  const weeks = weeklyStats.filter((row) => row.player_id === id);
  const seasons = seasonalStats.filter((row) => row.player_id === id);
  const fields = defensive
    ? ["def_tackles_solo", "def_tackle_assists", "def_sacks", "def_interceptions", "def_fumbles_forced"]
    : passing
      ? ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions"]
      : rushing
        ? ["carries", "rushing_yards", "rushing_tds"]
        : ["receptions", "receiving_yards", "receiving_tds"];
  const weekGames = new Set(weeks.map((row) => row.game_id)).size;
  const seasonGames = seasons.reduce((sum, row) => sum + num(row.games), 0);
  if (weekGames !== seasonGames) throw new Error(`${name}: weekly games ${weekGames} != season total ${seasonGames}`);
  for (const field of fields) {
    const weekTotal = weeks.reduce((sum, row) => sum + num(row[field]), 0);
    const seasonTotal = seasons.reduce((sum, row) => sum + num(row[field]), 0);
    if (weekTotal !== seasonTotal) throw new Error(`${name}: weekly ${field} ${weekTotal} != season total ${seasonTotal}`);
  }
}

function displayTeam(code, year) {
  const names = {
    ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens",
    BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears",
    CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys",
    DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
    HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
    KC: "Kansas City Chiefs", MIA: "Miami Dolphins", MIN: "Minnesota Vikings",
    NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
    NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers",
    SEA: "Seattle Seahawks", SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers",
    TEN: "Tennessee Titans",
  };
  if (code === "LAR") return year <= 2015 ? "St. Louis Rams" : "Los Angeles Rams";
  if (code === "LV") return year <= 2019 ? "Oakland Raiders" : "Las Vegas Raiders";
  if (code === "LAC") return year <= 2016 ? "San Diego Chargers" : "Los Angeles Chargers";
  if (code === "WAS") return year <= 2019 ? "Washington Redskins" : year <= 2021 ? "Washington Football Team" : "Washington Commanders";
  return names[code] || code;
}

const seasonalFallbackRows = [...bios.values()].flatMap((bio) => bio.rows);
function representativeNumber(playerId, code, startYear, endYear) {
  const score = new Map();
  const seen = new Set();
  for (const row of weeklyRosters) {
    if (row.gsis_id !== playerId || franchise(row.team) !== code || num(row.season) < startYear || num(row.season) > endYear) continue;
    if (!/^\d+$/.test(row.jersey_number) || row.jersey_number === "0") continue;
    const key = `${row.season}|${row.week}|${row.jersey_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    score.set(row.jersey_number, (score.get(row.jersey_number) || 0) + 1);
  }
  if (!score.size) {
    // Pre-2002 seasons have no weekly rosters; use the season-roster rows.
    for (const row of seasonalFallbackRows) {
      if (row.gsis_id !== playerId || franchise(row.team) !== code || num(row.season) < startYear || num(row.season) > endYear) continue;
      if (!/^\d+$/.test(row.jersey_number) || row.jersey_number === "0") continue;
      score.set(row.jersey_number, (score.get(row.jersey_number) || 0) + 1);
    }
  }
  if (!score.size) return null;
  return Number([...score].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0][0]);
}

function groupStints(rows) {
  const groups = [];
  for (const row of rows.sort((a, b) => num(a.season) - num(b.season) || num(a.week) - num(b.week))) {
    const code = franchise(row.team), season = num(row.season);
    const identity = displayTeam(code, season);
    const last = groups.at(-1);
    // Bridge a single no-stat season (usually IR) when the player remained
    // with the same franchise, so one continuous tenure stays one card —
    // but split when the franchise identity changes (relocation / rename),
    // because each colorway era carries exactly one identity.
    if (last && last.franchise === code && last.identity === identity && season <= last.endYear + 2) {
      last.endYear = Math.max(last.endYear, season); last.rows.push(row);
    } else groups.push({ franchise: code, identity, startYear: season, endYear: season, rows: [row] });
  }
  return groups;
}

const statValue = (value) => Number.isInteger(value) ? value : Number(value.toFixed(1));
function aggregateDefense(name, code, startYear, endYear) {
  const rows = (espnDefense.get(name) ?? []).filter((row) => row.franchise === code && row.season >= startYear && row.season <= endYear);
  if (!rows.length) throw new Error(`${name}: no ESPN defense rows for ${code} ${startYear}-${endYear}`);
  const total = (field) => statValue(rows.reduce((sum, row) => sum + num(row.stats[field]), 0));
  return [
    { label: "GP", value: total("gamesPlayed") },
    { label: "Tkl", value: total("totalTackles") },
    { label: "Sacks", value: total("sacks") },
    { label: "INT", value: total("interceptions") },
    { label: "FF", value: total("fumblesForced") },
  ];
}
function aggregate(rows, rushing, defensive, passing) {
  const games = new Set(rows.map((row) => row.game_id || `${row.season}-${row.week}-${row.team}`)).size;
  if (defensive) throw new Error("defensive aggregation requires the ESPN stint identity");
  if (passing) {
    const completions = rows.reduce((sum, row) => sum + num(row.completions), 0);
    const attempts = rows.reduce((sum, row) => sum + num(row.attempts), 0);
    return [
      { label: "GP", value: games },
      { label: "Cmp%", value: attempts ? (completions / attempts * 100).toFixed(1) : "0.0" },
      { label: "Yds", value: rows.reduce((sum, row) => sum + num(row.passing_yards), 0) },
      { label: "TD", value: rows.reduce((sum, row) => sum + num(row.passing_tds), 0) },
      { label: "INT", value: rows.reduce((sum, row) => sum + num(row.passing_interceptions), 0) },
    ];
  }
  if (rushing) {
    const att = rows.reduce((sum, row) => sum + num(row.carries), 0);
    const yards = rows.reduce((sum, row) => sum + num(row.rushing_yards), 0);
    return [
      { label: "GP", value: games }, { label: "Att", value: att },
      { label: "Rush Yds", value: yards },
      { label: "YPC", value: att ? (yards / att).toFixed(1) : "0.0" },
      { label: "TD", value: rows.reduce((sum, row) => sum + num(row.rushing_tds), 0) },
    ];
  }
  const receptions = rows.reduce((sum, row) => sum + num(row.receptions), 0);
  const yards = rows.reduce((sum, row) => sum + num(row.receiving_yards), 0);
  return [
    { label: "GP", value: games }, { label: "Rec", value: receptions },
    { label: "Rec Yds", value: yards },
    { label: "Y/R", value: receptions ? (yards / receptions).toFixed(1) : "0.0" },
    { label: "TD", value: rows.reduce((sum, row) => sum + num(row.receiving_tds), 0) },
  ];
}

const draftRows = csv(readFileSync(`${CACHE}/draft_picks.csv`, "utf8"));
const feet = (inches) => `${Math.floor(num(inches) / 12)}'${num(inches) % 12}\"`;
const quote = JSON.stringify;

function renderPuzzle(puzzle) {
  const lines = ["  {", `    // nflverse weekly stats + weekly rosters verified (${puzzle.checked}).`,
    `    id: ${puzzle.id},`, '    pathType: "team",', `    answer: ${quote(puzzle.answer)},`];
  if (puzzle.accolades?.length) lines.push(`    accolades: [${puzzle.accolades.map(quote).join(", ")}],`);
  lines.push("    stints: [");
  for (const stint of puzzle.stints) {
    lines.push("      {", `        franchise: ${quote(stint.franchise)},`, `        displayTeam: ${quote(stint.displayTeam)},`,
      `        startYear: ${stint.startYear},`, `        endYear: ${stint.endYear},`, `        jerseyNumber: ${stint.jerseyNumber ?? "null"},`);
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

const puzzles = [], audits = [];
let nextId = config?.startId ?? 21;
for (const name of PLAYERS) {
  const bio = bios.get(name), lastBio = bio.rows.at(-1), rushing = RB.has(name), defensive = DEF.has(name), passing = QB.has(name);
  const bioOverride = config?.bios?.[name] ?? {};
  verifyPlayerTotals(name, bio.id, rushing, defensive, passing);
  const rows = weeklyStats.filter((row) => row.player_id === bio.id);
  const stints = groupStints(rows).map((group) => ({
    franchise: group.franchise, displayTeam: displayTeam(group.franchise, group.startYear),
    startYear: group.startYear, endYear: group.endYear,
    jerseyNumber: representativeNumber(bio.id, group.franchise, group.startYear, group.endYear),
    statLine: defensive
      ? aggregateDefense(name, group.franchise, group.startYear, group.endYear)
      : aggregate(group.rows, rushing, false, passing),
  }));
  for (const stint of stints) {
    const override = config?.stintOverrides?.[`${name}|${stint.franchise}`];
    if (!override) continue;
    if (override.startYear != null) stint.startYear = override.startYear;
    if (override.endYear != null) stint.endYear = override.endYear;
    if (override.gpDelta) stint.statLine[0].value = num(stint.statLine[0].value) + override.gpDelta;
  }
  if (stints.some((stint) => stint.jerseyNumber == null)) throw new Error(`${name}: missing jersey in ${JSON.stringify(stints)}`);
  const draft = draftRows.find((row) => row.pfr_id && row.pfr_id === lastBio.pfr_id);
  const draftYear = num(lastBio.entry_year || lastBio.rookie_year);
  const revealOrder = stints.map((_, i) => i).sort((a, b) => num(stints[a].statLine[0].value) - num(stints[b].statLine[0].value) || b - a);
  const puzzle = {
    id: nextId++, answer: ANSWER_NAME[name] || name, checked: new Date().toISOString().slice(0, 10), stints, revealOrder,
    hints: {
      position: POSITION[name] || lastBio.position,
      height: feet(lastBio.height), draftYear: String(draftYear),
      draftPick: bioOverride.draftPick ?? (draft ? `Round ${draft.round}, #${draft.pick}` : "Undrafted"),
      college: bioOverride.college ?? lastBio.college,
    },
  };
  puzzle.hints.draftYear = String(bioOverride.draftYear ?? draftYear);
  const accoladeLabels = {
    champion: "Super Bowl champion", pro_bowl: "Pro Bowl", all_pro: "First-Team All-Pro",
    sb_mvp: "Super Bowl MVP", opoy: "Offensive Player of the Year", comeback: "Comeback Player of the Year",
    roy: "Rookie of the Year", droy: "Defensive Rookie of the Year",
    rushing_title: "rushing champion", receiving_title: "receiving champion",
  };
  const accoladeTotals = new Map();
  for (const [team, awardYear, type] of config?.accolades?.[name] ?? []) {
    const stint = puzzle.stints.find((candidate) => candidate.franchise === team && awardYear >= candidate.startYear && awardYear <= candidate.endYear);
    if (!stint) throw new Error(`${name}: no ${team} stint containing ${awardYear} for ${type}`);
    stint.accolades ??= [];
    const existing = stint.accolades.find((award) => award.type === type);
    if (existing) existing.count += 1; else stint.accolades.push({ type, count: 1 });
    accoladeTotals.set(type, (accoladeTotals.get(type) ?? 0) + 1);
  }
  puzzle.accolades = [...accoladeTotals].map(([type, count]) => `${count}× ${accoladeLabels[type]}`);
  puzzles.push(puzzle);
  audits.push({ requestedName: name, sourceName: SOURCE_NAME[name] || name, gsisId: bio.id,
    statsSource: "https://github.com/nflverse/nflverse-data/releases/tag/stats_player",
    defensiveStatsSource: defensive ? `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${config?.espnIds?.[name] ?? lastBio.espn_id}/stats` : undefined,
    rosterSource: "https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters",
    stints: stints.map(({ statLine, ...stint }) => stint),
  });
}

const outputBase = config?.outputBase ?? "nfl-batch-2026-08";
writeFileSync(`${OUT}/${outputBase}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), audits, puzzles }, null, 2) + "\n");
writeFileSync(`${OUT}/${outputBase}.tsfrag`, puzzles.map(renderPuzzle).join("\n") + "\n");
console.error(`Wrote ${puzzles.length} NFL puzzles in randomized release order.`);
