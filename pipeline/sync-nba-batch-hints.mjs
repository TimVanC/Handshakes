#!/usr/bin/env node
/** Mechanically sync regenerated hint fields for an already-imported NBA batch. */
import fs from "node:fs";

const jsonPath = process.argv[2];
if (!jsonPath) throw new Error("usage: node pipeline/sync-nba-batch-hints.mjs batch.json");
const players = JSON.parse(fs.readFileSync(jsonPath, "utf8")).players;
const path = "src/data/puzzles.ts";
let source = fs.readFileSync(path, "utf8");
for (const player of players) {
  const answerAt = source.indexOf(`answer: ${JSON.stringify(player.answer)}`);
  if (answerAt < 0) throw new Error(`missing imported puzzle: ${player.answer}`);
  const nextAnswer = source.indexOf("answer: ", answerAt + 8);
  const blockEnd = nextAnswer < 0 ? source.length : nextAnswer;
  const block = source.slice(answerAt, blockEnd);
  const replacement = `position: ${JSON.stringify(player.hints.position)},`;
  if (!/position: "[^"]*",/.test(block)) throw new Error(`missing position hint: ${player.answer}`);
  source = source.slice(0, answerAt) + block.replace(/position: "[^"]*",/, replacement) + source.slice(blockEnd);
}
fs.writeFileSync(path, source);
console.log(`Synced ${players.length} NBA position hints.`);
