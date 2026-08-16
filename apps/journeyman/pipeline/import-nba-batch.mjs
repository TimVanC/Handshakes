#!/usr/bin/env node
/** Append a generated NBA batch while allowing names already present only in the roster queue. */
import fs from "node:fs";

const [jsonPath, fragmentPath] = process.argv.slice(2);
if (!jsonPath || !fragmentPath) throw new Error("usage: node pipeline/import-nba-batch.mjs batch.json batch.tsfrag");

const batch = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const fragment = fs.readFileSync(fragmentPath, "utf8").trimEnd();
const puzzlePath = "src/data/puzzles.ts";
const rosterPath = "src/data/roster.ts";
const puzzleSource = fs.readFileSync(puzzlePath, "utf8");
const rosterSource = fs.readFileSync(rosterPath, "utf8");
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const activeAnswers = new Set([...puzzleSource.matchAll(/^    answer: "([^"]+)",/gm)].map((match) => normalize(match[1])));
const duplicates = batch.players.map((player) => player.answer).filter((answer) => activeAnswers.has(normalize(answer)));
if (duplicates.length) throw new Error(`active-puzzle duplicate screen failed: ${duplicates.join(", ")}`);

const puzzleEnd = puzzleSource.lastIndexOf("\n];");
if (puzzleEnd < 0) throw new Error("NBA puzzle insertion marker not found");
fs.writeFileSync(puzzlePath, `${puzzleSource.slice(0, puzzleEnd)}\n${fragment}${puzzleSource.slice(puzzleEnd)}`);

const rosterNames = new Set([...rosterSource.matchAll(/^\s+"([^"]+)",/gm)].map((match) => normalize(match[1])));
const missingRoster = batch.players.map((player) => player.answer).filter((answer) => !rosterNames.has(normalize(answer)));
const rosterEnd = rosterSource.lastIndexOf("\n];");
if (rosterEnd < 0) throw new Error("NBA roster insertion marker not found");
const rosterLines = missingRoster.map((answer) => `  ${JSON.stringify(answer)},`).join("\n");
const rosterAddition = `  // ---- duplicate-screened, randomized and authored 2026-08-03 ----\n${rosterLines}`;
fs.writeFileSync(rosterPath, `${rosterSource.slice(0, rosterEnd)}\n${rosterAddition}${rosterSource.slice(rosterEnd)}`);
console.log(`Imported ${batch.players.length} NBA puzzles; added ${missingRoster.length} missing roster names.`);
