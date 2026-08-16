#!/usr/bin/env node
/** Replace already-imported NBA puzzle objects from a regenerated fragment. */
import fs from "node:fs";

const fragmentPath = process.argv[2];
if (!fragmentPath) throw new Error("usage: node pipeline/sync-nba-batch.mjs batch.tsfrag");
const path = "src/data/puzzles.ts";
let source = fs.readFileSync(path, "utf8");
const fragment = fs.readFileSync(fragmentPath, "utf8");

function objectAround(text, answerAt) {
  const marker = text.lastIndexOf("\n  {", answerAt);
  const start = marker >= 0 ? marker + 1 : (text.startsWith("  {") ? 0 : -1);
  if (start < 0) throw new Error("puzzle object start not found");
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}" && --depth === 0) {
      const end = text[i + 1] === "," ? i + 2 : i + 1;
      return { start, end, value: text.slice(start, end) };
    }
  }
  throw new Error("puzzle object end not found");
}

const answers = [...fragment.matchAll(/^    answer: "([^"]+)",/gm)].map((match) => match[1]);
for (const answer of answers) {
  const token = `answer: ${JSON.stringify(answer)}`;
  const fromAt = fragment.indexOf(token);
  const toAt = source.indexOf(token);
  if (fromAt < 0 || toAt < 0) throw new Error(`missing puzzle: ${answer}`);
  const generated = objectAround(fragment, fromAt);
  const current = objectAround(source, toAt);
  source = source.slice(0, current.start) + generated.value + source.slice(current.end);
}
fs.writeFileSync(path, source);
console.log(`Synced ${answers.length} regenerated NBA puzzles.`);
