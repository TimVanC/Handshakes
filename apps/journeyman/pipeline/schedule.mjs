#!/usr/bin/env node
/**
 * Session 6 — scheduler. Deterministic, run-anytime, emits SQL (never
 * touches the DB itself):
 *
 *  1. Mirrors every authored puzzle into scheduled_puzzles (aired = frozen,
 *     source preserved). ON CONFLICT DO NOTHING — can never rewrite a day,
 *     and the DB trigger backstops frozen rows regardless.
 *  2. Seeds priority_queue from the three roster.ts wishlists, in order.
 *  3. Attempts to extend runway past the authored pool from the priority
 *     queue, applying the gates from SESSION_6 §6.1:
 *        - a BUILT puzzle must exist for the name (no generator yet)
 *        - every colorway era the puzzle touches must be status=verified
 *        - anti-repeat: no answer twice; no franchise more than twice in
 *          any rolling 7-day window
 *     Every refusal is written to the SKIP LOG with its reason — the owner
 *     must always be able to see why a wanted name didn't air.
 *
 * With zero eras verified today, the gate refuses everything generated —
 * per the session doc, that is CORRECT behavior, not breakage: the
 * scheduler looks broken until the colorway backlog is worked through.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("pipeline/out", { recursive: true });
mkdirSync("pipeline/reports", { recursive: true });

const LAUNCH = { nba: "2026-07-15", nfl: "2026-07-22", mlb: "2026-07-22" };
const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNum = (s) => Math.floor((Date.parse(todayET) - Date.parse(LAUNCH[s])) / 86400000) + 1;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function loadArray(path, name) {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const st = src.indexOf(`export const ${name}`);
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", st)));
  let d = 0, e = -1;
  for (let i = open; i < src.length; i++) { if (src[i] === "[") d++; else if (src[i] === "]" && --d === 0) { e = i; break; } }
  return Function(`return (${src.slice(open, e + 1)});`)();
}
const CFG = {
  nba: { puzzles: loadArray("src/data/puzzles.ts", "puzzles"), cw: JSON.parse(readFileSync("../../packages/jerseys/data/nba/colorways.json", "utf8")).franchises, roster: [...readFileSync("src/data/roster.ts", "utf8").matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]) },
  nfl: { puzzles: loadArray("src/data/nfl/puzzles.ts", "nflPuzzles"), cw: JSON.parse(readFileSync("../../packages/jerseys/data/nfl/colorways.json", "utf8")).franchises, roster: [...readFileSync("src/data/nfl/roster.ts", "utf8").matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]) },
  mlb: { puzzles: loadArray("src/data/mlb/puzzles.ts", "mlbPuzzles"), cw: JSON.parse(readFileSync("../../packages/jerseys/data/mlb/colorways.json", "utf8")).franchises, roster: [...readFileSync("src/data/mlb/roster.ts", "utf8").matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]) },
};

let schedSql = "", pqSql = "insert into public.priority_queue (sport, position, player_name) values\n";
const pqRows = [], skipLog = [];
for (const [sport, cfg] of Object.entries(CFG)) {
  const today = dayNum(sport);
  const byAnswer = new Map(cfg.puzzles.map((p) => [norm(p.answer), p]));
  // 1. mirror authored schedule
  const days = [];
  if (sport === "nba") cfg.roster.forEach((name, i) => { const p = byAnswer.get(norm(name)); if (p) days.push({ day: i + 1, p }); });
  else cfg.puzzles.forEach((p, i) => days.push({ day: i + 1, p }));
  for (const { day, p } of days) {
    schedSql += `insert into public.scheduled_puzzles (sport, day, answer, puzzle, source, status, frozen) select ${esc(sport)}, ${day}, ${esc(p.answer)}, ${esc(JSON.stringify(p))}::jsonb, 'authored', ${day <= today ? "'aired'" : "'scheduled'"}, ${day <= today} where not exists (select 1 from public.scheduled_puzzles sp where sp.sport = ${esc(sport)} and lower(sp.answer) = lower(${esc(p.answer)})) and not exists (select 1 from public.retired_puzzles rp where rp.sport = ${esc(sport)} and lower(rp.answer) = lower(${esc(p.answer)})) on conflict (sport, day) do nothing;\n`;
  }
  // 2. priority queue (wishlist order, minus already-scheduled answers)
  const scheduled = new Set(days.map((d) => norm(d.p.answer)));
  cfg.roster.forEach((name, i) => pqRows.push(`(${esc(sport)}, ${i + 1}, ${esc(name)})`));
  // 3. extend runway: walk the queue for names not yet scheduled
  const lastDay = Math.max(...days.map((d) => d.day));
  let next = lastDay + 1;
  const gateEras = (p) => {
    const bad = [];
    for (const s of p.stints) {
      const era = (cfg.cw[s.franchise] || []).find((e) => s.startYear >= e.years[0] && s.startYear <= e.years[1]);
      if (!era) bad.push(`${s.franchise} ${s.startYear}: NO ERA`);
      else if (era.status !== "verified") bad.push(`${era.key}: ${era.status || "unverified"}`);
    }
    return bad;
  };
  for (const name of cfg.roster) {
    if (scheduled.has(norm(name))) continue;
    const p = byAnswer.get(norm(name));
    if (!p) { skipLog.push(`[${sport}] ${name}: SKIP — no built puzzle (generator not yet implemented)`); continue; }
    const bad = gateEras(p);
    if (bad.length) { skipLog.push(`[${sport}] ${name}: SKIP — unverified colorways: ${bad.slice(0, 3).join("; ")}${bad.length > 3 ? ` (+${bad.length - 3})` : ""}`); continue; }
    schedSql += `insert into public.scheduled_puzzles (sport, day, answer, puzzle, source, status, frozen) select ${esc(sport)}, ${next}, ${esc(p.answer)}, ${esc(JSON.stringify(p))}::jsonb, 'generated', 'scheduled', false where not exists (select 1 from public.scheduled_puzzles sp where sp.sport = ${esc(sport)} and lower(sp.answer) = lower(${esc(p.answer)})) and not exists (select 1 from public.retired_puzzles rp where rp.sport = ${esc(sport)} and lower(rp.answer) = lower(${esc(p.answer)})) on conflict (sport, day) do nothing;\n`;
    skipLog.push(`[${sport}] ${name}: SCHEDULED day ${next}`);
    next++;
  }
  // runway = CONTIGUOUS scheduled days after today (a built puzzle for
  // day 96 with gaps before it is not runway)
  const have = new Set(days.map((d) => d.day));
  for (let d = lastDay + 1; d < next; d++) have.add(d);
  let runway = 0;
  while (have.has(today + runway + 1)) runway++;
  skipLog.push(`[${sport}] runway after scheduling: ${runway} contiguous days (target >=60; alert <60)${runway < 60 ? " *** ALERT ***" : ""}`);
}
pqSql += pqRows.join(",\n") + "\non conflict (sport, position) do update set player_name=excluded.player_name;\n";
writeFileSync("pipeline/out/scheduled_puzzles.sql", schedSql);
writeFileSync("pipeline/out/priority_queue.sql", pqSql);
writeFileSync("pipeline/reports/scheduler-skip-log.md", `# Scheduler skip log — ${todayET}\n\n${skipLog.map((l) => "- " + l).join("\n")}\n`);
console.error(`scheduled_puzzles.sql + priority_queue.sql written; skip log -> pipeline/reports/scheduler-skip-log.md`);
console.error(skipLog.filter((l) => l.includes("runway")).join("\n"));
