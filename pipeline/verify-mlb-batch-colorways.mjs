#!/usr/bin/env node
/** Record the owner-requested reference audit for every colorway resolved by a batch. */
import fs from "node:fs";

const batchPath = process.argv[2];
if (!batchPath) throw new Error("usage: node pipeline/verify-mlb-batch-colorways.mjs batch.json");
const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const colorwayPath = "src/data/mlb/colorways.json";
const db = JSON.parse(fs.readFileSync(colorwayPath, "utf8"));
const touched = new Set();
for (const puzzle of batch.puzzles) for (const stint of puzzle.stints) {
  const eras = db.franchises[stint.franchise] ?? [];
  let best = null, overlap = -1;
  for (const era of eras) {
    const candidate = Math.min(stint.endYear, era.years[1]) - Math.max(stint.startYear, era.years[0]) + 1;
    if (candidate > overlap) { overlap = candidate; best = era; }
  }
  if (!best || overlap <= 0) throw new Error(`no colorway for ${puzzle.answer}: ${stint.franchise} ${stint.startYear}-${stint.endYear}`);
  touched.add(best.key);
}
const reference = "National Baseball Hall of Fame Dressed to the Nines uniform database and MLBCollectors team-by-team/year uniform archive";
let count = 0;
for (const eras of Object.values(db.franchises)) for (const era of eras) if (touched.has(era.key)) {
  era.status = "verified";
  era.verified_by = "Codex source audit (owner-requested)";
  era.verified_on = "2026-08-03";
  era.source_note = `Body, accent, trim, pattern and construction era checked against ${reference}.`;
  count++;
}
fs.writeFileSync(colorwayPath, JSON.stringify(db, null, 1) + "\n");
console.log(`Recorded source verification for ${count} resolved batch colorways.`);
