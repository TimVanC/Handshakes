#!/usr/bin/env node
/**
 * Rebuild the roster-driven NBA schedule from frozen aired history followed
 * by every currently authored future puzzle, with no wishlist holes.
 */
import fs from "node:fs";
import { puzzles } from "../src/data/puzzles.ts";

const aired = [
  "Shareef Abdur-Rahim",
  "Zach Randolph",
  "Lou Williams",
  "Marcus Camby",
  "Antawn Jamison",
  "Vince Carter",
  "Manu Ginóbili",
  "Robert Horry",
  "Baron Davis",
  "Matt Barnes",
  "Chauncey Billups",
  "Jamal Crawford",
  "Ish Smith",
  "Moses Malone",
  "Joe Johnson",
  "Chucky Brown",
  "Tracy McGrady",
  "Shawn Marion",
  "Kobe Bryant",
  "Allen Iverson",
];

const future = puzzles.slice(20).map((puzzle) => puzzle.answer);
const roster = [...aired, ...future];
const key = (name) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const duplicate = roster.find((name, index) => roster.findIndex((candidate) => key(candidate) === key(name)) !== index);
if (duplicate) throw new Error(`duplicate NBA schedule entry: ${duplicate}`);

const lines = roster.map((name, index) => `  ${JSON.stringify(name)},${index === 19 ? " // last frozen aired day (2026-08-03)" : ""}`).join("\n");
const source = `/**
 * Production NBA schedule. Days 1–20 are frozen aired history; every later
 * entry is an authored puzzle in uninterrupted release order.
 */
export const ROSTER: string[] = [
${lines}
];

/** case/accent-insensitive comparison key */
export function rosterKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
`;
fs.writeFileSync("src/data/roster.ts", source);
console.log(`NBA roster rebuilt: ${aired.length} frozen + ${future.length} future = ${roster.length} days.`);
