#!/usr/bin/env node
/** Remove one confirmed already-aired player from the unaired NBA array. */
import fs from "node:fs";

const answer = process.argv[2];
if (!answer) throw new Error("usage: node pipeline/remove-future-nba-duplicate.mjs 'Player Name'");

const path = "src/data/puzzles.ts";
const source = fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const declaration = "export const puzzles: Puzzle[] = [\n";
const bodyStart = source.indexOf(declaration) + declaration.length;
const bodyEnd = source.indexOf("\n];", bodyStart);
if (bodyStart < declaration.length || bodyEnd < 0) throw new Error("NBA puzzle array markers not found");

const body = source.slice(bodyStart, bodyEnd);
const lines = body.split("\n");
const answerLine = `    answer: ${JSON.stringify(answer)},`;
const matches = lines.flatMap((line, index) => line === answerLine ? [index] : []);
if (matches.length !== 1) throw new Error(`${answer}: expected one active match, found ${matches.length}`);
const answerIndex = matches[0];
let startLine = answerIndex;
while (startLine >= 0 && lines[startLine] !== "  {") startLine -= 1;
let endLine = answerIndex;
while (endLine < lines.length && lines[endLine] !== "  },") endLine += 1;
if (startLine < 0 || endLine >= lines.length) throw new Error(`${answer}: top-level object boundaries not found`);

const index = lines.slice(0, startLine).filter((line) => line === "  {").length;
const todayDay = 20; // 2026-08-03 from the NBA launch date 2026-07-15.
if (index + 1 <= todayDay) throw new Error(`${answer}: refusing to alter aired NBA day ${index + 1}`);

lines.splice(startLine, endLine - startLine + 1);
const rebuilt = `${source.slice(0, bodyStart)}${lines.join("\n")}${source.slice(bodyEnd)}`;
fs.writeFileSync(path, rebuilt);
console.log(`Removed duplicate future ${answer} from NBA day ${index + 1}; shifted later future cards forward.`);
