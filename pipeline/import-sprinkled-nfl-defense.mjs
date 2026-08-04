#!/usr/bin/env node
/** Preserve aired NFL days, then evenly sprinkle a randomized defensive batch. */
import fs from "node:fs";

const [configPath, jsonPath, fragmentPath] = process.argv.slice(2);
if (!configPath || !jsonPath || !fragmentPath) {
  throw new Error("usage: node pipeline/import-sprinkled-nfl-defense.mjs config.json batch.json batch.tsfrag");
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const batch = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const puzzlePath = "src/data/nfl/puzzles.ts";
const rosterPath = "src/data/nfl/roster.ts";
const schedulePaths = ["pipeline/out/scheduled_puzzles.sql", "pipeline/out/priority_queue.sql"];
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const puzzleSource = fs.readFileSync(puzzlePath, "utf8").replace(/\r\n/g, "\n");
const rosterSource = fs.readFileSync(rosterPath, "utf8").replace(/\r\n/g, "\n");
const scheduleSource = schedulePaths.map((path) => fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "").join("\n");
const existing = normalize(`${puzzleSource}\n${rosterSource}\n${scheduleSource}`);
const duplicates = batch.puzzles.map((puzzle) => puzzle.answer).filter((answer) => existing.includes(normalize(answer)));
if (duplicates.length) throw new Error(`duplicate-screen failed: ${duplicates.join(", ")}`);

function objectsFrom(source) {
  const lines = source.replace(/^\n+|\n+$/g, "").split("\n");
  const objects = [];
  let current = null;
  for (const line of lines) {
    if (line === "  {") {
      if (current) throw new Error("nested top-level puzzle start");
      current = [line];
    } else if (current) {
      current.push(line);
      if (line === "  },") { objects.push(current.join("\n")); current = null; }
    } else if (line.trim()) {
      throw new Error(`unexpected text between puzzles: ${line}`);
    }
  }
  if (current) throw new Error("unterminated puzzle object");
  return objects;
}

const declaration = "export const nflPuzzles: Puzzle[] = [\n";
const bodyStart = puzzleSource.indexOf(declaration) + declaration.length;
const closeMarker = "\n];\n\n/**\n * Benched";
const bodyEnd = puzzleSource.indexOf(closeMarker, bodyStart);
if (bodyStart < declaration.length || bodyEnd < 0) throw new Error("active NFL array markers not found");
const current = objectsFrom(puzzleSource.slice(bodyStart, bodyEnd));
const defenders = objectsFrom(fs.readFileSync(fragmentPath, "utf8").replace(/\r\n/g, "\n"));
if (current.length !== 61 || defenders.length !== 9 || config.offenseCountsBefore?.length !== defenders.length) {
  throw new Error(`unexpected schedule sizes: current=${current.length}, defenders=${defenders.length}`);
}

const aired = current.slice(0, 13);
const upcomingOffense = current.slice(13);
const upcoming = [];
for (let offenseCount = 0; offenseCount <= upcomingOffense.length; offenseCount++) {
  config.offenseCountsBefore.forEach((target, index) => {
    if (target === offenseCount) upcoming.push(defenders[index]);
  });
  if (offenseCount < upcomingOffense.length) upcoming.push(upcomingOffense[offenseCount]);
}
const finalObjects = [...aired, ...upcoming];
const answerOf = (object) => object.match(/^    answer: (.+),$/m)?.[1] ? JSON.parse(object.match(/^    answer: (.+),$/m)[1]) : null;
const defenseNames = new Set(batch.puzzles.map((puzzle) => puzzle.answer));
let run = 0, maxRun = 0;
for (const object of finalObjects) {
  run = defenseNames.has(answerOf(object)) ? run + 1 : 0;
  maxRun = Math.max(maxRun, run);
}
if (maxRun > 2) throw new Error(`defensive run constraint failed: ${maxRun}`);

const rebuilt = `${puzzleSource.slice(0, bodyStart)}${finalObjects.join("\n")}\n${puzzleSource.slice(bodyEnd + 1)}`;
fs.writeFileSync(puzzlePath, rebuilt);

const rosterEnd = rosterSource.lastIndexOf("\n];");
if (rosterEnd < 0) throw new Error("NFL roster insertion marker not found");
const rosterLines = batch.puzzles.map((puzzle) => `  ${JSON.stringify(puzzle.answer)},`).join("\n");
const rosterAddition = `  // ---- defensive batch: duplicate-screened, independently randomized, authored 2026-08-03 ----\n${rosterLines}`;
fs.writeFileSync(rosterPath, `${rosterSource.slice(0, rosterEnd)}\n${rosterAddition}${rosterSource.slice(rosterEnd)}`);

const positions = finalObjects.map(answerOf).flatMap((answer, index) => defenseNames.has(answer) ? [{ day: index + 1, answer }] : []);
fs.writeFileSync("pipeline/out/nfl-defense-schedule-2026-08-03.json", JSON.stringify({ maxConsecutiveDefenders: maxRun, positions }, null, 2) + "\n");
console.log(`Imported ${defenders.length} defenders at NFL days ${positions.map(({ day }) => day).join(", ")}; max consecutive defenders=${maxRun}.`);
