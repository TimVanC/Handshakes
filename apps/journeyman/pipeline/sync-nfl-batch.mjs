#!/usr/bin/env node
/** Replace an already-imported final NFL batch with its latest generated fragment. */
import fs from "node:fs";

const [jsonPath, fragmentPath] = process.argv.slice(2);
if (!jsonPath || !fragmentPath) throw new Error("usage: node pipeline/sync-nfl-batch.mjs batch.json batch.tsfrag");
const batch = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const fragment = fs.readFileSync(fragmentPath, "utf8").trimEnd();
const path = "src/data/nfl/puzzles.ts";
const source = fs.readFileSync(path, "utf8");
const firstAnswer = batch.puzzles[0]?.answer;
const answerAt = source.indexOf(`answer: ${JSON.stringify(firstAnswer)}`);
if (answerAt < 0) throw new Error(`imported batch start not found: ${firstAnswer}`);
const start = source.lastIndexOf("\n  {", answerAt);
const activeEndMatch = /\r?\n\];\r?\n\r?\n\/\*\*\r?\n \* Benched/g;
activeEndMatch.lastIndex = answerAt;
const endMatch = activeEndMatch.exec(source);
if (start < 0 || !endMatch) throw new Error("imported NFL batch boundaries not found");
fs.writeFileSync(path, `${source.slice(0, start + 1)}${fragment}${source.slice(endMatch.index)}`);
console.log(`Synchronized ${batch.puzzles.length} generated NFL puzzles.`);
