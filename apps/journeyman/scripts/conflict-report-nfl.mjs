#!/usr/bin/env node
/**
 * Session 5 — cross-source conflict report (NFL). Compares every authored
 * NFL puzzle stint against nflverse season rosters (pipeline/.cache):
 * jersey number and year-range occupancy. Conflicts BLOCK scheduling for
 * that player (Session 6 reads this report's JSON twin); they are surfaced,
 * never auto-resolved (SESSION_5 §5.1).
 *
 * Match key is player+season (franchise codes differ across sources), so a
 * multi-team season confirms the number was worn that year, not which team.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("pipeline/reports", { recursive: true });
function csv(t) { const L = t.split("\n").filter(Boolean); const h = sp(L[0]); return L.slice(1).map((l) => { const c = sp(l); const o = {}; h.forEach((k, i) => (o[k] = c[i])); return o; }); function sp(s) { const o = []; let c = "", q = false; for (const ch of s) { if (ch === '"') { q = !q; continue; } if (ch === "," && !q) { o.push(c); c = ""; continue; } c += ch; } o.push(c); return o; } }
function loadArray(path, name) { const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n"); const st = src.indexOf(`export const ${name}`); const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", st))); let d = 0, e = -1; for (let i = open; i < src.length; i++) { if (src[i] === "[") d++; else if (src[i] === "]" && --d === 0) { e = i; break; } } return Function(`return (${src.slice(open, e + 1)});`)(); }

const seen = new Map(); // name|year -> Set(numbers)
for (const f of readdirSync("pipeline/.cache").filter((f) => f.startsWith("roster_"))) {
  const y = +f.match(/\d{4}/)[0];
  for (const r of csv(readFileSync(`pipeline/.cache/${f}`, "utf8"))) {
    if (!r.full_name || r.jersey_number === "0" || !/^\d+$/.test(r.jersey_number)) continue;
    const k = `${r.full_name.toLowerCase()}|${y}`;
    (seen.get(k) || seen.set(k, new Set()).get(k)).add(+r.jersey_number);
  }
}
const puzzles = loadArray("src/data/nfl/puzzles.ts", "nflPuzzles");
const rows = [];
let conflicts = 0;
for (const p of puzzles) {
  for (const s of p.stints) {
    let status = "no-data", found = [];
    for (let y = s.startYear; y <= s.endYear; y++) {
      const nums = seen.get(`${p.answer.toLowerCase()}|${y}`);
      if (!nums) continue;
      found.push(`${y}:[${[...nums]}]`);
      if (nums.has(s.jerseyNumber)) status = "match";
      else if (status !== "match") status = "CONFLICT";
    }
    if (status === "CONFLICT") conflicts++;
    rows.push(`| ${p.answer} | ${s.franchise} ${s.startYear}-${s.endYear} | #${s.jerseyNumber} | ${status} | ${found.join(" ") || "—"} |`);
  }
}
const md = `# NFL cross-source conflict report — jerseys vs nflverse rosters\n\n${conflicts} conflicts. Conflicted players are unschedulable until resolved by a human.\n\n| Player | Stint | Authored | Verdict | Source saw |\n|---|---|---|---|---|\n${rows.join("\n")}\n`;
writeFileSync("pipeline/reports/conflict-nfl.md", md);
console.error(`${rows.length} stints checked, ${conflicts} conflicts -> pipeline/reports/conflict-nfl.md`);
process.exit(0);
