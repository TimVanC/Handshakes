#!/usr/bin/env node
/** Safely append one generated NFL batch after screening every local schedule surface. */
import fs from "node:fs";

const [jsonPath, fragmentPath] = process.argv.slice(2);
if (!jsonPath || !fragmentPath) throw new Error("usage: node pipeline/import-nfl-batch.mjs batch.json batch.tsfrag");
const batch = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const fragment = fs.readFileSync(fragmentPath, "utf8").trimEnd();
const puzzlePath = "src/data/nfl/puzzles.ts";
const rosterPath = "src/data/nfl/roster.ts";
const schedulePaths = ["pipeline/out/scheduled_puzzles.sql", "pipeline/out/priority_queue.sql"];
const puzzleSource = fs.readFileSync(puzzlePath, "utf8");
const rosterSource = fs.readFileSync(rosterPath, "utf8");
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Screen against ACTIVE puzzle answers only — wishlist names in roster.ts are
// exactly the names a batch is expected to fulfill (same semantics as
// import-nba-batch.mjs).
const activeAnswers = new Set([...puzzleSource.matchAll(/^    answer: "([^"]+)",/gm)].map((match) => normalize(match[1])));
const duplicates = batch.puzzles.map((puzzle) => puzzle.answer).filter((answer) => activeAnswers.has(normalize(answer)));
if (duplicates.length) throw new Error(`duplicate-screen failed: ${duplicates.join(", ")}`);

const activeEnd = /\r?\n\];\r?\n\r?\n\/\*\*\r?\n \* Benched/;
if (!activeEnd.test(puzzleSource)) throw new Error("active NFL puzzle insertion marker not found");
fs.writeFileSync(puzzlePath, puzzleSource.replace(activeEnd, `\n${fragment}\n];\n\n/**\n * Benched`));

const rosterEnd = rosterSource.lastIndexOf("\n];");
if (rosterEnd < 0) throw new Error("NFL roster insertion marker not found");
const rosterNames = new Set([...rosterSource.matchAll(/^\s+"([^"]+)",/gm)].map((match) => normalize(match[1])));
const rosterLines = batch.puzzles.map((puzzle) => puzzle.answer).filter((answer) => !rosterNames.has(normalize(answer))).map((answer) => `  ${JSON.stringify(answer)},`).join("\n");
const rosterAddition = `  // ---- duplicate-screened, randomized and authored 2026-08-03 ----\n${rosterLines}`;
fs.writeFileSync(rosterPath, `${rosterSource.slice(0, rosterEnd)}\n${rosterAddition}${rosterSource.slice(rosterEnd)}`);
console.log(`Imported ${batch.puzzles.length} duplicate-screened NFL puzzles.`);
