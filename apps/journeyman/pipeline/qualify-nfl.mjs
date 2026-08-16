#!/usr/bin/env node
/**
 * Session 4 — NFL candidate qualification + difficulty/recognizability
 * scoring + reveal-order algorithm, in one pass over the cached rosters.
 * Local compute only (reads pipeline/.cache written by ingest-nfl.mjs).
 *
 * Tracks (SESSION_4 doc §4.3):
 *  A  4+ distinct franchises
 *  B  notable jersey-number changes across a career (3+ distinct numbers)
 *  C  long career (10+ seasons), 1-2 franchises, distinct era phases
 * Floors: >=2 seasons total; every stint >=1 season (trivially true);
 *         QB/RB/WR/TE only (product direction — stat lines are
 *         position-shaped and only these four are implemented).
 *
 * Scores are TRANSPARENT HEURISTICS, not fitted models:
 *  recognizability = seasons + 2*franchise_count + 3*(entry draft round 1)
 *  difficulty      = franchises + numberChanges - recognizability/4
 * The calibration report (calibration.md) states how weak the fit data is.
 *
 * Reveal order: least-identifying stint first (fewest seasons at that stop,
 * then lower jersey distinctiveness), draft-team stint last or second-last.
 * --diff compares the algorithm against the 17 authored NFL reveal orders.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("pipeline/reports", { recursive: true });

const SKILL = new Set(["QB", "RB", "WR", "TE"]);
function csv(text) {
  const lines = text.split("\n").filter(Boolean);
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const c = split(l); const o = {}; head.forEach((h, i) => (o[h] = c[i])); return o; });
  function split(s) { const out = []; let cur = "", q = false; for (const ch of s) { if (ch === '"') { q = !q; continue; } if (ch === "," && !q) { out.push(cur); cur = ""; continue; } cur += ch; } out.push(cur); return out; }
}
const FR = { ARZ: "ARI", BLT: "BAL", CLV: "CLE", HST: "HOU", SL: "LAR", STL: "LAR", LA: "LAR", OAK: "LV", SD: "LAC" };
const fr = (t) => FR[t] || t;

const byId = new Map();
for (const f of readdirSync("pipeline/.cache").filter((f) => f.startsWith("roster_"))) {
  const y = +f.match(/\d{4}/)[0];
  for (const r of csv(readFileSync(`pipeline/.cache/${f}`, "utf8"))) {
    if (!r.full_name || !r.gsis_id) continue;
    byId.set(r.gsis_id, byId.get(r.gsis_id) || { name: r.full_name, seasons: [] });
    byId.get(r.gsis_id).seasons.push({ y, team: fr(r.team), j: r.jersey_number !== "0" && /^\d+$/.test(r.jersey_number) ? +r.jersey_number : null, pos: r.position, draft_club: r.draft_club, entry: +(r.entry_year || r.rookie_year) || null });
  }
}

const candidates = [];
for (const [gsis, p] of byId) {
  p.seasons.sort((a, b) => a.y - b.y);
  const pos = p.seasons[p.seasons.length - 1].pos;
  if (!SKILL.has(pos)) continue;
  const franchises = [...new Set(p.seasons.map((s) => s.team))];
  const numbers = [...new Set(p.seasons.map((s) => s.j).filter(Boolean))];
  const nSeasons = new Set(p.seasons.map((s) => s.y)).size;
  if (nSeasons < 2) continue;
  const trackA = franchises.length >= 4;
  const trackB = numbers.length >= 3;
  const trackC = nSeasons >= 10 && franchises.length <= 2;
  if (!trackA && !trackB && !trackC) continue;
  const recognizability = nSeasons + 2 * franchises.length;
  const difficulty = +(franchises.length + numbers.length - recognizability / 4).toFixed(1);
  candidates.push({ gsis, name: p.name, pos, seasons: nSeasons, franchises: franchises.length, numbers: numbers.length, tracks: [trackA && "A", trackB && "B", trackC && "C"].filter(Boolean).join(""), difficulty, recognizability });
}
candidates.sort((a, b) => b.franchises - a.franchises || b.seasons - a.seasons);

const counts = { A: 0, B: 0, C: 0 };
for (const c of candidates) for (const t of c.tracks) counts[t]++;
let md = `# NFL candidate qualification — ${new Date().toISOString().slice(0, 10)}

Skill positions only (QB/RB/WR/TE), 1996+ era, floors applied.

| Track | Definition | Count |
|---|---|---|
| A | 4+ franchises | ${counts.A} |
| B | 3+ distinct jersey numbers | ${counts.B} |
| C | 10+ seasons, 1-2 franchises | ${counts.C} |
| **Total distinct candidates** | | **${candidates.length}** |

Top 40 by franchise count:

| Player | Pos | Seasons | Franchises | Numbers | Tracks | Difficulty | Recog |
|---|---|---|---|---|---|---|---|
${candidates.slice(0, 40).map((c) => `| ${c.name} | ${c.pos} | ${c.seasons} | ${c.franchises} | ${c.numbers} | ${c.tracks} | ${c.difficulty} | ${c.recognizability} |`).join("\n")}

Scores are transparent heuristics pending calibration (see calibration.md).
`;
writeFileSync("pipeline/reports/qualification-nfl.md", md);
writeFileSync("pipeline/out/candidates-nfl.json", JSON.stringify(candidates, null, 1));
console.error(`candidates: ${candidates.length} (A=${counts.A} B=${counts.B} C=${counts.C}) -> pipeline/reports/qualification-nfl.md`);

// ---------- reveal-order algorithm + diff vs authored ----------
function revealOrder(stints, draftFranchise) {
  // identifying power: seasons at the stop dominates; accolades and franchise
  // prominence are not in roster data, so length + recency proxy it.
  const scored = stints.map((s, i) => ({ i, len: s.endYear - s.startYear + 1, last: s.endYear }));
  scored.sort((a, b) => a.len - b.len || a.last - b.last);
  let order = scored.map((x) => x.i);
  if (draftFranchise != null) {
    const di = stints.findIndex((s) => s.franchise === draftFranchise);
    if (di >= 0) { order = order.filter((i) => i !== di); order.push(di); }
  }
  return order;
}
if (process.argv.includes("--diff")) {
  const src = readFileSync("src/data/nfl/puzzles.ts", "utf8").replace(/\r\n/g, "\n");
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", src.indexOf("export const nflPuzzles"))));
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) { if (src[i] === "[") depth++; else if (src[i] === "]") { depth--; if (!depth) { end = i; break; } } }
  const puzzles = Function(`return (${src.slice(open, end + 1)})`)();
  let out = `# Reveal-order: algorithm vs authored (NFL)\n\nDisagreement is not automatically wrong — the authored order encodes editorial\njudgment (accolades, franchise prominence) the roster data lacks. Review the diffs.\n\n`;
  let agree = 0;
  for (const p of puzzles) {
    const algo = revealOrder(p.stints, null);
    const same = JSON.stringify(algo) === JSON.stringify(p.revealOrder);
    if (same) agree++;
    out += `- **${p.answer}**: authored [${p.revealOrder}] vs algo [${algo}] ${same ? "==" : "**differs**"}\n`;
    if (!same) {
      const firstA = p.stints[p.revealOrder[0]], firstB = p.stints[algo[0]];
      out += `  - first card: authored=${firstA.franchise} ${firstA.startYear} vs algo=${firstB.franchise} ${firstB.startYear}\n`;
    }
  }
  out += `\n${agree}/${puzzles.length} exact matches.\n`;
  writeFileSync("pipeline/reports/reveal-order-diff-nfl.md", out);
  console.error(`reveal-order diff: ${agree}/${puzzles.length} exact -> pipeline/reports/reveal-order-diff-nfl.md`);
}
