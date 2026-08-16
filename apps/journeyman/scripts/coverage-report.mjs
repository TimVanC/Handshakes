#!/usr/bin/env node
/**
 * Session 5 — colorway coverage report. For every franchise-era the next 30
 * scheduled days would touch, print its verification status, ordered by how
 * soon the scheduler needs it. Includes the WCAG contrast check from
 * src/game/colorways.ts (ported: same math).
 *
 * NBA schedule = ROSTER names (built puzzles only air; unbuilt days fall
 * back and are listed as gaps). NFL/MLB = release order, cycling after the
 * pool ends (cycled days re-touch already-aired eras — listed but marked).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("pipeline/reports", { recursive: true });

const LAUNCH = { nba: "2026-07-15", nfl: "2026-07-22", mlb: "2026-07-22" };
const todayET = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNum = (s) => Math.floor((Date.parse(todayET) - Date.parse(LAUNCH[s])) / 86400000) + 1;
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function loadArray(path, name) {
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf(`export const ${name}`);
  const open = src.indexOf("[", src.indexOf("=", src.indexOf("]", start)));
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) { if (src[i] === "[") depth++; else if (src[i] === "]" && --depth === 0) { end = i; break; } }
  return Function(`return (${src.slice(open, end + 1)});`)();
}
const lum = (hex) => { const h = hex.replace("#", ""); const [r, g, b] = [0, 2, 4].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const CFG = {
  nba: ["src/data/puzzles.ts", "puzzles", "../../packages/jerseys/data/nba/colorways.json"],
  nfl: ["src/data/nfl/puzzles.ts", "nflPuzzles", "../../packages/jerseys/data/nfl/colorways.json"],
  mlb: ["src/data/mlb/puzzles.ts", "mlbPuzzles", "../../packages/jerseys/data/mlb/colorways.json"],
};
const HORIZON = 30;
let md = `# Colorway coverage — next ${HORIZON} days per sport (${todayET})\n\nOrdered by first day needed. The Session 6 scheduler hard-gates on status=verified.\n`;
for (const [sport, [pp, pn, cp]] of Object.entries(CFG)) {
  const puzzles = loadArray(pp, pn);
  const cw = JSON.parse(readFileSync(cp, "utf8")).franchises;
  const today = dayNum(sport);
  const need = new Map(); // eraKey -> {firstDay, status, cycled}
  const gaps = [];
  let roster = null;
  if (sport === "nba") roster = [...readFileSync("src/data/roster.ts", "utf8").matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]);
  for (let d = today + 1; d <= today + HORIZON; d++) {
    let p = null, cycled = false;
    if (sport === "nba") {
      const name = roster[d - 1];
      p = name ? puzzles.find((x) => norm(x.answer) === norm(name)) : null;
      if (name && !p) { gaps.push(`day ${d}: ${name} (no puzzle built)`); continue; }
      if (!name) { gaps.push(`day ${d}: past end of roster`); continue; }
    } else {
      cycled = d > puzzles.length;
      p = puzzles[(d - 1) % puzzles.length];
    }
    for (const s of p.stints) {
      const era = (cw[s.franchise] || []).find((e) => s.startYear >= e.years[0] && s.startYear <= e.years[1]);
      if (!era) { gaps.push(`day ${d}: NO ERA for ${s.franchise} ${s.startYear} (${p.answer})`); continue; }
      const k = `${s.franchise}/${era.key}`;
      if (!need.has(k)) need.set(k, { firstDay: d, status: era.status || "unverified", cycled, contrast: contrast(era.primary, era.secondary).toFixed(1), identity: era.identity });
    }
  }
  const rows = [...need.entries()].sort((a, b) => a[1].firstDay - b[1].firstDay);
  const un = rows.filter(([, v]) => v.status === "unverified").length;
  md += `\n## ${sport.toUpperCase()} — ${rows.length} eras touched, ${un} unverified\n\n| First day | Era | Identity | Status | P/S contrast |\n|---|---|---|---|---|\n`;
  for (const [k, v] of rows) md += `| ${v.firstDay}${v.cycled ? " (rerun)" : ""} | ${k} | ${v.identity} | ${v.status === "verified" ? "✅" : v.status === "probable" ? "🟡 probable" : "❌ unverified"} | ${v.contrast} |\n`;
  if (gaps.length) md += `\nGaps:\n${gaps.map((g) => `- ${g}`).join("\n")}\n`;
}
writeFileSync("pipeline/reports/colorway-coverage.md", md);
console.error("written pipeline/reports/colorway-coverage.md");
console.error(md.split("\n").filter((l) => l.startsWith("##")).join("\n"));
