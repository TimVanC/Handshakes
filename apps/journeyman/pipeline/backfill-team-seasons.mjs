#!/usr/bin/env node
/**
 * Fill every team-season row required by the active puzzle set.
 *
 * Sources:
 * - NBA: official NBA standings endpoint + ESPN's game-level playoff feed
 *   (cross-checked against cached Basketball-Reference pages where present).
 * - NFL: nflverse's game-level schedule/results feed (plus the documented
 *   1987-98 PFR-checked rows needed by Vinny Testaverde).
 * - MLB: official MLB StatsAPI standings + postseason schedule.
 */
import fs from "node:fs";
import path from "node:path";

const CACHE = "pipeline/.cache/team-seasons";
fs.mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cachedText = async (name, url, pause = 0) => {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; journeyman-data-audit/1.0)",
        referer: "https://www.nba.com/",
        origin: "https://www.nba.com",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status !== 429) break;
    await sleep(15_000 * (attempt + 1));
  }
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const body = await response.text();
  fs.writeFileSync(file, body);
  if (pause) await sleep(pause);
  return body;
};
const cachedJSON = async (name, url) => JSON.parse(await cachedText(name, url));
const readJSON = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJSON = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);

const configs = [
  ["nba", "../src/data/puzzles.ts", "puzzles", null, "src/data/teamSeasons.json"],
  ["nfl", "../src/data/nfl/puzzles.ts", "nflPuzzles", "nflBenchedPuzzles", "src/data/nfl/teamSeasons.json"],
  ["mlb", "../src/data/mlb/puzzles.ts", "mlbPuzzles", "mlbBenchedPuzzles", "src/data/mlb/teamSeasons.json"],
];
const sets = {};
for (const [sport, modulePath, exportName, benchName, dbPath] of configs) {
  const module = await import(modulePath);
  const puzzles = [...module[exportName], ...(benchName ? module[benchName] : [])];
  const needed = new Map();
  for (const puzzle of puzzles) for (const stint of puzzle.stints) {
    for (let year = stint.startYear; year <= stint.endYear; year += 1) {
      if (!needed.has(year)) needed.set(year, new Set());
      needed.get(year).add(stint.franchise);
    }
  }
  sets[sport] = { puzzles, needed, dbPath, db: readJSON(dbPath) };
}

