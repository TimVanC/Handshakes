#!/usr/bin/env node
/**
 * Reproducible research helper for the 2026-08-12 MLB authoring batch.
 *
 * Primary source: MLB Stats API people, yearByYear regular-season stats,
 * and historical rosterEntries. The output is review material only; it does
 * not modify src/data/mlb/puzzles.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const config = process.argv[2]
  ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : null;

const PLAYERS = config?.players ?? [
  "Steve Pearce", "Coco Crisp", "Fernando Rodney", "Rajai Davis",
  "Arthur Rhodes", "Matt Stairs", "Kevin Pillar", "Bartolo Colón",
  "José Iglesias", "Juan Pierre", "Tommy Pham", "Bronson Arroyo",
  "Tyler Clippard", "Marlon Byrd", "Jesse Chavez", "Mark Reynolds",
  "Jonny Gomes", "Jeff Francoeur", "Cameron Maybin", "Eduardo Escobar",
  "Pat Neshek", "Sergio Romo",
];

const TEAM = {
  108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
  113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
  118: "KC", 119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
  134: "PIT", 135: "SD", 136: "SEA", 137: "SF", 138: "STL",
  139: "TB", 140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
  144: "ATL", 145: "CHW", 146: "MIA", 147: "NYY", 158: "MIL",
};

const POSITION = {
  "Steve Pearce": "1B / OF", "Coco Crisp": "CF / LF",
  "Fernando Rodney": "RHP", "Rajai Davis": "CF",
  "Arthur Rhodes": "LHP", "Matt Stairs": "OF / 1B",
  "Kevin Pillar": "CF", "Bartolo Colón": "RHP", "José Iglesias": "SS",
  "Juan Pierre": "CF / LF", "Tommy Pham": "OF", "Bronson Arroyo": "RHP",
  "Tyler Clippard": "RHP", "Marlon Byrd": "OF", "Jesse Chavez": "RHP",
  "Mark Reynolds": "1B / 3B", "Jonny Gomes": "OF",
  "Jeff Francoeur": "RF", "Cameron Maybin": "CF",
  "Eduardo Escobar": "3B / SS", "Pat Neshek": "RHP", "Sergio Romo": "RHP",
  ...(config?.positions ?? {}),
};

// MLB's electronic historical roster coverage is sparse before ~2000.
// These two values are cross-checked against Baseball Almanac's player-year
// uniform table and Baseball-Reference's season uniform index. Stairs wore
// #3 (1992) and #25 (1993) in Montreal; #3 represents the longer season.
const JERSEY_OVERRIDE = {
  "Matt Stairs|120|1992|1993": 3,
  "Matt Stairs|111|1995|1995": 35,
  ...(config?.jerseyOverrides ?? {}),
};

const STATE = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const get = async (path) => {
  const response = await fetch(`https://statsapi.mlb.com${path}`);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
};
const year = (date) => Number(String(date).slice(0, 4));
const innings = (outs) => outs / 3;
const fmt3 = (n) => n.toFixed(3).replace(/^0/, "");
const quote = (value) => JSON.stringify(value);
const AWARD_MATCH = {
  all_star: /(?:AL|NL) All-Star$/,
  champion: /^World Series Championship$/,
  roy: /Jackie Robinson .* Rookie of the Year$/,
  ws_mvp: /World Series MVP$/,
  gold_glove: /Gold Glove$/,
  silver_slugger: /Silver Slugger$/,
};

function aggregate(rows, pitcher) {
  if (pitcher) {
    const games = rows.reduce((n, r) => n + Number(r.stat.gamesPlayed || 0), 0);
    const wins = rows.reduce((n, r) => n + Number(r.stat.wins || 0), 0);
    const losses = rows.reduce((n, r) => n + Number(r.stat.losses || 0), 0);
    const outs = rows.reduce((n, r) => n + Number(r.stat.outs || 0), 0);
    const earned = rows.reduce((n, r) => n + Number(r.stat.earnedRuns || 0), 0);
    const hits = rows.reduce((n, r) => n + Number(r.stat.hits || 0), 0);
    const walks = rows.reduce((n, r) => n + Number(r.stat.baseOnBalls || 0), 0);
    const strikeouts = rows.reduce((n, r) => n + Number(r.stat.strikeOuts || 0), 0);
    return [
      { label: "G", value: games }, { label: "W-L", value: `${wins}-${losses}` },
      { label: "ERA", value: (earned * 9 / innings(outs)).toFixed(2) },
      { label: "SO", value: strikeouts },
      { label: "WHIP", value: ((hits + walks) / innings(outs)).toFixed(2) },
    ];
  }
  const games = rows.reduce((n, r) => n + Number(r.stat.gamesPlayed || 0), 0);
  const atBats = rows.reduce((n, r) => n + Number(r.stat.atBats || 0), 0);
  const hits = rows.reduce((n, r) => n + Number(r.stat.hits || 0), 0);
  return [
    { label: "G", value: games }, { label: "AVG", value: fmt3(hits / atBats) },
    { label: "HR", value: rows.reduce((n, r) => n + Number(r.stat.homeRuns || 0), 0) },
    { label: "RBI", value: rows.reduce((n, r) => n + Number(r.stat.rbi || 0), 0) },
    { label: "SB", value: rows.reduce((n, r) => n + Number(r.stat.stolenBases || 0), 0) },
  ];
}

const rosterCache = new Map();
async function fullSeasonRoster(teamId, season) {
  const key = `${teamId}-${season}`;
  if (!rosterCache.has(key)) {
    rosterCache.set(key, get(`/api/v1/teams/${teamId}/roster?season=${season}&rosterType=fullSeason`).catch(() => ({ roster: [] })));
  }
  return rosterCache.get(key);
}

async function representativeNumber(entries, playerId, teamId, startYear, endYear) {
  // Prefer year-specific full-season rosters. This catches mid-career returns
  // and number changes that a single transaction-span rosterEntry can hide.
  const seasonal = await Promise.all(Array.from({ length: endYear - startYear + 1 }, async (_, offset) => {
    const roster = await fullSeasonRoster(teamId, startYear + offset);
    return roster.roster?.find((entry) => entry.person?.id === playerId)?.jerseyNumber || null;
  }));
  const seasonalScore = new Map();
  for (const number of seasonal.filter(Boolean)) seasonalScore.set(number, (seasonalScore.get(number) || 0) + 1);
  if (seasonalScore.size) return Number([...seasonalScore].sort((a, b) => b[1] - a[1])[0][0]);

  // Older full-season rosters are sparse. Fall back to MLB's historical
  // roster transaction spans, weighted by the time each number was assigned.
  const candidates = entries.filter((entry) => entry.team?.id === teamId && entry.jerseyNumber &&
    year(entry.startDate) <= endYear && year(entry.endDate || entry.startDate) >= startYear);
  if (!candidates.length) return null;
  const score = new Map();
  for (const entry of candidates) {
    const start = Math.max(Date.parse(entry.startDate), Date.parse(`${startYear}-01-01`));
    const end = Math.min(Date.parse(entry.endDate || entry.startDate), Date.parse(`${endYear}-12-31`));
    score.set(entry.jerseyNumber, (score.get(entry.jerseyNumber) || 0) + Math.max(1, end - start));
  }
  return Number([...score].sort((a, b) => b[1] - a[1])[0][0]);
}

function groupStints(rows) {
  const groups = [];
  for (const row of rows) {
    const season = Number(row.season);
    const last = groups.at(-1);
    if (last && last.teamId === row.team.id && last.displayTeam === row.team.name && season <= last.endYear + 1) {
      last.rows.push(row);
      last.endYear = Math.max(last.endYear, season);
    } else {
      groups.push({ teamId: row.team.id, displayTeam: row.team.name, startYear: season, endYear: season, rows: [row] });
    }
  }
  return groups;
}

function verifyCareerTotals(name, rows, career, pitcher) {
  const fields = pitcher
    ? ["gamesPlayed", "wins", "losses", "outs", "earnedRuns", "hits", "baseOnBalls", "strikeOuts"]
    : ["gamesPlayed", "atBats", "hits", "homeRuns", "rbi", "stolenBases"];
  for (const field of fields) {
    const fromTeams = rows.reduce((sum, row) => sum + Number(row.stat[field] || 0), 0);
    const officialCareer = Number(career[field] || 0);
    if (fromTeams !== officialCareer) {
      throw new Error(`${name}: team-row ${field} total ${fromTeams} != official career total ${officialCareer}`);
    }
  }
}

function renderPuzzle(puzzle) {
  const lines = [];
  lines.push("  {");
  lines.push(`    // MLB Stats API verified: people + yearByYear + rosterEntries (${puzzle.sourceChecked}).`);
  lines.push(`    id: ${puzzle.id},`);
  lines.push('    pathType: "team",');
  lines.push(`    answer: ${quote(puzzle.answer)},`);
  if (puzzle.accolades?.length) lines.push(`    accolades: [${puzzle.accolades.map(quote).join(", ")}],`);
  lines.push("    stints: [");
  for (const stint of puzzle.stints) {
    lines.push("      {");
    lines.push(`        franchise: ${quote(stint.franchise)},`);
    lines.push(`        displayTeam: ${quote(stint.displayTeam)},`);
    lines.push(`        startYear: ${stint.startYear},`);
    lines.push(`        endYear: ${stint.endYear},`);
    lines.push(`        jerseyNumber: ${stint.jerseyNumber ?? "null"},`);
    if (stint.accolades?.length) {
      lines.push(`        accolades: [${stint.accolades.map((a) => `{ type: ${quote(a.type)}, count: ${a.count} }`).join(", ")}],`);
    }
    lines.push("        statLine: [");
    for (const cell of stint.statLine) lines.push(`          { label: ${quote(cell.label)}, value: ${quote(cell.value)} },`);
    lines.push("        ],", "      },");
  }
  lines.push("    ],");
  lines.push(`    revealOrder: [${puzzle.revealOrder.join(", ")}],`);
  lines.push("    hints: {");
  for (const [key, value] of Object.entries(puzzle.hints)) lines.push(`      ${key}: ${quote(value)},`);
  lines.push("    },", "  },");
  return lines.join("\n");
}

const puzzles = [];
const audits = [];
let nextId = config?.startId ?? 26;
for (const requestedName of PLAYERS) {
  const search = await get(`/api/v1/people/search?names=${encodeURIComponent(requestedName)}`);
  const personStub = search.people.find((p) => p.fullName.normalize("NFD").replace(/\p{Diacritic}/gu, "") === requestedName.normalize("NFD").replace(/\p{Diacritic}/gu, "")) || search.people[0];
  if (!personStub) throw new Error(`No MLB identity match for ${requestedName}`);
  const detail = (await get(`/api/v1/people/${personStub.id}?hydrate=rosterEntries`)).people[0];
  const configuredAwards = config?.accolades?.[requestedName] ?? [];
  if (configuredAwards.length) {
    const officialAwards = (await get(`/api/v1/people/${detail.id}/awards`)).awards ?? [];
    for (const [, awardYear, type] of configuredAwards) {
      if (!officialAwards.some((award) => Number(award.season) === awardYear && AWARD_MATCH[type]?.test(award.name))) {
        throw new Error(`${requestedName}: configured ${type} in ${awardYear} is absent from official MLB awards`);
      }
    }
  }
  const pitcher = detail.primaryPosition?.type === "Pitcher";
  const stats = await get(`/api/v1/people/${personStub.id}/stats?stats=yearByYear&group=${pitcher ? "pitching" : "hitting"}`);
  const rows = stats.stats[0].splits.filter((r) => r.team && r.sport?.id === 1 && TEAM[r.team.id]);
  const careerResponse = await get(`/api/v1/people/${personStub.id}/stats?stats=career&group=${pitcher ? "pitching" : "hitting"}`);
  verifyCareerTotals(requestedName, rows, careerResponse.stats[0].splits[0].stat, pitcher);
  const groups = groupStints(rows);
  const stints = await Promise.all(groups.map(async (group) => ({
    franchise: TEAM[group.teamId], displayTeam: group.displayTeam,
    startYear: group.startYear, endYear: group.endYear,
    jerseyNumber: JERSEY_OVERRIDE[`${requestedName}|${group.teamId}|${group.startYear}|${group.endYear}`]
      ?? await representativeNumber(detail.rosterEntries || [], detail.id, group.teamId, group.startYear, group.endYear),
    statLine: aggregate(group.rows, pitcher),
  })));
  const revealOrder = stints.map((_, i) => i).sort((a, b) => {
    const ga = Number(stints[a].statLine[0].value), gb = Number(stints[b].statLine[0].value);
    return ga - gb || b - a;
  });
  const birthRegion = detail.birthCountry === "USA"
    ? [detail.birthCity, STATE[detail.birthStateProvince] || detail.birthStateProvince].filter(Boolean).join(", ")
    : [detail.birthCity, detail.birthCountry].filter(Boolean).join(", ");
  const puzzle = {
    // Bartolo already owned stable id 18 on the bench; preserve it while
    // moving his freshly verified record into the active random-order batch.
    id: !config && requestedName === "Bartolo Colón" ? 18 : nextId++, answer: requestedName, stints, revealOrder,
    sourceChecked: new Date().toISOString().slice(0, 10),
    hints: {
      position: POSITION[requestedName],
      batsThrows: `${detail.batSide.code} / ${detail.pitchHand.code}`,
      height: detail.height.replace("' ", "'"),
      debutYear: String(year(detail.mlbDebutDate)), born: birthRegion,
    },
  };
  const accoladeLabels = {
    all_star: "All-Star", champion: "World Series champion", roy: "Rookie of the Year",
    ws_mvp: "World Series MVP", gold_glove: "Gold Glove", silver_slugger: "Silver Slugger",
  };
  const accoladeTotals = new Map();
  for (const [franchise, awardYear, type] of config?.accolades?.[requestedName] ?? []) {
    const stint = puzzle.stints.find((candidate) => candidate.franchise === franchise &&
      awardYear >= candidate.startYear && awardYear <= candidate.endYear);
    if (!stint) throw new Error(`${requestedName}: no ${franchise} stint containing ${awardYear} for ${type}`);
    stint.accolades ??= [];
    const existing = stint.accolades.find((award) => award.type === type);
    if (existing) existing.count += 1;
    else stint.accolades.push({ type, count: 1 });
    accoladeTotals.set(type, (accoladeTotals.get(type) ?? 0) + 1);
  }
  puzzle.accolades = [...accoladeTotals].map(([type, count]) => `${count}× ${accoladeLabels[type]}`);
  puzzles.push(puzzle);
  audits.push({ requestedName, mlbamId: detail.id, officialName: detail.fullName,
    sourceUrls: {
      bioAndRoster: `https://statsapi.mlb.com/api/v1/people/${detail.id}?hydrate=rosterEntries`,
      stats: `https://statsapi.mlb.com/api/v1/people/${detail.id}/stats?stats=yearByYear&group=${pitcher ? "pitching" : "hitting"}`,
      careerTotals: `https://statsapi.mlb.com/api/v1/people/${detail.id}/stats?stats=career&group=${pitcher ? "pitching" : "hitting"}`,
      awards: `https://statsapi.mlb.com/api/v1/people/${detail.id}/awards`,
    },
    stints: stints.map((s) => ({ ...s, statLine: undefined })),
  });
}

mkdirSync("pipeline/out", { recursive: true });
const outputBase = config?.outputBase ?? "mlb-batch-2026-08";
writeFileSync(`pipeline/out/${outputBase}.json`, JSON.stringify({ generatedAt: new Date().toISOString(), audits, puzzles }, null, 2) + "\n");
writeFileSync(`pipeline/out/${outputBase}.tsfrag`, puzzles.map(renderPuzzle).join("\n") + "\n");
console.error(`Wrote ${puzzles.length} verified puzzles in the requested randomized schedule order.`);
