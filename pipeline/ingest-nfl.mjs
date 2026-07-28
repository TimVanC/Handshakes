#!/usr/bin/env node
/**
 * Session 4 — NFL ingest. Normalizes nflverse season rosters (1996+) and the
 * nfldata games feed into the pipeline tables (players / stints /
 * franchise_seasons), plus slim source_records provenance rows.
 *
 * WHY 1996: nflverse jersey_number is placeholder `0` before 1996
 * (docs/data-sources.md §1). A `0` is treated as MISSING everywhere here.
 *
 * Identity: keyed on gsis_id end to end. Names are display only — two
 * different "Adrian Peterson"s share a display name, and nflverse's
 * "Mike Vick" ≠ the index's "Michael Vick" (docs/data-sources.md §4).
 *
 * Idempotent: every write is an upsert on a natural key; a second run
 * produces updates-in-place, never duplicates. Run with --emit-sql to write
 * chunked INSERT ... ON CONFLICT statements to pipeline/out/ instead of
 * hitting the network — the mode used for review and for MCP-driven loads.
 *
 *   node pipeline/ingest-nfl.mjs --emit-sql [--since 1996] [--min-franchises 4]
 *
 * Cache: raw CSVs land in pipeline/.cache/ (gitignored) so re-runs are
 * offline. Sources: nflverse-data releases (rosters), nflverse/nfldata
 * games.csv. Both CC-BY-4.0 — in-app attribution required before any of
 * this data ships to players (docs/data-sources.md §5).
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(Boolean));
const SINCE = +(args.since || 1996);
const MINFR = +(args["min-franchises"] || 4);
const THISYEAR = 2025; // latest completed season
const CACHE = "pipeline/.cache";
mkdirSync(CACHE, { recursive: true });
mkdirSync("pipeline/out", { recursive: true });

function fetchCached(name, url) {
  const p = `${CACHE}/${name}`;
  if (!existsSync(p)) {
    console.error("fetch", name);
    execSync(`curl -sSL -o "${p}" "${url}"`, { stdio: ["ignore", "ignore", "inherit"] });
  }
  return readFileSync(p, "utf8");
}
function csv(text) {
  const lines = text.split("\n").filter(Boolean);
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const c = split(l); const o = {};
    head.forEach((h, i) => (o[h] = c[i]));
    return o;
  });
  function split(s) {
    const out = []; let cur = "", q = false;
    for (const ch of s) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur); return out;
  }
}
const esc = (s) => s == null || s === "" ? "null" : "'" + String(s).replace(/'/g, "''") + "'";

// ---------- 1. rosters -> players + stints ----------
const byId = new Map(); // gsis -> {name, seasons: [{year, team, jersey, pos, height, college, entry, draft_number, draft_club}]}
for (let y = SINCE; y <= THISYEAR; y++) {
  const rows = csv(fetchCached(`roster_${y}.csv`, `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${y}.csv`));
  for (const r of rows) {
    const id = r.gsis_id || `noid|${r.full_name}|${r.birth_date}`;
    if (!r.full_name) continue;
    if (!byId.has(id)) byId.set(id, { name: r.full_name, seasons: [] });
    const j = /^\d+$/.test(r.jersey_number) && r.jersey_number !== "0" ? +r.jersey_number : null;
    byId.get(id).seasons.push({ year: y, team: r.team, jersey: j, pos: r.position, height: r.height, college: r.college, entry: r.entry_year || r.rookie_year, draft_number: r.draft_number, draft_club: r.draft_club });
  }
}
// era team code -> modern franchise code (colorways key space)
const FR = { ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", SL: "LAR", STL: "LAR", LA: "LAR", OAK: "LV", SD: "LAC", RAM: "LAR", RAI: "LV" };
const fr = (t) => FR[t] || t;

const players = [], stints = [];
for (const [gsis, p] of byId) {
  p.seasons.sort((a, b) => a.year - b.year);
  const franchises = new Set(p.seasons.map((s) => fr(s.team)));
  if (franchises.size < MINFR) continue;
  const last = p.seasons[p.seasons.length - 1];
  players.push({
    name: p.name, gsis,
    pos: last.pos, height: last.height, college: last.college,
    entry: +last.entry || null, draft: last.draft_number ? `Round ?, #${last.draft_number}` : null,
    first: p.seasons[0].year, lastY: last.year,
  });
  // contiguous same-franchise runs -> stints
  let cur = null;
  for (const s of p.seasons) {
    const f = fr(s.team);
    if (cur && cur.franchise === f && s.year <= cur.end_year + 1) {
      cur.end_year = s.year;
      cur.jerseys.push({ year: s.year, number: s.jersey });
    } else {
      if (cur) stints.push(cur);
      cur = { gsis, franchise: f, start_year: s.year, end_year: s.year, jerseys: [{ year: s.year, number: s.jersey }] };
    }
  }
  if (cur) stints.push(cur);
}
console.error(`players (>=${MINFR} franchises since ${SINCE}): ${players.length}, stints: ${stints.length}`);

// ---------- 2. games.csv -> franchise_seasons ----------
const games = csv(fetchCached("games.csv", "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"));
const fsAcc = {}; // fr|year -> {w,l,t,deep,po,fw}
const RANK = { WC: 1, DIV: 2, CON: 3, SB: 4 }, PO = { 1: "WC", 2: "DIV", 3: "CONF", 4: "SB" };
for (const g of games) {
  const y = +g.season; if (y < SINCE || !g.home_score) continue;
  for (const side of [["away_team", "away_score", "home_score"], ["home_team", "home_score", "away_score"]]) {
    const code = fr(g[side[0]]), my = +g[side[1]], op = +g[side[2]];
    if (Number.isNaN(my)) continue;
    const k = `${code}|${y}`;
    fsAcc[k] ??= { w: 0, l: 0, t: 0, deep: 0, po: "", fw: null };
    const a = fsAcc[k];
    if (g.game_type === "REG") { my > op ? a.w++ : my < op ? a.l++ : a.t++; }
    else if (RANK[g.game_type] && RANK[g.game_type] > a.deep) {
      a.deep = RANK[g.game_type]; a.po = PO[a.deep];
      if (g.game_type === "SB") a.fw = my > op ? 1 : 0;
    }
  }
}

// ---------- 3. emit chunked idempotent SQL ----------
const files = [];
function emit(name, header, rows, chunk = 150) {
  for (let i = 0; i < rows.length; i += chunk) {
    const f = `pipeline/out/${name}_${String(files.filter((x) => x.startsWith(name)).length + 1).padStart(3, "0")}.sql`;
    writeFileSync(f, header + "\n" + rows.slice(i, i + chunk).join(",\n") + "\n" + FOOT[name] + "\n");
    files.push(f.split("/").pop());
  }
}
const FOOT = {
  players: `on conflict (sport, canonical_name) do update set aliases=excluded.aliases, position=excluded.position, height=excluded.height, college=excluded.college, first_year=excluded.first_year, last_year=excluded.last_year, source_ids=excluded.source_ids;`,
  stints: `on conflict (player_id, franchise, start_year) do update set end_year=excluded.end_year, jersey_numbers=excluded.jersey_numbers;`,
  fseasons: `on conflict (sport, franchise, year) do update set w=excluded.w, l=excluded.l, t=excluded.t, po=excluded.po, fw=excluded.fw;`,
};
emit("players", "insert into public.players (sport, canonical_name, aliases, position, height, college, first_year, last_year, source_ids) values",
  players.map((p) => `('nfl', ${esc(p.name)}, '{}', ${esc(p.pos)}, ${esc(p.height)}, ${esc(p.college)}, ${p.first}, ${p.lastY}, jsonb_build_object('gsis', ${esc(p.gsis)}))`));
emit("stints", "insert into public.stints (player_id, franchise, start_year, end_year, jersey_numbers) select p.id, v.franchise, v.sy, v.ey, v.jn::jsonb from (values",
  stints.map((s) => `(${esc(s.gsis)}, ${esc(s.franchise)}, ${s.start_year}, ${s.end_year}, ${esc(JSON.stringify(s.jerseys))})`),
  120);
// stints need the join footer instead:
FOOT.stints = `) as v(gsis, franchise, sy, ey, jn) join public.players p on p.sport='nfl' and p.source_ids->>'gsis' = v.gsis ` + FOOT.stints;
// re-emit stints with corrected footer (overwrite)
{
  const stRows = stints.map((s) => `(${esc(s.gsis)}, ${esc(s.franchise)}, ${s.start_year}, ${s.end_year}, ${esc(JSON.stringify(s.jerseys))})`);
  let n = 0;
  for (let i = 0; i < stRows.length; i += 120) {
    n++;
    writeFileSync(`pipeline/out/stints_${String(n).padStart(3, "0")}.sql`,
      "insert into public.stints (player_id, franchise, start_year, end_year, jersey_numbers) select p.id, v.franchise, v.sy, v.ey, v.jn::jsonb from (values\n" +
      stRows.slice(i, i + 120).join(",\n") + "\n" + FOOT.stints);
  }
}
emit("fseasons", "insert into public.franchise_seasons (sport, franchise, year, w, l, t, po, fw) values",
  Object.entries(fsAcc).map(([k, a]) => { const [f, y] = k.split("|"); return `('nfl', ${esc(f)}, ${y}, ${a.w}, ${a.l}, ${a.t || "null"}, '${a.po}', ${a.fw ?? "null"})`; }));
writeFileSync("pipeline/out/source_records.sql",
  `insert into public.source_records (source, record_key, payload) values ('nflverse-rosters', 'ingest-${SINCE}-${THISYEAR}', ${esc(JSON.stringify({ players: players.length, stints: stints.length, since: SINCE, minFranchises: MINFR, at: new Date().toISOString() }))}) on conflict (source, record_key) do update set payload=excluded.payload, fetched_at=now();\n`);
console.error("SQL written to pipeline/out/ — apply in filename order (players -> stints -> fseasons).");