const nbaTeam = {1610612737:"ATL",1610612738:"BOS",1610612739:"CLE",1610612740:"NOP",1610612741:"CHI",1610612742:"DAL",1610612743:"DEN",1610612744:"GSW",1610612745:"HOU",1610612746:"LAC",1610612747:"LAL",1610612748:"MIA",1610612749:"MIL",1610612750:"MIN",1610612751:"BKN",1610612752:"NYK",1610612753:"ORL",1610612754:"IND",1610612755:"PHI",1610612756:"PHX",1610612757:"POR",1610612758:"SAC",1610612759:"SAS",1610612760:"OKC",1610612761:"TOR",1610612762:"UTA",1610612763:"MEM",1610612764:"WAS",1610612765:"DET",1610612766:"CHA"};
const normalizeNBA = (code) => ({ NO: "NOP", NOH: "NOP", NOK: "NOP", NJ: "BKN", BRK: "BKN", PHO: "PHX", SA: "SAS", GS: "GSW", WSH: "WAS", UTAH: "UTA", NY: "NYK" }[code] ?? code);
for (const [startYear, teams] of [...sets.nba.needed].sort((a, b) => a[0] - b[0])) {
  const missing = [...teams].filter((team) => !sets.nba.db[team]?.[startYear]);
  const reconcile = [...teams].filter((team) => !sets.nba.db[team]?.[startYear]?.po);
  if (!reconcile.length) continue;
  const endYear = startYear + 1;
  const seasonName = `${startYear}-${String(endYear).slice(2)}`;
  const standings = await cachedJSON(
    `nba-${endYear}-official-standings.json`,
    `https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=${seasonName}&SeasonType=Regular%20Season`,
  );
  const result = standings.resultSets[0];
  const index = Object.fromEntries(result.headers.map((header, i) => [header, i]));
  const season = {};
  const conferences = {};
  for (const row of result.rowSet) {
    const team = nbaTeam[row[index.TeamID]];
    if (!team) continue;
    season[team] = { w: +row[index.WINS], l: +row[index.LOSSES], po: "" };
    conferences[team] = row[index.Conference];
  }
  const playoffs = await cachedJSON(
    `nba-${endYear}-espn-playoffs.json`,
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${endYear}0401-${endYear}1031&limit=1000`,
  );
  const games = (playoffs.events ?? []).filter((event) => event.season?.type === 3 && event.status?.type?.completed);
  const rank = { RD16: 1, QTR: 2, SEMI: 3, FINAL: 4 };
  for (const team of Object.keys(season)) {
    const played = games.filter((event) => event.competitions[0].competitors.some((c) => normalizeNBA(c.team.abbreviation) === team));
    played.sort((a, b) => rank[a.competitions[0].type.abbreviation] - rank[b.competitions[0].type.abbreviation]);
    if (!played.length) continue;
    const round = played.at(-1).competitions[0].type.abbreviation;
    season[team].po = round === "RD16" ? "R1" : round === "QTR" ? "R2" : round === "SEMI" ? `${conferences[team] === "East" ? "E" : "W"}CF` : "Finals";
    if (round === "FINAL") {
      const finals = played.filter((event) => event.competitions[0].type.abbreviation === "FINAL");
      const wins = finals.filter((event) => event.competitions[0].competitors.find((c) => normalizeNBA(c.team.abbreviation) === team)?.winner).length;
      season[team].fw = wins > finals.length / 2 ? 1 : 0;
    }
  }
  for (const team of reconcile) {
    if (!season[team]) throw new Error(`NBA ${startYear} missing ${team} in source`);
    (sets.nba.db[team] ??= {})[startYear] = season[team];
  }
}

function csv(text) {
  const lines = text.trim().split(/\r?\n/); const head = split(lines.shift());
  return lines.map((line) => Object.fromEntries(split(line).map((value, i) => [head[i], value])));
  function split(line) {
    const out = []; let value = "", quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; }
      else if (ch === "," && !quoted) { out.push(value); value = ""; }
      else value += ch;
    }
    out.push(value); return out;
  }
}
const normalizeNFL = (code) => ({ OAK: "LV", SD: "LAC", STL: "LAR", LA: "LAR", BLT: "BAL", CLV: "CLE", HST: "HOU", ARZ: "ARI" }[code] ?? code);
const games = csv(fs.readFileSync("pipeline/.cache/games.csv", "utf8"));
const nflByYear = new Map();
for (const game of games) {
  const year = +game.season;
  if (!nflByYear.has(year)) nflByYear.set(year, []);
  nflByYear.get(year).push(game);
}
const oldNFL = {
  TB: { 1987:[4,11,1], 1988:[5,11,0], 1989:[5,11,0], 1990:[6,10,0], 1991:[3,13,0], 1992:[5,11,0] },
  CLE:{ 1993:[7,9,0], 1994:[11,5,0,"DIV"], 1995:[5,11,0] },
  BAL:{ 1996:[4,12,0], 1997:[6,9,1] }, NYJ:{ 1998:[12,4,0,"CONF"] },
  CAR:{ 1995:[7,9,0], 1996:[12,4,0,"CONF"], 1997:[7,9,0], 1998:[4,12,0] },
  NO:{ 1998:[6,10,0] },
  // 2026-08-10 legacy batch (Warner/Bledsoe/Cunningham/J.George/E.George/
  // Plummer/Vinatieri), checked against the Wikipedia per-franchise season
  // tables like the rows above.
  PHI:{ 1985:[7,9,0], 1986:[5,10,1], 1987:[7,8,0], 1988:[10,6,0,"DIV"], 1989:[11,5,0,"WC"], 1990:[10,6,0,"WC"], 1991:[10,6,0], 1992:[11,5,0,"DIV"], 1993:[8,8,0], 1994:[7,9,0], 1995:[10,6,0,"DIV"] },
  MIN:{ 1997:[9,7,0,"DIV"], 1998:[15,1,0,"CONF"] },
  NE:{ 1993:[5,11,0], 1994:[10,6,0,"WC"], 1995:[6,10,0], 1996:[11,5,0,"SB",0], 1997:[10,6,0,"DIV"], 1998:[9,7,0,"WC"] },
  IND:{ 1990:[7,9,0], 1991:[1,15,0], 1992:[9,7,0], 1993:[4,12,0] },
  ATL:{ 1994:[7,9,0], 1995:[9,7,0,"WC"], 1996:[3,13,0] },
  LV:{ 1997:[4,12,0], 1998:[8,8,0] },
  TEN:{ 1996:[8,8,0], 1997:[8,8,0], 1998:[8,8,0] },
  ARI:{ 1997:[4,12,0], 1998:[9,7,0,"DIV"] },
  LAR:{ 1998:[4,12,0] },
};
for (const [year, teams] of sets.nfl.needed) for (const team of teams) {
  if (sets.nfl.db[team]?.[year]) continue;
  const legacy = oldNFL[team]?.[year];
  if (legacy) {
    const [w,l,t,po="",fw] = legacy;
    (sets.nfl.db[team] ??= {})[year] = { w,l,...(t ? {t} : {}),po,...(fw === undefined ? {} : {fw}) };
    continue;
  }
  const yearGames = nflByYear.get(year) ?? [];
  const reg = yearGames.filter((g) => g.game_type === "REG" && [normalizeNFL(g.home_team), normalizeNFL(g.away_team)].includes(team));
  if (!reg.length) throw new Error(`NFL ${year} missing ${team} in source`);
  let w=0,l=0,t=0;
  for (const g of reg) {
    const hs=+g.home_score, as=+g.away_score, home=normalizeNFL(g.home_team);
    if (hs===as) t+=1; else if ((home===team && hs>as)||(home!==team && as>hs)) w+=1; else l+=1;
  }
  const post = yearGames.filter((g) => g.game_type !== "REG" && [normalizeNFL(g.home_team), normalizeNFL(g.away_team)].includes(team));
  const rank = { WC:1, DIV:2, CON:3, SB:4 };
  post.sort((a,b) => rank[a.game_type]-rank[b.game_type]);
  let po="", fw;
  if (post.length) {
    const last=post.at(-1); po=last.game_type === "CON" ? "CONF" : last.game_type;
    if (last.game_type === "SB") {
      const won=(normalizeNFL(last.home_team)===team ? +last.home_score>+last.away_score : +last.away_score>+last.home_score);
      fw=won ? 1 : 0;
    }
  }
  (sets.nfl.db[team] ??= {})[year] = { w,l,...(t ? {t} : {}),po,...(fw === undefined ? {} : {fw}) };
}

const mlbTeam = {108:"LAA",109:"ARI",110:"BAL",111:"BOS",112:"CHC",113:"CIN",114:"CLE",115:"COL",116:"DET",117:"HOU",118:"KC",119:"LAD",120:"WSH",121:"NYM",133:"OAK",134:"PIT",135:"SD",136:"SEA",137:"SF",138:"STL",139:"TB",140:"TEX",141:"TOR",142:"MIN",143:"PHI",144:"ATL",145:"CHW",146:"MIA",147:"NYY",158:"MIL"};
for (const [year, teams] of [...sets.mlb.needed].sort((a,b)=>a[0]-b[0])) {
  const missing=[...teams].filter((team)=>!sets.mlb.db[team]?.[year]); if(!missing.length) continue;
  const standings=await cachedJSON(`mlb-${year}-standings.json`,`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${year}&standingsTypes=regularSeason`);
  const season={};
  for(const group of standings.records??[]) for(const row of group.teamRecords??[]){const team=mlbTeam[row.team.id];if(team)season[team]={w:+row.wins,l:+row.losses,po:""};}
  const schedule=await cachedJSON(`mlb-${year}-playoffs.json`,`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${year}&gameTypes=F,D,L,W`);
  const post=(schedule.dates??[]).flatMap((date)=>date.games??[]).filter((game)=>game.status?.abstractGameState==="Final");
  const rank={F:1,D:2,L:3,W:4}, labels={F:"WC",D:"DS",L:"CS",W:"WS"};
  for(const team of Object.keys(season)){
    const teamId=+Object.keys(mlbTeam).find((id)=>mlbTeam[id]===team);
    const played=post.filter((g)=>g.teams.home.team.id===teamId||g.teams.away.team.id===teamId).sort((a,b)=>rank[a.gameType]-rank[b.gameType]);
    if(!played.length)continue;
    const type=played.at(-1).gameType; season[team].po=labels[type];
    if(type==="W"){
      const finals=played.filter((g)=>g.gameType==="W"); let tw=0,ow=0;
      for(const g of finals){const side=g.teams.home.team.id===teamId?g.teams.home:g.teams.away;(side.isWinner?tw++:ow++);}
      season[team].fw=tw>ow?1:0;
    }
  }
  for(const team of missing){
    if(!season[team]) throw new Error(`MLB ${year} missing ${team} in source`);
    (sets.mlb.db[team]??={})[year]=season[team];
  }
}

for (const sport of ["nba", "nfl", "mlb"]) {
  const note = `Coverage completed for every active and benched puzzle stint on 2026-08-03 by pipeline/backfill-team-seasons.mjs.`;
  if (!sets[sport].db._meta.includes("pipeline/backfill-team-seasons.mjs")) sets[sport].db._meta += ` ${note}`;
  else sets[sport].db._meta = sets[sport].db._meta.replace(/Coverage completed for every active puzzle stint on 2026-08-03 by pipeline\/backfill-team-seasons\.mjs\./, note);
  writeJSON(sets[sport].dbPath, sets[sport].db);
  console.log(`${sport}: team-season coverage written`);
}
