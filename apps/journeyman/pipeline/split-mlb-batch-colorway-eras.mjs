#!/usr/bin/env node
/** Split colorway records touched by a batch at renderer construction boundaries. */
import fs from "node:fs";

const batchPath = process.argv[2];
if (!batchPath) throw new Error("usage: node pipeline/split-mlb-batch-colorway-eras.mjs batch.json");
const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const colorwayPath = "src/data/mlb/colorways.json";
const db = JSON.parse(fs.readFileSync(colorwayPath, "utf8"));
const touched = new Set();
for (const puzzle of batch.puzzles) for (const stint of puzzle.stints) {
  const era = db.franchises[stint.franchise]?.find((candidate) =>
    stint.startYear >= candidate.years[0] && stint.startYear <= candidate.years[1]);
  if (!era) throw new Error(`no colorway for ${puzzle.answer}: ${stint.franchise} ${stint.startYear}`);
  touched.add(era.key);
}

const boundaries = [1972, 1987, 2006];
const styleFor = (year) => year < 1972 ? "flannel" : year < 1987 ? "pullover" : year < 2006 ? "buttoned" : "modern";
let splitCount = 0;
for (const [franchise, eras] of Object.entries(db.franchises)) {
  const replacements = [];
  for (const era of eras) {
    if (!touched.has(era.key)) { replacements.push(era); continue; }
    const cuts = boundaries.filter((year) => year > era.years[0] && year <= era.years[1]);
    const starts = [era.years[0], ...cuts];
    const ends = [...cuts.map((year) => year - 1), era.years[1]];
    if (!cuts.length && era.eraStyle === styleFor(era.years[0])) { replacements.push(era); continue; }
    splitCount += cuts.length;
    for (let index = 0; index < starts.length; index++) {
      const start = starts[index];
      const clone = { ...era, key: index === 0 ? era.key : `${franchise}_${start}`, years: [start, ends[index]], eraStyle: styleFor(start) };
      replacements.push(clone);
    }
  }
  const keys = replacements.map((era) => era.key);
  if (new Set(keys).size !== keys.length) throw new Error(`${franchise}: split created a duplicate colorway key`);
  db.franchises[franchise] = replacements;
}
fs.writeFileSync(colorwayPath, JSON.stringify(db, null, 1) + "\n");
console.log(`Split ${splitCount} touched colorway renderer boundaries.`);
