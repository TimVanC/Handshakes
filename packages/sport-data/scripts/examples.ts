/**
 * Curated example puzzles for the demo bar (localhost / vercel.app hosts).
 * Same shape as the daily table so the app treats them identically; par and
 * canonical paths come from the solver, never by hand.
 *
 * Run: npm run examples --workspace packages/sport-data
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, sharedTeamSeasons, type TeammateGraph } from "../src/graph";
import { countOptimalPaths, degreeRanking, par, shortestPath } from "../src/solver";
import type { SportDataset } from "../src/types";

const SPORT = "nba";
const PAIRS: [string, string][] = [
  ["LeBron James", "Larry Bird"],
  ["Stephen Curry", "Magic Johnson"],
  ["Giannis Antetokounmpo", "Hakeem Olajuwon"],
  ["Shai Gilgeous-Alexander", "Gary Payton"],
  ["Ja Morant", "Reggie Miller"],
];

const here = dirname(fileURLToPath(import.meta.url));
const dataset: SportDataset = JSON.parse(readFileSync(join(here, "..", "data", `${SPORT}.json`), "utf-8"));
const graph = buildGraph(dataset);
const byName = new Map(dataset.players.map((p) => [p.full_name, p]));
const hubs = new Set(degreeRanking(graph).slice(0, 50).map((r) => r.playerId));

function pathLinks(g: TeammateGraph, path: string[]): string[] {
  return path.slice(0, -1).map((a, i) => {
    const shared = sharedTeamSeasons(g, a, path[i + 1]);
    return [...shared].sort(
      (x, y) => (g.teamSeasons.get(x)?.season ?? 0) - (g.teamSeasons.get(y)?.season ?? 0)
    )[0];
  });
}

const examples = PAIRS.map(([a, b], i) => {
  const pa = byName.get(a), pb = byName.get(b);
  if (!pa || !pb) throw new Error(`missing player: ${!pa ? a : b}`);
  const p = par(graph, pa.id, pb.id);
  if (p === null) throw new Error(`${a} → ${b}: unreachable`);
  const hubFree = par(graph, pa.id, pb.id, { excluded: hubs });
  const path = (hubFree === p ? shortestPath(graph, pa.id, pb.id, { excluded: hubs }) : shortestPath(graph, pa.id, pb.id))!;
  const count = countOptimalPaths(graph, pa.id, pb.id)!.count;
  console.log(`#${i + 1} ${a} → ${b}: par ${p}, ${count} routes | ${path.map((id) => graph.players.get(id)!.full_name).join(" > ")}`);
  return {
    day: i + 1,
    sport: SPORT,
    start_id: pa.id,
    target_id: pb.id,
    par: p,
    solution_count: count,
    tier: count <= 10 ? "hard" : count <= 60 ? "medium" : "easy",
    era_spread: Math.abs(pa.last_season - pb.first_season),
    canonical_path: path,
    canonical_links: pathLinks(graph, path),
  };
});

const outDir = join(here, "..", "..", "..", "apps", "handshakes", "src", "data");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `examples.${SPORT}.json`), JSON.stringify({ sport: SPORT, examples }));
console.log(`wrote ${examples.length} examples`);
