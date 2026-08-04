#!/usr/bin/env node
/**
 * Reproducible authoring audit for the 2026-08 NBA batch.
 *
 * Basketball-Reference player pages are the repository's established NBA
 * source (docs/data-sources.md): season/team per-game tables provide stats,
 * the page's uniform-history block provides team/year jersey numbers, and
 * the bio block provides position, height, college, and draft information.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const CACHE = "pipeline/.cache/nba-br";
const ESPN_CACHE = "pipeline/.cache/nba-espn";
const OUT = "pipeline/out";
const DEFAULT_PLAYERS = [
  ["Mike Muscala", "muscami01"],
  ["Reggie Evans", "evansre01"],
  ["Wayne Ellington", "ellinwa01"],
  ["Robin Lopez", "lopezro01"],
  ["Omri Casspi", "casspom01"],
  ["Austin Rivers", "riverau01"],
  ["Anthony Tolliver", "tollian01"],
  ["Delon Wright", "wrighde01"],
  ["Channing Frye", "fryech01"],
  ["James Johnson", "johnsja01"],
];
const configPath = process.argv[2];
const config = configPath ? JSON.parse(await readFile(configPath, "utf8")) : {};
const PLAYERS = config.players?.map((player) => [player.answer, player.brId]) ?? DEFAULT_PLAYERS;
const START_ID = config.startId ?? 34;
const OUTPUT_BASE = config.outputBase ?? "nba-batch-2026-08";
const CONFIG_BY_NAME = Object.fromEntries((config.players ?? []).map((player) => [player.answer, player]));

const FRANCHISE = {
  ATL: "ATL", BOS: "BOS", BRK: "BKN", NJN: "BKN", CHA: "CHA", CHO: "CHA",
  CHI: "CHI", CLE: "CLE", DAL: "DAL", DEN: "DEN", DET: "DET", GSW: "GSW",
  HOU: "HOU", IND: "IND", LAC: "LAC", LAL: "LAL", MEM: "MEM", VAN: "MEM",
  MIA: "MIA", MIL: "MIL", MIN: "MIN", NOH: "NOP", NOK: "NOP", NOP: "NOP",
  NYK: "NYK", OKC: "OKC", SEA: "OKC", ORL: "ORL", PHI: "PHI", PHO: "PHX",
  POR: "POR", SAC: "SAC", SAS: "SAS", TOR: "TOR", UTA: "UTA", WAS: "WAS", WSB: "WAS",
};

const TEAM_NAMES = {
  BKN: "Brooklyn Nets", PHX: "Phoenix Suns",
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BRK: "Brooklyn Nets", NJN: "New Jersey Nets",
  CHA: "Charlotte Bobcats", CHO: "Charlotte Hornets", CHI: "Chicago Bulls", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons", GSW: "Golden State Warriors",
  HOU: "Houston Rockets", IND: "Indiana Pacers", LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies", VAN: "Vancouver Grizzlies", MIA: "Miami Heat", MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves", NOH: "New Orleans Hornets", NOK: "New Orleans/Oklahoma City Hornets",
  NOP: "New Orleans Pelicans", NYK: "New York Knicks", OKC: "Oklahoma City Thunder",
  SEA: "Seattle SuperSonics", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHO: "Phoenix Suns",
  POR: "Portland Trail Blazers", SAC: "Sacramento Kings", SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards", WSB: "Washington Bullets",
};

const TEAM_NAME_TO_ABBR = Object.fromEntries(Object.entries(TEAM_NAMES).map(([abbr, name]) => [name, abbr]));
const HINT_OVERRIDES = {
  "Mike Muscala": { position: "C/PF", height: "6'11\"", draftYear: "2013", draftPick: "Round 2, #44", college: "Bucknell" },
  "Reggie Evans": { position: "PF", height: "6'8\"", draftYear: "2002", draftPick: "Undrafted", college: "Iowa" },
  "Wayne Ellington": { position: "SG", height: "6'4\"", draftYear: "2009", draftPick: "Round 1, #28", college: "North Carolina" },
  "Robin Lopez": { position: "C", height: "7'1\"", draftYear: "2008", draftPick: "Round 1, #15", college: "Stanford" },
  "Omri Casspi": { position: "SF/PF", height: "6'9\"", draftYear: "2009", draftPick: "Round 1, #23", college: "Maccabi Tel Aviv (Israel)" },
  "Austin Rivers": { position: "SG/PG", height: "6'4\"", draftYear: "2012", draftPick: "Round 1, #10", college: "Duke" },
  "Anthony Tolliver": { position: "PF", height: "6'8\"", draftYear: "2007", draftPick: "Undrafted", college: "Creighton" },
  "Delon Wright": { position: "PG/SG", height: "6'5\"", draftYear: "2015", draftPick: "Round 1, #20", college: "Utah" },
  "Channing Frye": { position: "C/PF", height: "7'0\"", draftYear: "2005", draftPick: "Round 1, #8", college: "Arizona" },
  "James Johnson": { position: "PF", height: "6'7\"", draftYear: "2009", draftPick: "Round 1, #16", college: "Wake Forest" },
};

const htmlText = (value) => value
  .replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;|&#xA0;/g, " ").trim();

async function page(id) {
  await mkdir(CACHE, { recursive: true });
  const path = `${CACHE}/${id}.html`;
  try { return await readFile(path, "utf8"); } catch {}
  const url = `https://www.basketball-reference.com/players/${id[0]}/${id}.html`;
  const response = await fetch(url, { headers: { "user-agent": "journeyman-data-audit/1.0" } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const body = await response.text();
  await writeFile(path, body);
  await new Promise((resolve) => setTimeout(resolve, 900));
  return body;
}

function cells(row) {
  const values = {};
  for (const match of row.matchAll(/<(?:th|td)\b[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(?:th|td)>/g)) {
    values[match[1]] = htmlText(match[2]);
  }
  return values;
}

function seasonRows(html) {
  const table = html.match(/<table\b[^>]*id="per_game_stats"[^>]*>([\s\S]*?)<\/table>/)?.[1];
  if (!table) throw new Error("per_game_stats table missing");
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((match) => cells(match[1]))
    .filter((row) => /^\d{4}-\d{2}$/.test(row.year_id || "") && FRANCHISE[row.team_name_abbr] && Number(row.games) > 0)
    .map((row) => ({
      abbr: row.team_name_abbr,
      franchise: FRANCHISE[row.team_name_abbr],
      year: Number(row.year_id.slice(0, 4)),
      gp: Number(row.games), mpg: Number(row.mp_per_g), ppg: Number(row.pts_per_g),
      rpg: Number(row.trb_per_g), apg: Number(row.ast_per_g),
    }));
}

function uniforms(html) {
  const block = html.slice(html.indexOf('class="uni_holder'));
  return [...block.matchAll(/href="\/friv\/numbers\.cgi\?number=(\d+)"[^>]*data-tip="([^"]+), (\d{4})(?:-(\d{4}))?"/g)]
    .map((match) => {
      const abbr = TEAM_NAME_TO_ABBR[match[2]];
      return { number: Number(match[1]), franchise: FRANCHISE[abbr], start: Number(match[3]) - 1, end: Number(match[4] || match[3]) - 1 };
    })
    .filter((row) => row.franchise);
}

function jerseyFor(row, uniformRows) {
  const candidates = uniformRows.filter((uniform) => uniform.franchise === row.franchise && row.year >= uniform.start && row.year <= uniform.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));
  if (!candidates.length) throw new Error(`missing jersey: ${row.franchise} ${row.year}`);
  return candidates[0].number;
}

function groupRows(rows, uniformRows) {
  const groups = [];
  for (const row of rows) {
    if (!row.franchise) throw new Error(`unmapped team: ${row.abbr}`);
    row.jerseyNumber = jerseyFor(row, uniformRows);
    const displayTeam = row.displayTeam ?? TEAM_NAMES[row.abbr];
    const last = groups.at(-1);
    if (last && last.franchise === row.franchise && last.displayTeam === displayTeam && last.jerseyNumber === row.jerseyNumber && row.year <= last.endYear + 1) {
      last.rows.push(row); last.endYear = Math.max(last.endYear, row.year);
    } else {
      groups.push({ franchise: row.franchise, displayTeam, startYear: row.year, endYear: row.year, jerseyNumber: row.jerseyNumber, rows: [row] });
    }
  }
  return groups;
}

const ESPN_TEAM = { WSH: "WAS", WAS: "WAS", UTAH: "UTA", SA: "SAS", GS: "GSW", SEA: "OKC", NJ: "BKN", BRK: "BKN", NY: "NYK", NO: "NOP", NOH: "NOP", CHA: "CHA", PHO: "PHX" };
function historicalTeam(franchise, year) {
  if (franchise === "OKC" && year <= 2007) return "Seattle SuperSonics";
  if (franchise === "NOP" && year <= 2012) return "New Orleans Hornets";
  if (franchise === "BKN" && year <= 2011) return "New Jersey Nets";
  if (franchise === "CHA" && year <= 2013) return "Charlotte Bobcats";
  return TEAM_NAMES[franchise];
}
async function espnRows(id) {
  await mkdir(ESPN_CACHE, { recursive: true });
  const path = `${ESPN_CACHE}/${id}.json`;
  let payload;
  try { payload = JSON.parse(await readFile(path, "utf8")); }
  catch {
    const response = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/stats`);
    if (!response.ok) throw new Error(`ESPN NBA ${id}: ${response.status}`);
    payload = await response.json();
    await writeFile(path, JSON.stringify(payload));
  }
  const teams = new Map(Object.values(payload.teams ?? {}).map((team) => [String(team.id), ESPN_TEAM[team.abbreviation] ?? team.abbreviation]));
  const category = payload.categories?.find((item) => item.name === "averages");
  if (!category) throw new Error(`ESPN NBA ${id}: averages missing`);
  return category.statistics.filter((row) => row.teamId).map((row) => {
    const franchise = teams.get(String(row.teamId));
    const year = Number(row.season.year) - 1;
    if (!franchise) throw new Error(`ESPN NBA ${id}: unmapped team ${row.teamId}`);
    return { abbr: franchise, franchise, displayTeam: historicalTeam(franchise, year), year,
      gp: Number(row.stats[0]), mpg: Number(row.stats[2]), ppg: Number(row.stats[17]), rpg: Number(row.stats[11]), apg: Number(row.stats[12]) };
  });
}

function oneDecimal(value) { return Math.round(value * 10) / 10; }
function finishGroup(group) {
  const gp = group.rows.reduce((sum, row) => sum + row.gp, 0);
  const weighted = (field) => oneDecimal(group.rows.reduce((sum, row) => sum + row[field] * row.gp, 0) / gp);
  return { ...group, rows: undefined, gp, mpg: weighted("mpg"), ppg: weighted("ppg"), rpg: weighted("rpg"), apg: weighted("apg") };
}

const POSITION = { "Point Guard": "PG", "Shooting Guard": "SG", "Small Forward": "SF", "Power Forward": "PF", "Center": "C" };
function bioHints(html) {
  const bio = html.slice(html.indexOf('<div id="meta"'), html.indexOf('<div id="photo"') > 0 ? html.indexOf('<div id="photo"') : html.indexOf('<div id="content"'));
  const plain = htmlText(bio).replace(/\s+/g, " ");
  const positionText = htmlText(bio.match(/Position:\s*<\/strong>([\s\S]*?)<strong>\s*Shoots:/)?.[1] ?? "").replace(/&#9642;/g, "").trim();
  const position = Object.entries(POSITION).filter(([name]) => positionText.includes(name)).map(([, abbreviation]) => abbreviation).join("/");
  const heightRaw = bio.match(/<p>\s*<span>(\d+)-(\d+)<\/span>/)?.slice(1);
  const college = plain.match(/Colleges?:\s*(.*?)\s*(?:High Schools?:|Draft:|NBA Debut:)/)?.[1]?.trim();
  const draft = plain.match(/Draft:\s*(.*?)\s*(?:NBA Debut:|Experience:)/)?.[1]?.trim();
  const overall = draft?.match(/(\d+)(?:st|nd|rd|th) overall/);
  const round = draft?.match(/(\d+)(?:st|nd|rd|th) round/);
  const draftYear = draft?.match(/(\d{4}) NBA Draft/)?.[1] ?? "Undrafted";
  return {
    position,
    height: heightRaw ? `${heightRaw[0]}'${heightRaw[1]}\"` : "",
    draftYear,
    draftPick: draftYear === "Undrafted" ? "Undrafted" : `Round ${round?.[1] ?? "?"}, #${overall?.[1] ?? "?"}`,
    college: college || "Preps-to-pros / international",
  };
}

function renderPuzzle(player, id) {
  const lines = ["  {", `    // Basketball-Reference career table + uniform history verified 2026-08-03.`, `    id: ${id},`, `    pathType: "team",`, `    answer: ${JSON.stringify(player.answer)},`];
  const awards = CONFIG_BY_NAME[player.answer]?.awards ?? (player.answer === "Channing Frye" ? [{ franchise: "CLE", year: 2015, type: "champion" }] : []);
  if (awards.length) lines.push(`    accolades: ["${awards.length}× NBA champion"],`);
  lines.push("    stints: [");
  player.stints.forEach((s) => {
    lines.push("      {", `        franchise: "${s.franchise}",`, `        displayTeam: ${JSON.stringify(s.displayTeam)},`, `        startYear: ${s.startYear},`, `        endYear: ${s.endYear},`, `        gp: ${s.gp},`, `        mpg: ${s.mpg.toFixed(1)},`, `        ppg: ${s.ppg.toFixed(1)},`, `        rpg: ${s.rpg.toFixed(1)},`, `        apg: ${s.apg.toFixed(1)},`, `        jerseyNumber: ${s.jerseyNumber},`);
    const stintAwards = awards.filter((award) => award.franchise === s.franchise && award.year >= s.startYear && award.year <= s.endYear);
    if (stintAwards.length) lines.push(`        accolades: [{ type: "champion", count: ${stintAwards.length} }],`);
    lines.push("      },");
  });
  const order = player.stints.map((_, i) => i).sort((a, b) => player.stints[a].gp - player.stints[b].gp);
  const draftFranchise = player.stints[0].franchise;
  const draftIndex = order.findIndex((i) => player.stints[i].franchise === draftFranchise);
  if (draftIndex >= 0) order.push(...order.splice(draftIndex, 1));
  lines.push("    ],", `    revealOrder: [${order.join(", ")}],`, "    hints: {", ...Object.entries(player.hints).map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`), "    },", "  },");
  return lines.join("\n");
}

await mkdir(OUT, { recursive: true });
const authored = [];
for (const [answer, brId] of PLAYERS) {
  const manual = CONFIG_BY_NAME[answer];
  if (manual?.stints) {
    authored.push({ answer, brId, hints: manual.hints, stints: manual.stints });
    continue;
  }
  if (manual?.espnId) {
    const rows = await espnRows(manual.espnId);
    const stints = groupRows(rows, manual.jerseyHistory).map((group) => finishGroup(group));
    authored.push({ answer, brId, hints: manual.hints, stints });
    continue;
  }
  const html = await page(brId);
  const uniformRows = uniforms(html);
  const stints = groupRows(seasonRows(html), uniformRows).map((group) => finishGroup(group));
  const derivedHints = bioHints(html);
  authored.push({ answer, brId, hints: { ...derivedHints, ...HINT_OVERRIDES[answer], ...CONFIG_BY_NAME[answer]?.hints }, stints });
}
await writeFile(`${OUT}/${OUTPUT_BASE}.json`, JSON.stringify({ source: "Basketball-Reference player pages", players: authored }, null, 2));
await writeFile(`${OUT}/${OUTPUT_BASE}.tsfrag`, authored.map((player, i) => renderPuzzle(player, START_ID + i)).join("\n") + "\n");
console.log(`Wrote ${authored.length} NBA puzzles in randomized schedule order.`);
